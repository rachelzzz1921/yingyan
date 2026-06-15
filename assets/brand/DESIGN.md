# 鹰眼 · 品牌视觉规范 v1.0

## 定位

**监管可信 × 智能锐利** — 飞检稽核员的 AI 放大镜，不是消费医疗 App。

## 色彩

| Token | 色值 | 用途 |
|---|---|---|
| `--yy-ink` | `#0B2A4A` | 主文字、顶栏深底 |
| `--yy-ink-2` | `#134E72` | 渐变辅色 |
| `--yy-muted` | `#5C7185` | 次要文字 |
| `--yy-iris` | `#2DD4BF` | 鹰眼虹膜、成功强调 |
| `--yy-amber` | `#E8A838` | 扫描环、品牌点缀 |
| `--yy-danger` | `#DC4A3D` | 疑点、红线 |
| `--yy-warn` | `#C77700` | 线索 |
| `--yy-ok` | `#0D9B6A` | 合规、PASS |
| `--yy-bg` | `#F0F4F8` | 页面底 |
| `--yy-surface` | `#FFFFFF` | 卡片 |

## 图形语言

- **logo-mark**：抽象鹰眼 + 琥珀扫描弧 + 十字准星（证据定位）
- **背景**： subtle 网格点阵（监管/数据感），顶栏深蓝渐变
- **卡片**：白底 + 轻阴影 + 12px 圆角；疑点左缘色条

## 字体

- 中文：`Noto Sans SC`
- 英文/数字：`DM Sans`（tabular nums 用于金额）

## 文件

- `logo.svg` — 横版（文档/PPT）
- `logo-mark.svg` — 图标（favicon/顶栏）
- 原型引用：`prototype/app/public/favicon.svg` 同步 mark

## 扩展（v2 候选）

- [`DESIGN-v2-gpt.md`](DESIGN-v2-gpt.md) — GPT 生成的完整品牌方案（2026-06-15）
- [`APPLICATION.md`](APPLICATION.md) — 如何应用到原型 / Pitch
- [`gpt-v2/`](gpt-v2/) — GPT 参考图（Logo、证据链 UI、图标集等）
- [`prompts/品牌元素生成.md`](../../prompts/品牌元素生成.md) — 复用 Prompt

## 勿用

- 纯红医疗十字作为主视觉
- 过高饱和渐变（廉价 SaaS 感）
- 与 shadow 观察期紫色混淆的大面积紫（shadow 仅治理态使用）
