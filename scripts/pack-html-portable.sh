#!/usr/bin/env bash
# 鹰眼 · 外地演示 HTML 打包
# 产出：静态 HTML（双击可开）+ 可选完整 Node 原型（一键启动）
#
# 用法:
#   bash scripts/pack-html-portable.sh                    # 默认 ~/Desktop/鹰眼-外地演示包
#   bash scripts/pack-html-portable.sh /path/to/out       # 指定目录
#   bash scripts/pack-html-portable.sh --static-only        # 仅静态页（不含交互原型）
#   bash scripts/pack-html-portable.sh --with-l1-venv       # 附带 Python 虚拟环境（Mac 同架构可离线 L1）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

STATIC_ONLY=0
WITH_L1_VENV=0
DEST=""
for arg in "$@"; do
  case "$arg" in
    --static-only) STATIC_ONLY=1 ;;
    --with-l1-venv) WITH_L1_VENV=1 ;;
    *) DEST="$arg" ;;
  esac
done

STAMP="$(date +%Y%m%d)"
DEST="${DEST:-$HOME/Desktop/鹰眼-外地演示包-$STAMP}"
ZIP="${DEST}.zip"

rm -rf "$DEST"
mkdir -p "$DEST/静态展示/vendor" "$DEST/静态展示/01-S4作品卷宗" "$DEST/静态展示/02-路演PPT" "$DEST/静态展示/03-架构图" "$DEST/静态展示/04-宣传海报"

echo "==> 下载离线 vendor（Mermaid）..."
MERMAID_URL="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"
if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$MERMAID_URL" -o "$DEST/静态展示/vendor/mermaid.min.js" || echo "    ⚠ Mermaid 下载失败，架构图需联网"
elif command -v wget >/dev/null 2>&1; then
  wget -q "$MERMAID_URL" -O "$DEST/静态展示/vendor/mermaid.min.js" || echo "    ⚠ Mermaid 下载失败，架构图需联网"
else
  echo "    ⚠ 无 curl/wget，架构图需联网"
fi

echo "==> 复制静态 HTML..."
cp "$ROOT/assets/posters/yingyan-s4-interactive.html" "$DEST/静态展示/01-S4作品卷宗/"
cp -R "$ROOT/docs/deliverables/ppt/." "$DEST/静态展示/02-路演PPT/"
cp "$ROOT/docs/deliverables/architecture/"*.html "$DEST/静态展示/03-架构图/"

# 架构图：CDN → 本地 vendor（若已下载）
if [ -f "$DEST/静态展示/vendor/mermaid.min.js" ]; then
  for f in "$DEST/静态展示/03-架构图/"*.html; do
    sed -i '' 's|https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js|../vendor/mermaid.min.js|g' "$f" 2>/dev/null \
      || sed -i 's|https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js|../vendor/mermaid.min.js|g' "$f"
  done
fi

# 宣传海报（按需，体积较大）
for f in \
  "$ROOT/assets/posters/yingyan-field-posters-10.html" \
  "$ROOT/assets/posters/yingyan-eagleeye-a4-flyer-v1.html" \
  "$ROOT/assets/posters/yingyan-eagleeye-whitepaper.html" \
  "$ROOT/assets/posters/yingyan-rule-architecture-flyer.html"; do
  [ -f "$f" ] && cp "$f" "$DEST/静态展示/04-宣传海报/"
done
[ -d "$ROOT/assets/posters/yingyan-print-pack" ] && cp -R "$ROOT/assets/posters/yingyan-print-pack" "$DEST/静态展示/04-宣传海报/"

echo "==> 生成本地导航页..."
node "$ROOT/scripts/pack-html-portable.mjs" "$DEST/静态展示"

if [ "$STATIC_ONLY" -eq 0 ]; then
  echo "==> 打包完整交互原型（需本机 Node 18+）..."
  APP_DEST="$DEST/完整交互原型/yingyan"
  mkdir -p "$APP_DEST/prototype" "$APP_DEST/docs" "$APP_DEST/assets"
  cp -R "$ROOT/prototype/app" "$APP_DEST/prototype/"
  cp -R "$ROOT/prototype/data" "$APP_DEST/prototype/"
  cp -R "$ROOT/docs/deliverables" "$APP_DEST/docs/"
  cp -R "$ROOT/assets/brand" "$APP_DEST/assets/"
  cp -R "$ROOT/assets/posters" "$APP_DEST/assets/"
  cp -R "$ROOT/yhf" "$APP_DEST/"
  if [ -d "$ROOT/prototype/app/node_modules" ]; then
    cp -R "$ROOT/prototype/app/node_modules" "$APP_DEST/prototype/app/"
  else
    echo "    ⚠ 未找到 node_modules，请先在 prototype/app 执行 npm ci"
  fi

  echo "==> 打包 L1 文档解析 sidecar..."
  mkdir -p "$APP_DEST/prototype/ppstructure"
  for f in run.sh server.py requirements.txt install-paddle.sh Dockerfile docker-compose.yml README.md; do
    [ -f "$ROOT/prototype/ppstructure/$f" ] && cp "$ROOT/prototype/ppstructure/$f" "$APP_DEST/prototype/ppstructure/"
  done
  if [ "$WITH_L1_VENV" -eq 1 ] && [ -d "$ROOT/prototype/ppstructure/.venv" ]; then
    echo "    复制 .venv（约 140MB，仅适用于同系统同架构 Mac→Mac）..."
    cp -R "$ROOT/prototype/ppstructure/.venv" "$APP_DEST/prototype/ppstructure/"
  else
    echo "    未附带 .venv；外地首次启动 L1 需 Python3 + 联网 pip install"
    echo "    本机已配好环境可加 --with-l1-venv 打离线 L1"
  fi

  cp "$ROOT/scripts/launch-portable-demo.sh" "$DEST/完整交互原型/launch-portable-demo.sh"
  chmod +x "$DEST/完整交互原型/launch-portable-demo.sh"

  cat > "$DEST/完整交互原型/启动演示-Mac.command" <<'MAC'
