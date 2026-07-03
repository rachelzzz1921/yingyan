#!/usr/bin/env python3
"""生成鹰眼材料导入演示 PDF（虚构数据，供 L1 自动识别 demo）。"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "prototype/data/intake_samples"
CASE_JSON = ROOT / "prototype/data/case_NSCLC/medical_record.json"


def main() -> None:
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.cidfonts import UnicodeCIDFont
        from reportlab.platypus import (
            Paragraph,
            SimpleDocTemplate,
            Spacer,
            Table,
            TableStyle,
        )
    except ImportError:
        import subprocess

        subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "reportlab"])
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.cidfonts import UnicodeCIDFont
        from reportlab.platypus import (
            Paragraph,
            SimpleDocTemplate,
            Spacer,
            Table,
            TableStyle,
        )

    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
    data = json.loads(CASE_JSON.read_text(encoding="utf-8"))
    fp = data["front_page"]
    fees = data["fee_list"]["items"]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / "鹰眼演示-住院费用清单-王建国.pdf"

    doc = SimpleDocTemplate(
        str(out_path),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title="住院费用清单",
        author="鹰眼演示",
    )
    styles = getSampleStyleSheet()
    title = ParagraphStyle(
        "title",
        parent=styles["Heading1"],
        fontName="STSong-Light",
        fontSize=16,
        leading=20,
        alignment=1,
        spaceAfter=6,
    )
    sub = ParagraphStyle(
        "sub",
        parent=styles["Normal"],
        fontName="STSong-Light",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#555555"),
        alignment=1,
        spaceAfter=10,
    )
    body = ParagraphStyle(
        "body",
        parent=styles["Normal"],
        fontName="STSong-Light",
        fontSize=10,
        leading=14,
    )
    small = ParagraphStyle(
        "small",
        parent=styles["Normal"],
        fontName="STSong-Light",
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#666666"),
    )

    story = []
    story.append(Paragraph("住院费用清单（医保结算明细）", title))
    story.append(
        Paragraph(
            f"{fp['hospital']} · 肿瘤内科 · 结算日期 {data['fee_list']['settle_date']} · 演示虚构数据",
            sub,
        )
    )

    story.append(
        Paragraph(
            f"<b>患者姓名</b>：{fp['patient_name']} &nbsp;&nbsp; "
            f"<b>性别</b>：{fp['sex']} &nbsp;&nbsp; <b>年龄</b>：{fp['age']}岁<br/>"
            f"<b>住院号</b>：{fp['admission_no']} &nbsp;&nbsp; "
            f"<b>入院</b>：{fp['admit_time']} &nbsp;&nbsp; <b>出院</b>：{fp['discharge_time']}<br/>"
            f"<b>主诊断</b>：{fp['principal_diagnosis']['name']}（{fp['principal_diagnosis']['icd10']}） &nbsp;&nbsp; "
            f"<b>住院天数</b>：{fp['actual_inpatient_days']}天",
            body,
        )
    )
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph("费用明细", body))
    story.append(Spacer(1, 3 * mm))

    header = ["行号", "收费日期", "类别", "项目名称", "数量", "单位", "单价", "金额", "医保"]
    rows = [header]
    for it in fees:
        rows.append(
            [
                str(it["line_no"]),
                str(it["fee_date"]),
                str(it["category"]),
                str(it["item_name"]),
                str(it["qty"]),
                str(it["unit"]),
                f"{it['unit_price']:.2f}",
                f"{it['amount']:.2f}",
                str(it["insurance_class"]),
            ]
        )
    rows.append(["", "", "", "合计", "", "", "", f"{data['fee_list']['total_amount']:.2f}", ""])

    fee_table = Table(
        rows,
        colWidths=[10 * mm, 24 * mm, 16 * mm, 48 * mm, 10 * mm, 10 * mm, 14 * mm, 16 * mm, 14 * mm],
        repeatRows=1,
    )
    fee_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), "STSong-Light"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#cbd5e1")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#f8fafc")]),
                ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#ecfdf5")),
                ("ALIGN", (0, 0), (0, -1), "CENTER"),
                ("ALIGN", (4, 0), (7, -1), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 3),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    story.append(fee_table)
    story.append(Spacer(1, 6 * mm))
    story.append(
        Paragraph(
            "备注：本 PDF 为鹰眼稽核演示虚构材料，患者/机构信息均为虚构。"
            "拖入 http://localhost:3700/intake.html 可演示 L1 自动识别为「费用清单」并解析表格行。",
            small,
        )
    )

    doc.build(story)
    print(f"✅ 已生成: {out_path}")
    print(f"   共 {len(fees)} 条费用行 · 合计 ¥{data['fee_list']['total_amount']:.2f}")


if __name__ == "__main__":
    main()
