#!/usr/bin/env bash
# 生产部署 L1 sidecar（Docker 优先，回退本地 venv）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)/prototype/ppstructure"
cd "$ROOT"

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  echo "▶ Docker Compose 部署 L1 sidecar…"
  docker compose up -d --build
  echo "✅ http://127.0.0.1:${PPSTRUCTURE_PORT:-8787}/health"
  exit 0
fi

echo "▶ 本地 venv 启动（无 Docker）…"
bash run.sh
