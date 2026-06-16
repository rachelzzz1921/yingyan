"""
鹰眼 · L1 文档解析 Sidecar
----------------------------
POST /parse  —  PDF/图片 → 统一 layout JSON（含 bbox、表格、Markdown）
GET  /health —  引擎状态

引擎优先级（PPSTRUCTURE_MODE=auto）:
  1. ppstructure — PaddleOCR PP-StructureV3（最佳，需 install-paddle.sh）
  2. lite        — pdfplumber + PyMuPDF 渲染（数字 PDF / 开发默认可用）
  3. tesseract   — 扫描件 OCR（需 brew install tesseract tesseract-lang）
"""
from __future__ import annotations

import base64
import io
import os
import re
import tempfile
import time
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="Yingyan L1 Parser", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MODE = os.environ.get("PPSTRUCTURE_MODE", "auto").lower()
_pipeline = None
_paddle_ok = False

try:
    from paddleocr import PPStructureV3  # type: ignore

    _paddle_ok = True
except Exception:
    PPStructureV3 = None  # type: ignore


class ParseRequest(BaseModel):
    file_base64: str
    mime: str = "application/octet-stream"
    filename: str = "upload.bin"


class ParseResponse(BaseModel):
    ok: bool = True
    engine: str
    filename: str
    mime: str
    page_count: int = 0
    pages: list[dict[str, Any]] = Field(default_factory=list)
    markdown: str = ""
    plain_text: str = ""
    elapsed_ms: int = 0
    note: str = ""


def _get_pipeline():
    global _pipeline
    if not _paddle_ok:
        return None
    if _pipeline is None:
        _pipeline = PPStructureV3(
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
        )
    return _pipeline


def _norm_bbox(x0: float, y0: float, x1: float, y1: float) -> list[float]:
    x, y = min(x0, x1), min(y0, y1)
    w, h = abs(x1 - x0), abs(y1 - y0)
    return [round(x, 2), round(y, 2), round(w, 2), round(h, 2)]


def _decode_payload(req: ParseRequest) -> bytes:
    raw = req.file_base64
    if "," in raw[:80]:
        raw = raw.split(",", 1)[1]
    try:
        return base64.b64decode(raw)
    except Exception as e:
        raise HTTPException(400, f"base64 解码失败: {e}") from e


def _is_pdf(mime: str, name: str, data: bytes) -> bool:
    if "pdf" in (mime or "").lower() or name.lower().endswith(".pdf"):
        return True
    return data[:4] == b"%PDF"


def _is_image(mime: str, name: str) -> bool:
    if (mime or "").startswith("image/"):
        return True
    return bool(re.search(r"\.(jpe?g|png|webp|bmp|tiff?)$", name, re.I))


def _page_images(data: bytes, mime: str, filename: str) -> list[tuple[int, bytes, str]]:
    """Return list of (page_no, png_bytes, source_label)."""
    if _is_pdf(mime, filename, data):
        try:
            import fitz  # pymupdf

            doc = fitz.open(stream=data, filetype="pdf")
            out = []
            for i in range(len(doc)):
                pix = doc[i].get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                out.append((i + 1, pix.tobytes("png"), f"{filename}#p{i + 1}"))
            doc.close()
            return out
        except Exception:
            try:
                from pdf2image import convert_from_bytes  # type: ignore

                imgs = convert_from_bytes(data, dpi=200)
                return [(i + 1, _pil_to_png(im), f"{filename}#p{i + 1}") for i, im in enumerate(imgs)]
            except Exception as e:
                raise HTTPException(422, f"PDF 解析失败：{e}") from e
    if _is_image(mime, filename):
        return [(1, data, filename)]
    raise HTTPException(415, f"不支持的格式: {mime} / {filename}")


def _pil_to_png(im) -> bytes:
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


