#!/usr/bin/env bash
# 一键启动 Route B 本地 KB（Postgres + pgvector + PostgREST）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "▸ 启动 Docker 栈…"
docker compose -f docker-compose.kb.yml up -d

echo "▸ 等待 Postgres 就绪…"
for i in $(seq 1 30); do
  if docker exec yingyan-kb-db pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done

echo "▸ 应用 migration…"
docker exec -i yingyan-kb-db psql -U postgres -d postgres < supabase/migrations/20260615000000_yingyan_kb.sql

ENV_FILE="$ROOT/prototype/app/.env"
if [[ -f "$ENV_FILE" ]]; then
  if ! grep -q '^SUPABASE_URL=' "$ENV_FILE"; then
    cat >> "$ENV_FILE" <<'EOF'

# --- Route B 本地 KB（setup-local-kb.sh 自动写入）---
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=local-dev-postgres
SUPABASE_ANON_KEY=local-dev-postgres
RAG_ENABLED=true
RAG_MODE=auto
RAG_CORPUS_VERSION=2026.06.15-v1
EOF
    echo "▸ 已追加 SUPABASE_* 到 prototype/app/.env"
  fi
else
  echo "⚠ 请复制 prototype/app/.env.example → .env 并填入 STEPFUN_API_KEY"
fi

echo "▸ 灌入 KB JSON…"
node scripts/ingest-kb-to-supabase.js "$@"

echo ""
echo "✅ 本地 KB 就绪"
echo "   PostgREST: http://127.0.0.1:54321"
echo "   Postgres:  postgresql://postgres:postgres@127.0.0.1:54322/postgres"
echo "   下一步：在 .env 填入 STEPFUN_API_KEY，然后 node scripts/ingest-kb-to-supabase.js --stepfun"
