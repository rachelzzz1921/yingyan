#!/usr/bin/env bash
# 部署鹰眼到共享阿里云 ECS（与易测/LoveCompass 按 Host 分流，Nginx 仅做 TLS+路由）
#
# 用法：
#   ./scripts/deploy-ecs.sh                    # 默认：完整包分片上传（适合 1GB+）
#   DEPLOY_MODE=rsync ./scripts/deploy-ecs.sh  # rsync 按目录分批同步（可断点续传）
#   DEPLOY_MODE=tar ./scripts/deploy-ecs.sh    # 单文件 tar 一次 scp（小包时用）
#
# 可选环境变量：
#   SERVER_IP  SSH_USER  SSH_KEY  APP_DIR  YINGYAN_HOST  ENV_FILE
#   CHUNK_MB=100   分片大小（仅 split 模式）
#
# 说明：不精简仓库内容，仅排除 .env / node_modules / .git 等运行时不需要项。

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SERVER_IP="${SERVER_IP:-47.237.68.213}"
SSH_USER="${SSH_USER:-admin}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
APP_DIR="${APP_DIR:-/opt/yingyan}"
ICHING_DIR="${ICHING_DIR:-/opt/iching}"
YINGYAN_HOST="${YINGYAN_HOST:-yingyan.47-237-68-213.sslip.io}"
DEPLOY_MODE="${DEPLOY_MODE:-split}"
CHUNK_MB="${CHUNK_MB:-100}"
SSH_OPTS=(-o StrictHostKeyChecking=accept-new -i "$SSH_KEY" -o ServerAliveInterval=30 -o ServerAliveCountMax=6)
ENV_FILE="${ENV_FILE:-$ROOT/prototype/app/.env}"
REMOTE="${SSH_USER}@${SERVER_IP}"

RSYNC_EXCLUDES=(
  --exclude='.git'
  --exclude='node_modules'
  --exclude='.env'
  --exclude='prototype/app/.env'
  --exclude='prototype/data/_runtime_backup'
  --exclude='prototype/ppstructure/__pycache__'
  --exclude='eval/.env'
  --exclude='.vercel'
)

TAR_EXCLUDES=(
  --exclude='.git'
  --exclude='node_modules'
  --exclude='.env'
  --exclude='prototype/app/.env'
  --exclude='prototype/data/_runtime_backup'
  --exclude='prototype/ppstructure/__pycache__'
  --exclude='eval/.env'
  --exclude='.vercel'
)

echo "==> 目标: ${REMOTE}:${APP_DIR}"
echo "==> HTTPS: https://${YINGYAN_HOST}/"
echo "==> 模式: ${DEPLOY_MODE}（完整内容，不精简）"

if [[ ! -f "$SSH_KEY" ]]; then
  echo "未找到 SSH 密钥 $SSH_KEY" >&2
  exit 1
fi

ssh "${SSH_OPTS[@]}" "$REMOTE" "mkdir -p ${APP_DIR}"

upload_env() {
  if [[ -f "$ENV_FILE" ]]; then
    echo "==> 上传 .env（不进 git）..."
    scp "${SSH_OPTS[@]}" "$ENV_FILE" "${REMOTE}:${APP_DIR}/prototype-app.env"
  else
    echo "⚠️  未找到 $ENV_FILE，线上将无 LLM key（确定性引擎仍可演示）"
  fi
}

upload_nginx() {
  local ICHING_NGINX="/Users/chenzhiwei/Desktop/易数/code/deploy/nginx-shared.conf"
  if [[ -f "$ICHING_NGINX" ]]; then
    echo "==> 同步 Nginx 分流配置..."
    scp "${SSH_OPTS[@]}" "$ICHING_NGINX" "${REMOTE}:${ICHING_DIR}/deploy/nginx-shared.conf"
  fi
}

