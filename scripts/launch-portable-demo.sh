#!/usr/bin/env bash
# 外地演示包 · 一键启动 L1 sidecar + Node 工作台
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
YINGYAN="$ROOT/yingyan"
L1="$YINGYAN/prototype/ppstructure"
APP="$YINGYAN/prototype/app"
L1_PORT="${PPSTRUCTURE_PORT:-8787}"
L1_URL="http://127.0.0.1:${L1_PORT}"
APP_PORT="${PORT:-3700}"

cleanup() {
  [ -f "$ROOT/.l1.pid" ] && kill "$(cat "$ROOT/.l1.pid")" 2>/dev/null || true
  rm -f "$ROOT/.l1.pid"
}
trap cleanup EXIT INT TERM

if ! command -v node >/dev/null 2>&1; then
  echo "未检测到 Node.js，请先安装 Node.js 18+：https://nodejs.org"
  exit 1
fi

start_l1() {
  if [ ! -f "$L1/server.py" ]; then
    echo "⚠ 未找到 L1 sidecar 源码，跳过 PDF/OCR（仍可跑 JSON/CSV 稽核）"
    return 1
  fi
  if ! command -v python3 >/dev/null 2>&1; then
    echo "⚠ 未检测到 Python3，L1 不可用。Mac 可装 python.org 3.12；或仅跑结构化导入"
    return 1
  fi
  cd "$L1"
  if [[ ! -d .venv ]]; then
    echo "首次启动 L1：创建 Python 虚拟环境并安装依赖（需联网，约 1–3 分钟）..."
    python3 -m venv .venv
    # shellcheck disable=SC1091
    source .venv/bin/activate
    pip install -U pip -q
    pip install -r requirements.txt -q
  else
    # shellcheck disable=SC1091
    source .venv/bin/activate
  fi
  export PPSTRUCTURE_PORT="$L1_PORT"
  python -m uvicorn server:app --host 127.0.0.1 --port "$L1_PORT" &
  echo $! > "$ROOT/.l1.pid"
  cd "$ROOT"
  for _ in $(seq 1 30); do
    if curl -fsS "$L1_URL/health" >/dev/null 2>&1; then
      echo "✅ L1 sidecar 已就绪 → $L1_URL"
      return 0
    fi
    sleep 0.5
  done
  echo "⚠ L1 启动超时，工作台仍可打开（PDF 解析不可用）"
  return 1
}

start_l1 || true

cd "$APP"
export PPSTRUCTURE_URL="$L1_URL"
echo "启动鹰眼工作台 → http://localhost:${APP_PORT}/"
if command -v open >/dev/null 2>&1; then
  (sleep 2 && open "http://localhost:${APP_PORT}/" && open "http://localhost:${APP_PORT}/intake.html") &
fi
node server.js
