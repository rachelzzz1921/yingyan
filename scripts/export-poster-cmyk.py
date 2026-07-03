#!/usr/bin/env python3
"""Export rollup SVG to print-ready CMYK TIFF at 150 DPI (80×180 cm)."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    import cairosvg
except ImportError as exc:
    raise SystemExit("Install cairosvg: pip install cairosvg") from exc

from PIL import Image, ImageCms

# 80 cm × 180 cm @ 150 DPI → 4724 × 10630 px (aspect 1 : 2.25)
WIDTH_CM = 80
HEIGHT_CM = 180
DPI = 150
PX_W = round(WIDTH_CM / 2.54 * DPI)
PX_H = round(HEIGHT_CM / 2.54 * DPI)

SRGB_ICC = Path("/System/Library/ColorSync/Profiles/sRGB Profile.icc")
CMYK_ICC = Path("/System/Library/ColorSync/Profiles/Generic CMYK Profile.icc")


def rgb_to_cmyk_tiff(rgb_path: Path, cmyk_path: Path) -> None:
    rgb = Image.open(rgb_path).convert("RGB")
    if SRGB_ICC.is_file() and CMYK_ICC.is_file():
        cmyk = ImageCms.profileToProfile(
            rgb,
            str(SRGB_ICC),
            str(CMYK_ICC),
            outputMode="CMYK",
            renderingIntent=ImageCms.Intent.RELATIVE_COLORIMETRIC,
        )
    else:
        cmyk = rgb.convert("CMYK")
    cmyk.save(
        cmyk_path,
        format="TIFF",
        compression="tiff_lzw",
        dpi=(DPI, DPI),
    )


def export_pdf(svg_path: Path, out_dir: Path, stem: str | None = None) -> Path:
    """Vector PDF at SVG physical size (80×180 cm) — sharp for print."""
    import shutil
    import subprocess

    svg_path = svg_path.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    base = stem or svg_path.stem
    pdf_path = out_dir / f"{base}-80x180cm.pdf"
    rsvg = shutil.which("rsvg-convert")
    if not rsvg:
        raise SystemExit("rsvg-convert not found; install: brew install librsvg")
    subprocess.run([rsvg, "-f", "pdf", str(svg_path), "-o", str(pdf_path)], check=True)
    return pdf_path


def export_svg(svg_path: Path, out_dir: Path, stem: str | None = None) -> tuple[Path, Path]:
    svg_path = svg_path.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    base = stem or svg_path.stem
    rgb_path = out_dir / f"{base}-80x180cm-150dpi-rgb.png"
    cmyk_path = out_dir / f"{base}-80x180cm-150dpi-cmyk.tiff"

    cairosvg.svg2png(
        url=str(svg_path),
        write_to=str(rgb_path),
        output_width=PX_W,
        output_height=PX_H,
    )

    rgb_to_cmyk_tiff(rgb_path, cmyk_path)
    return rgb_path, cmyk_path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "svg",
        nargs="?",
        default="assets/posters/yingyan-eagleeye-rollup-v5.svg",
        help="Input SVG path",
    )
    parser.add_argument(
        "-o",
        "--out-dir",
        default="assets/posters",
        help="Output directory",
    )
    parser.add_argument(
        "--pdf",
        action="store_true",
        help="Also export vector PDF (recommended for print sharpness)",
    )
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[1]
    svg = (repo / args.svg).resolve() if not Path(args.svg).is_absolute() else Path(args.svg)
    out_dir = (repo / args.out_dir).resolve() if not Path(args.out_dir).is_absolute() else Path(args.out_dir)

    if not svg.is_file():
        raise SystemExit(f"SVG not found: {svg}")

    rgb_path, cmyk_path = export_svg(svg, out_dir)
    print(f"Size: {PX_W} × {PX_H} px @ {DPI} DPI ({WIDTH_CM}×{HEIGHT_CM} cm)")
    print(f"RGB preview: {rgb_path}")
    print(f"CMYK print:  {cmyk_path}")
    if args.pdf:
        pdf_path = export_pdf(svg, out_dir)
        print(f"Vector PDF:  {pdf_path}")


if __name__ == "__main__":
    main()
