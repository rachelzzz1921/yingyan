#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PORT="${PPSTRUCTURE_PORT:-8787}"
if [[ ! -d .venv ]]; then
  python3 -m venv .venv
  # shellcheck disable=SC1091
  source .venv/bin/activate
  pip install -U pip -q
  pip install -r requirements.txt -q
else
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi
export PPSTRUCTURE_PORT="$PORT"
echo "鹰眼 L1 解析 sidecar → http://127.0.0.1:${PORT}"
exec python -m uvicorn server:app --host 127.0.0.1 --port "$PORT"
