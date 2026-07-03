#!/bin/bash
# A2 离线打包(D0):比赛现场无外网,本脚本核对打包清单并组装 U 盘目录。
# 用法: bash scripts/pack-offline.sh [目标目录,默认 ~/Desktop/鹰眼-U盘打包]
set -uo pipefail
cd "$(dirname "$0")/.."
DEST="${1:-$HOME/Desktop/鹰眼-U盘打包}"
mkdir -p "$DEST"

ok=0; miss=0
have() { # have <路径> <说明> [copy]
  if [ -e "$1" ]; then
    echo "  ✅ $2  ($1)"; ok=$((ok+1))
    if [ "${3:-}" = "copy" ]; then
      mkdir -p "$DEST/$(dirname "$1")"
      cp -R "$1" "$DEST/$(dirname "$1")/" 2>/dev/null
    fi
  else
    echo "  ❌ 缺: $2  ($1)"; miss=$((miss+1))
  fi
}

echo "== 代码与依赖(全量 vendor,现场 npm 不可用) =="
have prototype/app/node_modules "app 依赖(node_modules 全量)" copy
have node_modules "根依赖(puppeteer 等)" copy
have prototype/app "应用源码" copy
have yhf "YHF 门禁" copy
have eval "eval 用例与 v7 prompts" copy
have scripts "脚本" copy

echo "== 数据与语料 =="
have prototype/data "案卷/规则/KB(含 79 条规则+判例库+1000条筛查数据)" copy
have public-data-corpus "公开语料包" copy

echo "== 模型与 OCR =="
have prototype/ppstructure "PP-Structure sidecar(PDF/扫描件解析,:8787)" copy
PPMODEL=$(ls ~/.paddlex 2>/dev/null | head -1)
[ -n "${PPMODEL:-}" ] && echo "  ✅ PaddleX 模型缓存(~/.paddlex → 需一并拷,现场无网拉不了)" || echo "  ⚠ 未见 ~/.paddlex 模型缓存——现场首跑会尝试联网下载,务必先在外网跑一次 sidecar"
echo "  ⚠ bge-small 向量模型(CPU):RAG_EMBEDDING_* 若走 API 需切本地——确认 kb/retrieval 的兜底是关键词检索(已内建,可零模型运行)"

echo "== 插件产品线 =="
have plugin/browser-extension "浏览器扩展(加载已解压)" copy
have plugin/desktop-sentinel "桌面哨兵" copy

echo "== 交付文档 =="
have docs/H1-飞书文档骨架.md "H1 文档骨架" copy
have "docs/H2-演示视频分镜脚本.md" "H2 分镜脚本" copy
have "鹰眼-赛前迭代工作文档.md" "赛前工作文档" copy

echo "== 开源参照(§五清单,按需) =="
have vendor "vendor(OpenDRG 待人工克隆,见 vendor/README.md)" copy
echo "  ⚠ promptfoo/claude-cookbooks:未 vendor(评估参照非运行依赖,可选)"

echo ""
echo "== 结果:$ok 项就绪,$miss 项缺失 → 目标 $DEST =="
echo "剩余人工步骤:①vendor/opendrg 克隆(见 vendor/README.md) ②~/.paddlex 模型缓存拷入 ③.env(密钥,单独管理不进U盘或加密) ④备两份U盘"
