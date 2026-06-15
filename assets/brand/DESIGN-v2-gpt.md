# 鹰眼 · 品牌元素方案 v2.0（GPT 生成）

> **来源**：2026-06-15 · ChatGPT 按 [`prompts/品牌元素生成.md`](../../prompts/品牌元素生成.md) 产出  
> **状态**：候选方案，**尚未合并进 v1 正式规范**（[`DESIGN.md`](DESIGN.md) 仍为工程落地基准）  
> **参考图**：[`gpt-v2/`](gpt-v2/) 目录 7 张 PNG  
> **应用指南**：见 [`APPLICATION.md`](APPLICATION.md)

---

## 推荐结论（GPT 综合）

| 维度 | 推荐 |
|---|---|
| 英文名 | **EagleEye Audit** |
| Logo 方向 | **准星取证型**（鹰眼虹膜 + 十字准星 + 琥珀扫描弧） |
| 主 Slogan | 让每一分救命钱，都查得有据 |
| 副 Slogan 方向 | 不猜测，只取证 / 国家系统筛线索，鹰眼做取证链 |
| 视觉气质 | 监管可信 × 智能锐利 × 证据导向 |

---

## 模块 1 · 品牌命名与文案

### 推荐

- **中文**：鹰眼 — 识别度高，与「锐利稽核」「取证」天然对齐
- **英文**：EagleEye Audit
- **电梯版**：90 秒读懂病历，回链原文，输出可对质稽核报告

### 备选名

| 中文 | 英文 | 特点 |
|---|---|---|
| 鹰证 | EagleProof | 偏证据、略硬 |
| 稽镜 | AuditMirror | 偏工具、识别度低 |
| 审瞳 | AuditPupil | 偏医学、易误解 |
| 医保鹰鉴 | MI Eagle Appraisal | 偏政务、略长 |

### Slogan 三方向

1. **公共价值**：让每一分救命钱，都查得有据
2. **证据导向**：不猜测，只取证
3. **功能定位**：国家系统筛线索，鹰眼做取证链

### 品牌禁用词

AI 医生、智能诊断、自动判案、零误报、替代稽核员、黑箱决策、全能监管大脑、秒懂医保

---

## 模块 2 · Logo 与图形标识

### 方向 1 · 准星取证型（推荐）

- **构成**：鹰眼虹膜 + 十字准星 + 琥珀扫描弧
- **气质**：精准、可审计、政务科技
- **图像 prompt**：
  ```
  Minimal flat vector logo icon, abstract eagle eye merged with crosshair target and evidence locator, deep navy and teal with a small amber scanning arc, sharp geometric lines, trustworthy government-tech medical audit brand, no text, no 3D, recognizable at 64x64.
  ```

### 方向 2 · 扫描环型

- **构成**：圆形扫描环 + 刻度线暗示眼形
- **气质**：更系统化、流程感
- **图像 prompt**：
  ```
  Flat vector symbol, circular scan ring suggesting an eye, precise center locator, subtle crosshair ticks, deep navy primary, teal iris accent, small amber sweep, professional and austere, no text, no gradient overload, legible as favicon.
  ```

### 方向 3 · 文书透镜型

- **构成**：文书角 + 放大镜 + 抽象鹰眼
- **气质**：强调「审文书」
- **图像 prompt**：
  ```
  Clean flat vector icon combining a document corner, magnifying glass, and abstract eagle eye iris, evidence highlight line, navy teal amber palette, calm and official, no text, minimalist, sharp and readable at 64x64.
  ```

### Wordmark

- 中文「鹰眼」粗体 + 英文 **EagleEye Audit** 小字副标
- 横版：mark 左、文字右，竖线分隔（见 `gpt-v2/06-logo-icons-set.png`）

---

## 模块 3 · 色彩系统延展

### 深色模式（新增 Token）

| Token | 色值 | 用途 |
|---|---|---|
| `--yy-dk-bg` | `#06121C` | 大屏/应用底 |
| `--yy-dk-surface` | `#0D1E2F` | 容器底 |
| `--yy-dk-card` | `#10263A` | 卡片/浮层 |
| `--yy-dk-text` | `#EAF2F7` | 主文字 |
| `--yy-dk-muted` | `#A9BBCB` | 次要文字 |
| `--yy-iris-dk` | `#4BE3D1` | 成功/强调 |
| `--yy-amber-dk` | `#F0B34F` | 扫描/识别 |
| `--yy-danger-dk` | `#F36C60` | 疑点 |
| `--yy-warn-dk` | `#D39118` | 线索 |
| `--yy-ok-dk` | `#22C28C` | 合规 |
| `--yy-shadow` | `#7A6AF8` | 治理 shadow（仅观察期） |

### 四态语义色

| 态 | 色 | 含义 |
|---|---|---|
| 疑点 | 红 `#DC4A3D` | 有初步证据的可疑问题 |
| 线索 | 橙 `#C77700` | 待复核、低置信提示 |
| 合规 | 绿 `#0D9B6A` | 通过、证据不足不报 |
| shadow | 紫 `#7A6AF8` | 规则观察期，仅监控不判 |

### 渐变与阴影

