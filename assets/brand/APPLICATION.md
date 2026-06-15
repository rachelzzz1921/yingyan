# 鹰眼 · 品牌应用指南

> 如何把 [`DESIGN.md`](DESIGN.md)（v1 正式）与 [`DESIGN-v2-gpt.md`](DESIGN-v2-gpt.md)（GPT 候选）落到产品里。

---

## 资产地图

```
assets/brand/
├── DESIGN.md              ← 工程基准（色彩 Token、logo SVG）
├── DESIGN-v2-gpt.md       ← GPT 完整方案 + 参考图索引
├── APPLICATION.md         ← 本文件
├── logo.svg / logo-mark.svg
└── gpt-v2/*.png           ← GPT 出图参考（非正式 SVG）

prompts/品牌元素生成.md     ← 复用 Prompt

prototype/app/public/
├── style.css              ← 工作台样式（finding 卡片、顶栏）
├── dashboard.css          ← 看板样式
├── index.html             ← 顶栏 wordmark
└── favicon.svg            ← 与 logo-mark 同步
```

**看板入口**：启动原型 → [dashboard.html](http://localhost:3700/dashboard.html) → 侧栏「品牌规范」

---

## 当前已落地（v1）

| 元素 | 位置 | 状态 |
|---|---|---|
| logo-mark SVG | `assets/brand/logo-mark.svg` | ✅ |
| 色彩 Token | `style.css` / `dashboard.css` `:root` | ✅ |
| 疑点/线索左色条 | `.finding.疑点` / `.finding.线索` | ✅ |
| shadow 紫态 | `.finding.shadow` | ✅ |
| 点阵背景 | `body` radial-gradient | ✅ |
| 顶栏渐变 | `.topbar` / `.dash-header` | ✅ |
| 字体 Noto + DM Sans | `index.html` Google Fonts | ✅ |

---

## 分阶段应用 v2

### Phase A · 文案对齐（0 代码，立即可做）

| 动作 | 改哪里 |
|---|---|
| 英文副标 **YINGYAN → EagleEye Audit** | `index.html` `.brand-en`、`dashboard.html` |
| Pitch 封面用 v2 Slogan 方向 | `docs/06-Pitch文案.md` |
| UI 微文案按模块 6 改写 | `app.js` 按钮/空态文案 |

### Phase B · CSS Token 扩展（小 diff）

1. 在 `style.css` `:root` 追加 v2 深色 Token（见 DESIGN-v2-gpt 模块 3）
2. 追加语义色别名：`--yy-danger` / `--yy-warn` / `--yy-ok` 与现有 `--red` / `--amber` / `--green` 对齐
3. 阴影三档：`--shadow-sm` / `--shadow-md` / `--shadow-lg`

```css
/* 示例：追加到 style.css :root */
--yy-danger: #DC4A3D;
--yy-warn: #C77700;
--yy-ok: #0D9B6A;
--yy-shadow: #7A6AF8;
--shadow-sm: 0 2px 8px rgba(11,42,74,.06);
--shadow-md: 0 4px 24px rgba(11,42,74,.08);
--shadow-lg: 0 8px 32px rgba(11,42,74,.12);
```

### Phase C · 证据链卡片 UI（中 diff，高价值）

参照 `gpt-v2/05-evidence-chain-ui.png`，在稽核报告 finding 展开区增加三列布局：

```
原始证据定位 | 政策条款原文 | 推理过程
─────────────────────────────────────
来源文件 · 时间戳 · 规则版本
```

- **改文件**：`app.js`（finding 渲染）、`style.css`（`.evidence-chain` 网格）
- **数据已有**：引擎输出的 `evidence`、`policy_ref`、`reasoning` 字段可直接映射

### Phase D · 图标 SVG 化（设计活）

GPT 的 9 图标（`06-logo-icons-set.png`）目前是 PNG 参考，需手绘 SVG 后放入：

```
assets/brand/icons/
  clue.svg      线索
  doubt.svg     疑点
  ok.svg        合规
  evidence.svg  证据链
  rules.svg     规则库
  scan.svg      飞行检查
  ...
```

然后在工作台侧栏 / Pitch 物料中引用。

### Phase E · Pitch / 展台物料

| 物料 | 参考图 | 工具 |
|---|---|---|
| Deck 封面 A | `04-applications.png` | Keynote / Canva |
| 展台背板 | 同上 | 打印店 |
| 工牌 | 色带规范 | 胸牌模板 |

文案直接从 `docs/06-Pitch文案.md` + v2 Slogan 取。

---

## 不建议直接用的

| GPT 产出 | 原因 | 替代 |
|---|---|---|
| PNG logo | 非矢量，缩放糊 | 继续用 `logo-mark.svg` |
| GPT 整页排版 PNG | 无法进代码 | 提取 Token/布局写 CSS |
| 换主色 | v1 已在原型全站生效 | 只在 v2 文档里作备选 |

---

## 验收清单

- [ ] 顶栏显示「鹰眼 EagleEye Audit」
- [ ] 看板「品牌规范」页展示 v2 参考图画廊
- [ ] finding 卡片有三列证据链（Phase C）
- [ ] Pitch Deck 封面采用 v2 方案 A
- [ ] 深色 Token 写入 CSS（可选，大屏演示用）

---

## 相关链接

- [品牌规范 v1](DESIGN.md)
- [GPT 方案 v2](DESIGN-v2-gpt.md)
- [生成 Prompt](../../prompts/品牌元素生成.md)
- [Pitch 文案](../../docs/06-Pitch文案.md)