#!/bin/bash
cd "$(dirname "$0")"
exec bash ./launch-portable-demo.sh
MAC
  chmod +x "$DEST/完整交互原型/启动演示-Mac.command"

  cat > "$DEST/完整交互原型/启动演示-Windows.bat" <<'WIN'
@echo off
cd /d "%~dp0"
set PPSTRUCTURE_URL=http://127.0.0.1:8787
where node >nul 2>nul || (
  echo 未检测到 Node.js，请先安装 Node.js 18+：https://nodejs.org
  pause
  exit /b 1
)
echo 启动 L1 sidecar（需 Python 3 + 首次联网 pip）...
start "鹰眼-L1" cmd /k "cd /d %~dp0yingyan\prototype\ppstructure && (if not exist .venv python -m venv .venv) && .venv\Scripts\pip install -r requirements.txt -q && .venv\Scripts\python -m uvicorn server:app --host 127.0.0.1 --port 8787"
timeout /t 4 >nul
echo 启动工作台 http://localhost:3700 ...
start "" cmd /c "timeout /t 2 >nul && start http://localhost:3700/ && start http://localhost:3700/intake.html"
cd yingyan\prototype\app
node server.js
WIN

  cat > "$DEST/完整交互原型/启动说明.txt" <<'TXT'
鹰眼 · 完整交互原型（外地电脑）

【一键启动 · 推荐】
  Mac：双击「启动演示-Mac.command」
  Windows：双击「启动演示-Windows.bat」

会自动启动两个服务：
  ① L1 sidecar（:8787）— PDF/扫描件 OCR，传统引擎，不依赖多模态 AI
  ② Node 工作台（:3700）— 稽核、分诊、Intake 一键导入

前提：
  · Node.js 18+
  · L1 还需 Python 3.11–3.12（Mac 自带或 python.org）
  · 若包内无 .venv，首次启动 L1 需联网 pip install（约 1–3 分钟）
  · 扫描图 OCR 建议本机再装 tesseract（Mac: brew install tesseract tesseract-lang）

浏览器：
  http://localhost:3700/              稽核工作台
  http://localhost:3700/intake.html   拖 PDF 演示（顶栏应显示 L1✓）
  http://localhost:3700/dashboard.html  项目看板

关闭：在启动窗口按 Ctrl+C。

【离线 L1】
  在本机已跑通过 sidecar 后，重新打包时加参数：
  bash scripts/pack-html-portable.sh --with-l1-venv
  会把 Python 虚拟环境打进包（Mac 同架构可完全离线）。

【仅静态页】
  见上级「静态展示/打开演示.html」，无需 Node/Python。
TXT
fi

cat > "$DEST/请先看这里.txt" <<TXT
鹰眼 · 外地演示包（生成于 $(date '+%Y-%m-%d %H:%M')）

【方式一 · 静态展示 · 推荐评委/路演】
  双击打开：静态展示/打开演示.html
  或直接打开：静态展示/01-S4作品卷宗/yingyan-s4-interactive.html
  说明：无需安装，双击即用。PPT 动画部分依赖联网 CDN（字体/Lucide/Motion）。

【方式二 · 完整交互原型 + L1 sidecar】
  见「完整交互原型/启动说明.txt」
  需 Node.js 18+ 与 Python 3；一键同时启动 OCR 解析(:8787) 和工作台(:3700)
  本机已配好 L1 时可加 --with-l1-venv 打完全离线包

【在线版（有网时）】
  https://yingyan.47-237-68-213.sslip.io/
  https://yingyan.vercel.app/

打包命令：bash scripts/pack-html-portable.sh
TXT

echo "==> 压缩 zip..."
rm -f "$ZIP"
if command -v ditto >/dev/null 2>&1; then
  ditto -c -k --sequesterRsrc --keepParent "$DEST" "$ZIP"
else
  (cd "$(dirname "$DEST")" && zip -rq "$(basename "$ZIP")" "$(basename "$DEST")")
fi

SIZE="$(du -sh "$DEST" | cut -f1)"
ZSIZE="$(du -sh "$ZIP" | cut -f1)"
echo ""
echo "✅ 完成"
echo "   文件夹: $DEST  ($SIZE)"
echo "   压缩包: $ZIP  ($ZSIZE)"
echo "   外地使用: 解压后双击「静态展示/打开演示.html」"