- 顶栏：`linear-gradient(125deg, #061829, #0B2A4A, #134E72)`
- 按钮光晕：`0 0 12px rgba(45,212,191,.25)`
- 卡片阴影：`0 4px 24px rgba(11,42,74,.08)` / `.12` / `.16` 三档

---

## 模块 4 · 字体与排版

| 层级 | 字体 | 字重 | Web | PPT |
|---|---|---|---|---|
| H1 | Noto Sans SC | 700 | 28–36px | 36pt |
| H2 | Noto Sans SC | 600 | 20–24px | 24pt |
| 正文 | Noto Sans SC | 400 | 14px | 18pt |
| 数据/KPI | DM Sans | 700 tabular | 24–28px | 28pt |
| 政策引用 | Noto Sans SC | 500 | 15px | 16pt，左竖线 |

**混排**：中英文/数字间 1/4 em；中文全角标点、英文半角；条款编号右对齐便于扫读。

**备选字体**：思源黑体（印刷稳定）、HarmonyOS Sans（屏幕现代感）

---

## 模块 5 · 图形语言与 UI 纹理

### 背景纹理三变体

1. **点阵证据场** — 8pt 细点阵，封面/页眉，监管数据感
2. **扫描线矩阵** — 横线 + 微高光，扫描/识别态
3. **规则场网格** — 正交细网格 + 交点高亮，报告/规则库

### 图标规范

- 线宽 1.75px（Web）
- 外圆角 2px，禁止气泡感
- 线性为主，填充 ≤20% 面积
- 语义色填充仅用于核心态（teal / amber / red / green）

### 证据链卡片（见 `gpt-v2/05-evidence-chain-ui.png`）

```
┌─ 状态徽章：疑点 | 线索 | 合规 ─────────────────┐
│  原始证据定位  │  政策条款原文  │  推理过程        │
│  （病历/费用行）│  （KB 逐字引） │  （步骤编号）    │
├─ 来源文件 · 时间戳 · 规则版本 · 操作人 ──────────┤
```

### 状态插画

- **空状态**：文件夹 + 放大镜 + 文本块
- **加载**：文档索引中 +「条款索引」列表渐入
- **扫描中**：琥珀扫描环 + 三要素 checklist 进度

---

## 模块 6 · 品牌语调

| 场景 | 原则 | 示例 |
|---|---|---|
| 对外 Pitch | 正式、有数据、不夸大 | 「把线索到证据的距离，缩短到 90 秒。」 |
| UI 微文案 | 简洁、可执行、无恐吓 | 「已定位 3 条可回链疑点，待复核 1 条线索。」 |
| 错误/空态 | 专业、不甩锅 | 「影像清晰度不足，建议重新上传或切换 OCR 模式。」 |

内部可说「快、准、稳」；对外必须「有依据、可核验、可审计」。

---

## 模块 7 · 应用场景

### Pitch Deck 封面三构图

| 方案 | 构图 | 气质 |
|---|---|---|
| A 居中准星型（推荐） | 大 mark 居中 + 下方 Slogan | 正式权威 |
| B 左文右图 | 左标题 + 右证据链 UI 卡片 | 功能导向 |
| C 顶栏政务型 | 深蓝顶栏 + 点阵底 | 政府报告感 |

### 展台背板

- 主句：让每一分救命钱，都查得有据
- 三图标：线索筛查 · 证据链 · 报告输出
- 背景：点阵 + 琥珀扫描弧

### 工牌色带

- Demo 蓝 / 工作人员绿 / 访客黄

### 社交尺寸

- 头像 400×400（mark 居中，16px 安全边距）
- 横幅 1500×500（左 mark + 右 Slogan）

---

## 模块 8 · 品牌故事

鹰眼不是神话里的「全知之眼」，而是监管场景里的**高精度取证工具**——帮稽核员更快、更可审计地做判断，而不是替代人。每个结论都能回链原文与条款，推理过程完整留痕，这才是与「AI 噱头」的本质区别。

---

## 参考图索引

| 文件 | 内容 |
|---|---|
| `gpt-v2/01-naming-logo.png` | 模块 1–2：命名、Slogan、Logo 三方向 |
| `gpt-v2/02-colors-typography.png` | 模块 3–4：色板、排版 |
| `gpt-v2/03-ui-textures-voice.png` | 模块 5–6：纹理、语调 |
| `gpt-v2/04-applications.png` | 模块 7：Pitch/展台/名片 |
| `gpt-v2/05-evidence-chain-ui.png` | 证据链 UI 组件 |
| `gpt-v2/06-logo-icons-set.png` | Logo + 9 图标集 |
| `gpt-v2/07-graphic-kit.png` | 图形套件 + 导航栏 |

---

## 与 v1 的差异摘要

| 项 | v1 | v2 GPT |
|---|---|---|
| 英文名 | YINGYAN | **EagleEye Audit** |
| 深色模式 | 无 | 完整 Token 表 |
| 证据链卡片 | 左色条 finding | 三列 + 元数据底栏 |
| 图标集 | 仅 logo-mark | 9 个功能图标（PNG 参考） |
| Pitch 物料 | 文案 only | 封面/展台/工牌构图 |

**合并建议**：v1 色彩与 logo-mark 保持不变；v2 的英文名、深色 Token、证据链卡片、图标集按 [`APPLICATION.md`](APPLICATION.md) 分阶段落地。
