# 鹰眼 · L1 文档解析 Sidecar

PDF / 扫描件 / 图片 → 带 **bbox 坐标** 的统一 layout JSON，供一键 Intake 填入 `medical_record`。

## 快速启动

```bash
cd prototype/ppstructure
bash run.sh
# → http://127.0.0.1:8787/health
```

另开终端启动工作台：

```bash
cd prototype/app && node server.js
# 顶栏应显示「L1✓」
```

## 引擎层级

| 模式 | 引擎 | 依赖 | 适用 |
|---|---|---|---|
| **auto**（默认） | PP-StructureV3 | `bash install-paddle.sh` | 扫描件、复杂表格、最佳 bbox |
| **auto** 回退 | lite-pdfplumber | `requirements.txt` | 数字 PDF、费用表格 |
| 扫描图回退 | tesseract-ocr | `brew install tesseract tesseract-lang` | 纯图片 OCR |

环境变量：

```bash
PPSTRUCTURE_PORT=8787          # 端口
PPSTRUCTURE_URL=http://127.0.0.1:8787   # Node 客户端地址
PPSTRUCTURE_MODE=auto          # auto | lite | ppstructure
```

## 生产部署（Docker · iter-26）

```bash
# 推荐：Python 3.12 容器 + tesseract 中文包
cd prototype/ppstructure
docker compose up -d --build
# 或：bash ../../scripts/deploy-ppstructure.sh

# 完整 PP-StructureV3：容器内 Python≤3.12 后执行
docker compose exec l1-parser bash install-paddle.sh
```

### 云端（与 Vercel 主站联调）

1. [Render Dashboard](https://dashboard.render.com/) → **New** → **Blueprint** → 连接 `rachelzzz1921/yingyan`（仓库根目录已有 `render.yaml`）
2. 等待 `yingyan-l1` 服务 Ready，复制 URL（如 `https://yingyan-l1.onrender.com`）
3. 写入 Vercel 并重新部署主站：

```bash
node scripts/setup-l1-cloud.mjs https://yingyan-l1.onrender.com
```

4. 刷新 https://yingyan.vercel.app/intake.html — 应显示 **L1 云端已连接**

> Render 免费档冷启动约 30–60s；首次 `/health` 可能超时，属正常。

验收：`node scripts/check-ppstructure-prod.js` · `GET /api/l1/production`

## 完整能力（推荐生产）

```bash
bash install-paddle.sh   # 安装 PaddleOCR PP-StructureV3
brew install poppler tesseract tesseract-lang   # macOS
```

## API

### `GET /health`

```json
{
  "paddle_available": false,
  "recommended_engine": "lite",
  "tesseract_available": true
}
```

### `POST /parse`

```json
{
  "file_base64": "...",
  "mime": "application/pdf",
  "filename": "费用清单.pdf"
}
```

返回 `pages[].tables[].rows[].bbox` → 映射到 `fee_list.items[].anchor.bbox`。

## 与鹰眼集成

```
拖入 PDF/图片
  → POST /api/intake/batch
  → ppstructure-client → sidecar /parse
  → ppstructure-mapper → medical_record 片段
  → merge → uploaded 案卷
  → case-object 编译时传播 anchor.bbox
```

## 故障排查

| 现象 | 处理 |
|---|---|
| 顶栏 `L1—` | 先 `bash run.sh` |
| PDF 422 | 确认 `pymupdf` 已装（run.sh 会自动 pip install） |
| 扫描件无文字 | 安装 tesseract 或 `install-paddle.sh` |
| 表格行不准 | 升级 PP-StructureV3；或文件名含「费用清单」 |
