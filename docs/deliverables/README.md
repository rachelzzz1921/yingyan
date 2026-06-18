# 鹰眼 · 交付文档包

> 面向 **黑客松评委路演** 与 **医保稽核员实操** 的三份材料，对齐 iter-36 工程状态（双主线：单案卷稽核 + 稽核优先通路 v2）。

## 文件索引

| 文件 | 读者 | 用途 |
|---|---|---|
| [鹰眼-使用指南.md](./鹰眼-使用指南.md) | 评委 / 稽核员 / 开发者 | 快速上手、操作手册、API 与验收命令 |
| [architecture/鹰眼-逻辑架构与迭代.html](./architecture/鹰眼-逻辑架构与迭代.html) | 技术评审 / 协作者 | 分层架构、数据流、Phase 4–8 路线图（可打印） |
| [architecture/鹰眼-逻辑架构与迭代-中文版.html](./architecture/鹰眼-逻辑架构与迭代-中文版.html) | 评审 / 外包作图 | **全中文节点标注**的架构与迭代图 |
| [ppt/index.html](./ppt/index.html) | 路演 / 内部分享 | 瑞士风 IKB 网页 PPT（← → 翻页，约 30 页） |
| [ppt/PPT-逐页详细大纲.md](./ppt/PPT-逐页详细大纲.md) | 外包 AI / 设计师 | **30 页高密度逐页规格**（上屏文案、讲者稿 45–90s、Demo 脚本、附录 finding/Q&A/数字库） |

## 预览方式（请在浏览器中打开）

**不要**在 Cursor 里直接点击 `.html` 文件（会显示源代码）。先启动原型，再用浏览器访问：

```bash
cd prototype/app && node server.js
open http://localhost:3700/deliverables/
```

| 材料 | 浏览器 URL |
|---|---|
| 文档入口 | http://localhost:3700/deliverables/ |
| 路演 PPT（← → 翻页） | http://localhost:3700/deliverables/ppt/index.html |
| 逻辑架构图 | http://localhost:3700/deliverables/architecture/鹰眼-逻辑架构与迭代.html |
| 逻辑架构图（中文版） | http://localhost:3700/deliverables/architecture/鹰眼-逻辑架构与迭代-中文版.html |
| PPT 逐页大纲（给外包 AI） | docs/deliverables/ppt/PPT-逐页详细大纲.md |

macOS 也可：

```bash
open http://localhost:3700/deliverables/ppt/index.html
```

在线演示（无需本地启动）：

- 稽核工作台：https://yingyan.vercel.app/
- 项目看板：https://yingyan.vercel.app/dashboard.html
- 优先通路：https://yingyan.vercel.app/priority.html

## 验收命令（文档中引用的命令应全部 PASS）

```bash
bash yhf/run.sh --strict
node scripts/verify-priority-pathway.js
node scripts/verify-dashboard-frontend.js
node scripts/run-priority-gold-eval.js
```

## 诚实标注

- 规则库 **58 条** ≠ 全部现场 fire；确定性 checker 覆盖约 **14 条**核心规则（肿瘤/骨科/DRG 等）。
- 默认路径为**确定性引擎**；配置 `ANTHROPIC_API_KEY` 后可走 LLM 语义路径。
- 政策条款引用以 KB `verify_status` 为准，标 ⚠ 待核验者须人工比对官方原件。

*最后更新：2026-06-18 · 与 `prototype/docs/ITERATION_REPORTS.md` iter-36 对齐*
