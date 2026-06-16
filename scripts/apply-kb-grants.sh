#!/usr/bin/env bash
# 在 Supabase 云库上授予 kb_match RPC（anon/authenticated 可读检索）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SQL="$ROOT/supabase/migrations/20260615000001_kb_match_grants.sql"
if [[ -f "$ROOT/prototype/app/.env" ]]; then
  set -a; source "$ROOT/prototype/app/.env"; set +a
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL 未设置。请在 Supabase SQL Editor 手动执行:"
  cat "$SQL"
  exit 1
fi
docker run --rm -i postgres:17-alpine psql "$DATABASE_URL" -f - < "$SQL"
echo "✓ kb_match grants applied"
