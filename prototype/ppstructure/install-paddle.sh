#!/usr/bin/env bash
# 安装 PP-StructureV3 完整能力（CPU 版；需 Python 3.10–3.12，3.14 暂无 wheel）
set -euo pipefail
cd "$(dirname "$0")"

PY=
for cand in python3.12 python3.11 python3.10 python3; do
  if command -v "$cand" >/dev/null 2>&1; then
    ver=$("$cand" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
    major=${ver%%.*}
    minor=${ver#*.}
    if [[ "$major" -eq 3 && "$minor" -le 12 ]]; then PY=$cand; break; fi
  fi
done
if [[ -z "$PY" ]]; then
  echo "⚠ 未找到 Python ≤3.12，跳过 Paddle 安装。sidecar 将使用 lite+tesseract 模式。"
  echo "  macOS 可: brew install python@3.12 && PY=python3.12 bash install-paddle.sh"
  exit 0
fi

if [[ ! -d .venv ]] || ! .venv/bin/python -c 'import sys; exit(0 if sys.version_info.minor<=12 else 1)' 2>/dev/null; then
  rm -rf .venv
  "$PY" -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt
pip install "paddlepaddle>=3.0.0" "paddleocr[doc-parser]>=3.0.0" pdf2image pytesseract 2>/dev/null || {
  echo "⚠ Paddle 安装失败，保留 lite+tesseract。启动: bash run.sh"
  pip install pytesseract pdf2image 2>/dev/null || true
  exit 0
}
echo "✓ Paddle 已安装（$("$PY" --version)）。macOS 还需: brew install poppler tesseract tesseract-lang"
echo "  启动: bash run.sh"