def _parse_ppstructure(page_images: list[tuple[int, bytes, str]]) -> ParseResponse:
    pipe = _get_pipeline()
    if pipe is None:
        raise RuntimeError("PP-StructureV3 未安装")
    pages_out: list[dict[str, Any]] = []
    md_parts: list[str] = []
    text_parts: list[str] = []
    for page_no, png, label in page_images:
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp.write(png)
            tmp_path = tmp.name
        try:
            result = pipe.predict(input=tmp_path)
        finally:
            os.unlink(tmp_path)
        blocks: list[dict[str, Any]] = []
        tables: list[dict[str, Any]] = []
        page_md: list[str] = []
        for item in result or []:
            if not isinstance(item, dict):
                continue
            res = item.get("res") if "res" in item else item
            if not isinstance(res, dict):
                continue
            bbox = res.get("bbox") or res.get("box") or item.get("bbox")
            text = res.get("text") or res.get("html") or item.get("text") or ""
            btype = (res.get("type") or item.get("type") or "text").lower()
            score = float(res.get("score") or item.get("score") or 0.92)
            if bbox and len(bbox) >= 4:
                bb = _norm_bbox(bbox[0], bbox[1], bbox[2], bbox[3])
            else:
                bb = None
            if btype == "table" or "<table" in str(text).lower():
                tables.append({"bbox": bb, "html": str(text), "score": score, "rows": _html_table_to_rows(str(text), page_no, label, bb)})
                page_md.append(str(text))
            else:
                blocks.append({"type": btype, "text": str(text).strip(), "bbox": bb, "score": score})
                if text:
                    page_md.append(str(text).strip())
                    text_parts.append(str(text).strip())
        pages_out.append({
            "page": page_no,
            "source": label,
            "width": None,
            "height": None,
            "blocks": blocks,
            "tables": tables,
            "words": [],
        })
        md_parts.append(f"\n\n--- Page {page_no} ---\n\n" + "\n\n".join(page_md))
    return ParseResponse(
        ok=True,
        engine="pp-structurev3",
        filename=page_images[0][2].split("#")[0] if page_images else "unknown",
        mime="application/pdf" if len(page_images) > 1 else "image/png",
        page_count=len(pages_out),
        pages=pages_out,
        markdown="".join(md_parts).strip(),
        plain_text="\n".join(text_parts).strip(),
    )


def _html_table_to_rows(html: str, page: int, doc: str, table_bbox) -> list[dict[str, Any]]:
    """Best-effort HTML table → row dicts with row-level bbox estimate."""
    rows: list[dict[str, Any]] = []
    tr_re = re.compile(r"<tr[^>]*>(.*?)</tr>", re.I | re.S)
    td_re = re.compile(r"<t[dh][^>]*>(.*?)</t[dh]>", re.I | re.S)
    for tr in tr_re.findall(html):
        cells = [re.sub(r"<[^>]+>", "", c).strip() for c in td_re.findall(tr)]
        cells = [c for c in cells if c]
        if not cells:
            continue
        rows.append({
            "cells": [{"text": c, "bbox": None, "score": 0.9} for c in cells],
            "bbox": table_bbox,
            "page": page,
            "doc": doc,
        })
    return rows


def _parse_lite_pdf(data: bytes, filename: str) -> ParseResponse:
    import pdfplumber

    pages_out: list[dict[str, Any]] = []
    md_parts: list[str] = []
    text_parts: list[str] = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for i, page in enumerate(pdf.pages):
            page_no = i + 1
            label = f"{filename}#p{page_no}"
            w, h = float(page.width), float(page.height)
            blocks: list[dict[str, Any]] = []
            tables: list[dict[str, Any]] = []
            words_raw = page.extract_words(use_text_flow=True, keep_blank_chars=False) or []
            words = [{
                "text": w.get("text", ""),
                "bbox": _norm_bbox(w["x0"], w["top"], w["x1"], w["bottom"]),
                "score": 0.95,
            } for w in words_raw if w.get("text")]
            for tbl in page.find_tables() or []:
                try:
                    extracted = tbl.extract() or []
                except Exception:
                    extracted = []
                tb = tbl.bbox
                tb_norm = _norm_bbox(tb[0], tb[1], tb[2], tb[3]) if tb else None
                row_objs = []
                for row in extracted:
                    if not row:
                        continue
                    cells = [{"text": str(c or "").strip(), "bbox": tb_norm, "score": 0.93} for c in row]
                    row_objs.append({"cells": cells, "bbox": tb_norm, "page": page_no, "doc": label})
                tables.append({"bbox": tb_norm, "rows": row_objs, "score": 0.93, "html": ""})
            text = page.extract_text() or ""
            if text.strip():
                blocks.append({"type": "text", "text": text.strip(), "bbox": [0, 0, w, h], "score": 0.9})
                text_parts.append(text.strip())
                md_parts.append(text.strip())
            pages_out.append({
                "page": page_no,
                "source": label,
                "width": w,
                "height": h,
                "blocks": blocks,
                "tables": tables,
                "words": words,
            })
    return ParseResponse(
        ok=True,
        engine="lite-pdfplumber",
        filename=filename,
        mime="application/pdf",
        page_count=len(pages_out),
        pages=pages_out,
        markdown="\n\n".join(md_parts),
        plain_text="\n\n".join(text_parts),
    )


