# 稽核四条通路防回归指南

> 2026-07：主工作台稽核报 `renderModeStrip is not defined`，API 正常但前端渲染失败。根因：`renderReport` 调用 `renderModeStrip` 时函数定义在后 + 浏览器可能缓存旧版 `app.js`。

## 四条通路契约

| 档位 | 前端入口 | HTTP | 后端 profile | 预期（anes 案卷） |
|------|----------|------|--------------|-------------------|
| 基础覆盖 | 开始稽核 / btnEngStd | `POST /api/audit` | `fast` | 有疑点，`engine_mode` 含「确定性规则引擎」 |
| 广度增强（RAG） | btnRag | `?rag=1` | `standard` + RAG | 有疑点，`engine_mode` 含 RAG |
| 深度增强（LLM） | btnLLM | `?mode=llm` | `deep` | 有报告（可 LLM 或回退基础覆盖） |
| 广深双增强 | btnSuperAudit | `?mode=super` | `super` | 有疑点，可含 `super_fused` |

编排单一入口：`engine/audit-pipeline.js` 的 `runAuditPipeline()`，由 `server.js` `/api/audit` 按 query/body 选 profile。

## 前端渲染链

```
runAudit() → auditFetch(/api/audit) → renderReport(report) → renderModeStrip(report)
```

**规则：**

1. `renderModeStrip` / `rectProgress` / `modeStripDeadline` 写在 `renderReport` **之前**
2. `window.renderModeStrip = renderModeStrip`（体检模式 onclick 依赖）
3. `renderModeStrip` 填充内容后 `el.classList.remove('hidden')`
4. `runAudit` catch 只展示 `e.message`，不把渲染错误伪装成「无疑点」

## 与事前提醒（precheck）的边界

| 能力 | 路径 | 编排模块 |
|------|------|----------|
| 开单事前提醒 | `/api/precheck` | `precheck-runner.js` |
| 案卷稽核 | `/api/audit` | `audit-pipeline.js` |

二者 intentionally 分离；改统一管线时**不得**假设 precheck 行为已变。

## 检查清单

- [ ] 改 `app.js` 报告渲染：确认 `renderModeStrip` 仍在 `renderReport` 之前
- [ ] 改 `/api/audit`：跑四条通路 live 烟测
- [ ] `node scripts/verify-audit-pathways.js --live`
- [ ] `bash yhf/run.sh --strict`（G6 pipeline + G7 precheck）
- [ ] 浏览器硬刷新主工作台，anes 案卷点「开始稽核」应出报告而非红字失败

## 命令

```bash
node scripts/verify-audit-pathways.js --live
node scripts/verify-precheck-plugin.js
bash yhf/run.sh --strict
```
