#!/usr/bin/env bash
# 鹰眼 · ARM64 离线交付包构建（对应竞赛《选手电脑 ARM64 Docker 应用部署操作说明》）
# 用法（仓库根目录）：bash scripts/build-arm64-delivery.sh
# 可选：SKIP_TEST=1 跳过 compose 自测；DELIVERY_DIR=team-app-demo-delivery

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TEAM_APP="$ROOT/team-app"
DELIVERY="${DELIVERY_DIR:-team-app-demo-delivery}"
BUNDLE_TAR="team-app_bundle_arm64.tar"
ARCH="$(docker version --format '{{.Server.Arch}}' 2>/dev/null || uname -m)"

echo "==> 1/6 检查 Docker..."
if ! docker info >/dev/null 2>&1; then
  if command -v colima >/dev/null 2>&1; then
    echo "    启动 colima..."
    colima start --cpu 4 --memory 6 --disk 40
  else
    echo "Docker 未运行。请先启动 Docker Desktop 或 colima。" >&2
    exit 1
  fi
fi

echo "==> 2/6 确认架构: ${ARCH}"
if [[ "$ARCH" != "arm64" && "$ARCH" != "aarch64" ]]; then
  echo "    本机非 ARM64，使用 buildx 交叉构建..."
  docker buildx version
  docker buildx inspect arm64builder >/dev/null 2>&1 \
    || docker buildx create --name arm64builder --use
  docker buildx inspect --bootstrap
  docker buildx build --platform linux/arm64 \
    -f team-app/Dockerfile -t team-app:arm64 --load .
else
  docker build \
    -f team-app/Dockerfile \
    -t team-app:arm64 \
    .
fi

docker image inspect team-app:arm64 --format '{{.Os}}/{{.Architecture}}'

echo "==> 3/6 拉取 postgres:16-bookworm (linux/arm64)..."
docker pull --platform linux/arm64 postgres:16-bookworm

if [[ "${SKIP_TEST:-}" != "1" ]]; then
  echo "==> 4/6 compose 自测..."
  cd "$TEAM_APP"
  docker compose down -v 2>/dev/null || true
  docker compose config
  docker compose up -d
  sleep 8
  docker compose ps
  curl -sf "http://127.0.0.1:8080/health" | head -c 400
  echo ""
  docker compose down
  cd "$ROOT"
else
  echo "==> 4/6 跳过 compose 自测 (SKIP_TEST=1)"
fi

echo "==> 5/6 保存镜像..."
docker save -o "$ROOT/$BUNDLE_TAR" team-app:arm64 postgres:16-bookworm

echo "==> 6/6 整理离线目录 $DELIVERY/ ..."
rm -rf "$ROOT/$DELIVERY"
mkdir -p "$ROOT/$DELIVERY"
cp "$ROOT/$BUNDLE_TAR" "$ROOT/$DELIVERY/"
cp "$TEAM_APP/compose.yaml" "$TEAM_APP/app.env" "$ROOT/$DELIVERY/"
cp -r "$TEAM_APP/db" "$ROOT/$DELIVERY/"

cat > "$ROOT/$DELIVERY/README-内网部署.txt" <<'EOF'
医保内网 ARM64 部署步骤（与竞赛指引一致）

1. 解压：tar -xf team-app-demo-delivery.tar
2. 进入：cd team-app-demo-delivery
3. 加载镜像：docker load -i team-app_bundle_arm64.tar
4. 验证：docker images | grep -E 'team-app|postgres'
   docker image inspect team-app:arm64 --format '{{.Os}}/{{.Architecture}}'
   应输出 linux/arm64
5. 启动：docker compose config && docker compose up -d
6. 验收：curl http://127.0.0.1:8080/health
   浏览器打开 http://<服务器IP>:8080

故障排查：
- 架构不符 → 在外网机用 --platform linux/arm64 重建
- compose 尝试 pull → 确认 docker load 成功且 compose 中 pull_policy: never
- 数据库重置 → docker compose down && docker volume rm team-app-demo-delivery_db-data && docker compose up -d
EOF

cd "$ROOT"
tar -cf "${DELIVERY}.tar" "$DELIVERY"

echo ""
echo "完成。"
echo "  离线目录: $ROOT/$DELIVERY/"
echo "  传输包:   $ROOT/${DELIVERY}.tar"
echo "  内网加载: docker load -i team-app_bundle_arm64.tar && docker compose up -d"