def _parse_lite_image(data: bytes, filename: str, mime: str) -> ParseResponse:
    from PIL import Image

    im = Image.open(io.BytesIO(data))
    w, h = im.size
    blocks: list[dict[str, Any]] = []
    tables: list[dict[str, Any]] = []
    words: list[dict[str, Any]] = []
    text = ""
    engine = "lite-image"
    try:
        import pytesseract  # type: ignore
        from pytesseract import Output

        data_dict = pytesseract.image_to_data(im, lang="chi_sim+eng", output_type=Output.DICT)
        lines: dict[tuple[int, int, int], list[str]] = {}
        n = len(data_dict["text"])
        for i in range(n):
            txt = (data_dict["text"][i] or "").strip()
            if not txt:
                continue
            conf = float(data_dict["conf"][i])
            if conf < 0:
                continue
            x, y, bw, bh = data_dict["left"][i], data_dict["top"][i], data_dict["width"][i], data_dict["height"][i]
            bb = _norm_bbox(x, y, x + bw, y + bh)
            words.append({"text": txt, "bbox": bb, "score": round(conf / 100, 3)})
            key = (data_dict["block_num"][i], data_dict["par_num"][i], data_dict["line_num"][i])
            lines.setdefault(key, []).append(txt)
        text = "\n".join("".join(v) for v in lines.values())
        if text.strip():
            blocks.append({"type": "text", "text": text.strip(), "bbox": [0, 0, w, h], "score": 0.85})
        engine = "tesseract-ocr"
    except Exception:
        blocks.append({"type": "image", "text": "", "bbox": [0, 0, w, h], "score": 0.5})
    return ParseResponse(
        ok=True,
        engine=engine,
        filename=filename,
        mime=mime,
        page_count=1,
        pages=[{
            "page": 1,
            "source": filename,
            "width": w,
            "height": h,
            "blocks": blocks,
            "tables": tables,
            "words": words,
        }],
        markdown=text,
        plain_text=text,
        note="" if engine == "tesseract-ocr" else "扫描图 OCR 需安装 tesseract（brew install tesseract tesseract-lang）",
    )


def _choose_engine() -> str:
    if MODE == "ppstructure" and _paddle_ok:
        return "ppstructure"
    if MODE == "lite":
        return "lite"
    if MODE == "ppstructure" and not _paddle_ok:
        return "lite"
    return "ppstructure" if _paddle_ok else "lite"


@app.get("/health")
def health():
    tess = False
    try:
        import pytesseract  # noqa: F401

        tess = True
    except Exception:
        pass
    return {
        "ok": True,
        "mode": MODE,
        "paddle_available": _paddle_ok,
        "tesseract_available": tess,
        "recommended_engine": _choose_engine(),
        "version": "1.0.0",
    }


@app.post("/parse", response_model=ParseResponse)
def parse_doc(req: ParseRequest):
    t0 = time.time()
    data = _decode_payload(req)
    filename = req.filename or "upload.bin"
    mime = req.mime or "application/octet-stream"
    engine = _choose_engine()

    try:
        if _is_pdf(mime, filename, data):
            if engine == "ppstructure":
                page_images = _page_images(data, mime, filename)
                resp = _parse_ppstructure(page_images)
            else:
                resp = _parse_lite_pdf(data, filename)
        elif _is_image(mime, filename):
            if engine == "ppstructure":
                page_images = [(1, data, filename)]
                resp = _parse_ppstructure(page_images)
            else:
                resp = _parse_lite_image(data, filename, mime)
        else:
            raise HTTPException(415, f"不支持: {mime}")
        resp.filename = filename
        resp.mime = mime
        resp.elapsed_ms = int((time.time() - t0) * 1000)
        return resp
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e)) from e
