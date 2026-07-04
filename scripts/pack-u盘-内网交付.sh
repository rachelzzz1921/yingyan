#!/usr/bin/env bash
# 组装 U 盘内网交付文件夹
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/team-app-u盘内网交付"
BUNDLE="$ROOT/team-app-demo-delivery/team-app_bundle_arm64.tar"

[[ -f "$BUNDLE" ]] || { echo "先运行: bash scripts/build-arm64-delivery.sh"; exit 1; }

mkdir -p "$OUT/db/init"
cp "$BUNDLE" "$OUT/"
cp "$ROOT/team-app/compose.yaml" "$OUT/"
cp "$ROOT/team-app/db/init/"*.sql "$OUT/db/init/"

# app.env：模板来自 team-app；若本地有接口示例/.env 则注入现场 Token 与公网兜底密钥（不进 git）
cp "$ROOT/team-app/app.env" "$OUT/app.env"
replace_env() {
  local key="$1" value="$2" file="$3"
  [[ -n "$value" ]] || return 0
  if [[ "$(uname)" == Darwin ]]; then
    sed -i '' "s|^${key}=.*|${key}=${value}|" "$file"
  else
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  fi
}

QWEN_DOC="${INTERNAL_QWEN_DOC:-/Users/chenzhiwei/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_w2m3prtetwsk22_f3a2/temp/drag/黑客松Qwen3-235B接口示例(2).txt}"
if [[ -f "$QWEN_DOC" ]]; then
  IFS=$'\t' read -r DOC_URL DOC_TOKEN DOC_MODEL < <(python3 - "$QWEN_DOC" <<'PY'
import re
import sys

raw = open(sys.argv[1], "rb").read()
for enc in ("utf-8", "gb18030", "gbk"):
    try:
        text = raw.decode(enc)
        break
    except UnicodeDecodeError:
        continue
else:
    text = raw.decode("utf-8", errors="ignore")
url = re.search(r"https?://[^\s'\"\\]+/v1/chat/completions", text)
token = re.search(r"Authorization:\s*Bearer\s+([A-Za-z0-9._-]+)", text)
model = re.search(r'"model"\s*:\s*"([^"]+)"', text)
print("\t".join([
    url.group(0) if url else "",
    token.group(1) if token else "",
    model.group(1) if model else "",
]))
PY
)
  replace_env SILICONFLOW_BASE "$DOC_URL" "$OUT/app.env"
  replace_env SILICONFLOW_API_KEY "$DOC_TOKEN" "$OUT/app.env"
  replace_env SILICONFLOW_CHAT_MODEL "$DOC_MODEL" "$OUT/app.env"
  replace_env SILICONFLOW_STREAM "true" "$OUT/app.env"
fi

LOCAL_ENV="$ROOT/prototype/app/.env"
if [[ -f "$LOCAL_ENV" ]]; then
  FB_KEY=$(grep -E '^SILICONFLOW_FALLBACK_API_KEY=' "$LOCAL_ENV" 2>/dev/null | cut -d= -f2- | tr -d '\r' || true)
  if [[ -z "$FB_KEY" ]]; then
    FB_KEY=$(grep -E '^SILICONFLOW_CHAT_KEY=' "$LOCAL_ENV" 2>/dev/null | cut -d= -f2- | tr -d '\r' || true)
  fi
  if [[ -n "$FB_KEY" && "$FB_KEY" != *"请粘贴"* ]]; then
    if [[ "$(uname)" == Darwin ]]; then
      sed -i '' "s|^SILICONFLOW_FALLBACK_API_KEY=.*|SILICONFLOW_FALLBACK_API_KEY=$FB_KEY|" "$OUT/app.env"
    else
      sed -i "s|^SILICONFLOW_FALLBACK_API_KEY=.*|SILICONFLOW_FALLBACK_API_KEY=$FB_KEY|" "$OUT/app.env"
    fi
    sed -i.bak '1s|^# 鹰眼 · 容器运行时环境.*|# 鹰眼 · 容器运行时环境（医保内网 ARM64 · U 盘交付 · 含公网兜底）|' "$OUT/app.env" 2>/dev/null || true
    rm -f "$OUT/app.env.bak"
  fi
fi

chmod +x "$OUT/"*.sh 2>/dev/null || true

tar -cf "$ROOT/team-app-u盘内网交付.tar" -C "$ROOT" "team-app-u盘内网交付"
echo "完成: $OUT/ 与 $ROOT/team-app-u盘内网交付.tar"
du -sh "$OUT"