upload_split() {
  local STAMP
  STAMP=$(date +%s)
  local TAR="/tmp/yingyan-deploy-${STAMP}.tar.gz"
  local PART_DIR="/tmp/yingyan-parts-${STAMP}"

  echo "==> 打包完整代码（仅排除 .env / node_modules / .git）..."
  tar -czf "$TAR" "${TAR_EXCLUDES[@]}" -C "$ROOT" .
  echo "    包大小: $(du -h "$TAR" | cut -f1)"

  mkdir -p "$PART_DIR"
  echo "==> 切分为 ${CHUNK_MB}MB 分片 (release.part.*)..."
  split -b "${CHUNK_MB}M" "$TAR" "${PART_DIR}/release.part."
  rm -f "$TAR"

  local PARTS=("${PART_DIR}"/release.part.*)
  local N=${#PARTS[@]}
  echo "==> 共 ${N} 个分片，逐片上传..."
  ssh "${SSH_OPTS[@]}" "$REMOTE" "rm -f ${APP_DIR}/release.part.* ${APP_DIR}/release.tar.gz"

  local i=1
  for f in "${PARTS[@]}"; do
    local base
    base=$(basename "$f")
    echo "    [${i}/${N}] scp ${base} ..."
    scp "${SSH_OPTS[@]}" "$f" "${REMOTE}:${APP_DIR}/${base}"
    i=$((i + 1))
  done
  rm -rf "$PART_DIR"
  echo "==> 分片上传完成，远程解包..."
}

upload_tar() {
  local TAR="/tmp/yingyan-deploy-$(date +%s).tar.gz"
  echo "==> 打包并单次上传..."
  tar -czf "$TAR" "${TAR_EXCLUDES[@]}" -C "$ROOT" .
  scp "${SSH_OPTS[@]}" "$TAR" "${REMOTE}:${APP_DIR}/release.tar.gz"
  rm -f "$TAR"
}

upload_rsync_batches() {
  # 按目录分批 rsync：每批独立进度，中断后可重跑（rsync 会跳过已传文件）
  local DEST="${REMOTE}:${APP_DIR}/"
  local batches=(
    "prototype"
    "assets"
    "public-data-corpus"
    "docs"
    "plugin"
    "scripts"
    "eval"
    "yhf"
    "prompts"
    "supabase"
    "application"
    "export"
  )

  echo "==> rsync 分批同步（${#batches[@]} 个目录 + 根文件）..."
  local i=1 total=$((${#batches[@]} + 1))
  for dir in "${batches[@]}"; do
    if [[ -d "$ROOT/$dir" ]]; then
      echo "    [${i}/${total}] rsync ${dir}/ ..."
      rsync -az --partial --info=progress2 "${RSYNC_EXCLUDES[@]}" \
        -e "ssh ${SSH_OPTS[*]}" \
        "$ROOT/$dir/" "${DEST}${dir}/"
    fi
    i=$((i + 1))
  done

  echo "    [${total}/${total}] rsync 根目录文件..."
  rsync -az --partial "${RSYNC_EXCLUDES[@]}" \
    -e "ssh ${SSH_OPTS[*]}" \
    --exclude='prototype' --exclude='assets' --exclude='public-data-corpus' \
    --exclude='docs' --exclude='plugin' --exclude='scripts' --exclude='eval' \
    --exclude='yhf' --exclude='prompts' --exclude='supabase' --exclude='application' \
    --exclude='export' \
    "$ROOT/" "$DEST"
}

case "$DEPLOY_MODE" in
  split) upload_split ;;
  tar)   upload_tar ;;
  rsync) upload_rsync_batches ;;
  *)
    echo "未知 DEPLOY_MODE=${DEPLOY_MODE}，请用 split | rsync | tar" >&2
    exit 1
    ;;
esac

upload_env
upload_nginx

echo "==> 远程安装 Node 20 + PM2 并启动..."
ssh "${SSH_OPTS[@]}" "$REMOTE" bash -s <<REMOTE
set -euo pipefail
APP_DIR="${APP_DIR}"
ICHING_DIR="${ICHING_DIR}"
YINGYAN_HOST="${YINGYAN_HOST}"
DEPLOY_MODE="${DEPLOY_MODE}"

if [[ "\$DEPLOY_MODE" == "split" ]]; then
  cd "\$APP_DIR"
  if ls release.part.* >/dev/null 2>&1; then
    echo "==> 合并分片并解包..."
    cat release.part.* > release.tar.gz
    tar -xzf release.tar.gz
    rm -f release.part.* release.tar.gz
  fi
elif [[ "\$DEPLOY_MODE" == "tar" ]]; then
  cd "\$APP_DIR"
  tar -xzf release.tar.gz
  rm -f release.tar.gz
fi
# rsync 模式：文件已在位，无需解包

if ! command -v node >/dev/null 2>&1 || [[ "\$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
  echo "==> 安装 Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "Node: \$(node -v)"

if ! command -v pm2 >/dev/null 2>&1; then
  echo "==> 安装 PM2..."
  sudo npm install -g pm2
fi

mkdir -p "\$APP_DIR/prototype/app" "\$APP_DIR/prototype/data"
cd "\$APP_DIR"
if [[ -f prototype-app.env ]]; then
  mv -f prototype-app.env prototype/app/.env
  chmod 600 prototype/app/.env
fi
chmod -R u+w prototype/data 2>/dev/null || true

cd prototype/app
pm2 delete yingyan 2>/dev/null || true
PORT=3700 pm2 start server.js --name yingyan --update-env
pm2 save
sudo env PATH="\$PATH" pm2 startup systemd -u "\$(whoami)" --hp "\$HOME" 2>/dev/null || true

sleep 2
curl -sf http://127.0.0.1:3700/api/health && echo " 鹰眼本地健康 OK" || { echo "鹰眼未就绪"; pm2 logs yingyan --lines 30 --nostream; exit 1; }

if [[ -f "\$ICHING_DIR/deploy/nginx-sync.sh" ]]; then
  cd "\$ICHING_DIR"
  sudo ./deploy/nginx-sync.sh
  echo "==> 扩展 sslip.io 证书，加入 \${YINGYAN_HOST} ..."
  sudo certbot certonly --nginx \
    -d 47-237-68-213.sslip.io \
    -d yice.47-237-68-213.sslip.io \
    -d "\${YINGYAN_HOST}" \
    --expand --non-interactive --agree-tos -m admin@localhost \
    || sudo certbot certonly --webroot -w /var/www/html \
    -d "\${YINGYAN_HOST}" \
    --non-interactive --agree-tos -m admin@localhost
  sudo ./deploy/nginx-sync.sh
  sudo nginx -t && sudo systemctl reload nginx
fi

echo "完成: https://\${YINGYAN_HOST}/"
REMOTE

echo ""
echo "==> 验收..."
sleep 2
if curl -sf --max-time 20 "https://${YINGYAN_HOST}/api/health" | head -c 500; then
  echo ""
else
  echo "⚠️  外网验收超时（可能仍在启动），请稍后打开: https://${YINGYAN_HOST}/"
fi
echo "Pitch 三入口: https://${YINGYAN_HOST}/  （根路径 = home.html）"
