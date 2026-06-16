#!/usr/bin/env python3
"""Generate synthetic fee-list PNG + PDF for intake/OCR bbox E2E."""
from __future__ import annotations

import os
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print('pip install pillow', file=sys.stderr)
    sys.exit(1)

ROOT = os.path.join(os.path.dirname(__file__), '..', 'prototype', 'data', 'intake_samples')
PNG = os.path.join(ROOT, 'fee_list_demo.png')
PDF = os.path.join(ROOT, 'fee_list_demo.pdf')

HEADERS = ['项目名称', '数量', '单价', '金额']
ROWS = [
    ['奥希替尼片 80mg', '1', '4704.00', '4704.00'],
    ['人血白蛋白 10g', '2', '640.00', '1280.00'],
    ['Ⅰ级护理', '7', '65.00', '455.00'],
]
COL_W = [320, 80, 120, 120]
W, H = 720, 320


def _fonts():
    try:
        f = ImageFont.truetype('/System/Library/Fonts/PingFang.ttc', 22)
        sm = ImageFont.truetype('/System/Library/Fonts/PingFang.ttc', 18)
        return f, sm
    except OSError:
        d = ImageFont.load_default()
        return d, d


def draw_table(draw, font, font_sm, y0: int) -> None:
    x = 20
    for i, hd in enumerate(HEADERS):
        draw.rectangle([x, y0, x + COL_W[i] - 4, y0 + 32], outline='#94a3b8', fill='#f1f5f9')
        draw.text((x + 8, y0 + 6), hd, fill='#0f172a', font=font_sm)
        x += COL_W[i]
    y = y0 + 36
    for row in ROWS:
        x = 20
        for i, cell in enumerate(row):
            draw.rectangle([x, y, x + COL_W[i] - 4, y + 36], outline='#cbd5e1', fill='white')
            draw.text((x + 8, y + 8), cell, fill='#1e293b', font=font_sm)
            x += COL_W[i]
        y += 40


def write_png() -> None:
    font, font_sm = _fonts()
    img = Image.new('RGB', (W, H), 'white')
    draw = ImageDraw.Draw(img)
    draw.text((20, 12), '住院费用清单（演示）', fill='#0B2A4A', font=font)
    draw_table(draw, font, font_sm, 52)
    img.save(PNG, 'PNG')
    print('wrote', os.path.abspath(PNG))


def write_pdf() -> None:
    try:
        import fitz
    except ImportError:
        print('skip PDF (no pymupdf)', file=sys.stderr)
        return
    doc = fitz.open()
    page = doc.new_page(width=W, height=H)
    page.insert_text((20, 28), '住院费用清单（演示）', fontsize=14, fontname='china-s')
    y0 = 52
    x = 20
    for hd in HEADERS:
        rect = fitz.Rect(x, y0, x + COL_W[0] if hd == HEADERS[0] else x + COL_W[HEADERS.index(hd)], y0 + 32)
        # simplified: draw grid with insert_text
        page.draw_rect(rect, color=(0.58, 0.64, 0.72), width=0.5)
        page.insert_text((x + 8, y0 + 8), hd, fontsize=11, fontname='china-s')
        x += COL_W[HEADERS.index(hd)]
    y = y0 + 36
    for row in ROWS:
        x = 20
        for i, cell in enumerate(row):
            cw = COL_W[i]
            page.draw_rect(fitz.Rect(x, y, x + cw - 4, y + 36), color=(0.8, 0.84, 0.88), width=0.5)
            page.insert_text((x + 8, y + 10), cell, fontsize=11, fontname='china-s')
            x += cw
        y += 40
    doc.save(PDF)
    doc.close()
    print('wrote', os.path.abspath(PDF))


def main() -> None:
    os.makedirs(ROOT, exist_ok=True)
    write_png()
    write_pdf()


if __name__ == '__main__':
    main()
