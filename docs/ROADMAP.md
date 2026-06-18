# 鹰眼 · 迭代路线图 v2.0

> **看板入口**：启动原型后打开 [http://localhost:3700/dashboard.html](http://localhost:3700/dashboard.html)  
> **最后更新**：2026-06-16 · 与 `prototype/docs/TASKS.md` 对齐

---

## 已完成（Phase 1–3 ✅ · Phase 4 进行中）

| Phase | 交付 | 链接 |
|---|---|---|
| P1 YHF Harness | Oracle 门禁、G0 红线、`/api/yhf` | [yhf/README.md](../yhf/README.md) · [gate_latest.md](../yhf/results/gate_latest.md) |
| P2 品牌 | Logo、DESIGN 规范 | [assets/brand/DESIGN.md](../assets/brand/DESIGN.md) |
| P3 UI | 工作台美化、AuditBench+YHF | [prototype/app/public/](../prototype/app/public/) |
| **P4 GIAC** | as_of · Parse QA · 合规层 · Bench 20 · G1 shadow | `bash yhf/run.sh --strict` ✅ |

---

## 迭代路径总览

```
iter-19 (shadow治理) ──► iter-20 (双模式) ──► 【当前】看板+YHF
                                              │
         ┌────────────────────────────────────┼────────────────────────────┐
         ▼                                    ▼                            ▼
   Phase 4 评测闭环                    Phase 5 治理深化              Phase 6 生产化
   gold同步·L2用例·L4准入              LLM+shadow·三审模板            OCR·批量·鉴权
         │                                    │                            │
         └──────────────── iter-21 ──────────┴──────── iter-22~24 ────────┘
```

---

## Phase 4 — 评测闭环（iter-21）🔜 下一迭代

*Goal：YHF 从 scaffold 变为完整门禁；AuditBench ≥20 案卷叙事成立。*

| ID | 任务 | 优先级 | 验收 | 状态 |
|---|---|---|---|---|
| T4-1 | 同步 `main` 案卷 `expected_findings.json`（5→6 疑点对齐引擎） | P0 | L3 recall PASS | ✅ |
| T4-2 | 核心 10 规则补 `test_cases[]`（≥3阳+≥3阴） | P0 | L2 missing=0（核心集） | ✅ |
| T4-3 | L4 shadow harness 接规则准入 UI（三验 FPR≤10%） | P1 | 治理页显 shadow_metrics | ✅ G1 strict |
| T4-4 | L1 自动 spawn eval 或 CI 读 baseline JSON | P1 | G2 report 有通过率 | ✅ report-only iter-29 |
| T4-5 | AuditBench 扩至 20 案卷（+5 边界干扰） | P1 | bench 仪表盘 20 行 | ✅ |
| T4-6 | `yhf gate --strict` 接入 GitHub Actions / 本地 pre-push | P2 | CI 文档 | ✅ |

**Definition of Done**：`bash yhf/run.sh --strict` G0+G4+G1 ✅；看板工程成熟度区可见。

---

## Phase 5 — 治理与语义路径（iter-22）

*Goal：shadow 公理覆盖 LLM 路径；三审三验可演示。*

| ID | 任务 | 优先级 | 验收 |
|---|---|---|---|
| T5-1 | LLM `/api/audit?mode=llm` 接 shadow post-process | P0 | B07c 关闭 |
| T5-2 | deprecated 规则在 routing 条显「已下线」 | P1 | B07d 收尾 |
| T5-3 | 三审 Agent prompt 模板（Policy/Clinical/Engineering） | P1 | 1 条规则走通 demo |
| T5-4 | 驳回原因内联表单（替 prompt()） | P2 | B09 |
| T5-5 | 机构画像导出 PDF / 打印样式 | P2 | B08b 轻量 |

---

## Phase 6 — 输入与专科扩展（iter-23）

*Goal：多模态与专科边界件丰富 AuditBench。*

| ID | 任务 | 优先级 | 验收 |
|---|---|---|---|
| T6-1 | PP-StructureV3 / Claude Vision 真填 anchor.bbox | P1 | 点击高亮有坐标 |
| T6-2 | 江苏价格目录导入 KB1（iter-20 research 备料） | P1 | A-105 等引用 ✅ |
| T6-3 | 麻醉/重症/药店边界干扰件 +3 | P2 | B10 |
| T6-4 | G 类时序 / H 类离群占位→首个 checker | P2 | B05 起步 |

---

## Phase 7 — 批量与机构级（iter-24）

*Goal：飞检批量编排 + 画像趋势架构。*

| ID | 任务 | 优先级 | 验收 |
|---|---|---|---|
| T7-1 | 批量队列 API + 进度条 | P1 | 100 案卷 demo |
| T7-2 | 机构画像多时间断面 schema | P2 | 趋势图占位 |
| T7-3 | 事前提醒规则建议导出（扩2） | P2 | 文档+mock |

---

## Phase 8 — 生产态（产品化前）

| ID | 任务 | 说明 |
|---|---|---|
| T8-1 | rule_states / review → DB + 鉴权 | 单机 JSON → 多用户 |
| T8-2 | GoRules ZEN 替换 F 类 L1 | 05 文档选型 |
| T8-3 | 88 类规则库 KB1 基线抓取 | B03 |
| T8-4 | 暗色模式 / 移动端复核台 | 可选 |

---

## BACKLOG 索引（来自 TASKS.md）

| ID | 状态 | 链接 |
|---|---|---|
| B07c | LLM+shadow | Phase 5 T5-1 |
| B07d | routing 下线标 | Phase 5 T5-2 |
| B08b | 画像 PDF/趋势 | Phase 5 T5-5 / Phase 7 |
| B09 | 驳回内联输入 | Phase 5 T5-4 |
| B10 | 专科边界件 | Phase 6 T6-3 |
| B04 | 真 OCR | Phase 6 T6-1 |
| B05 | G/H 类 | Phase 6 T6-4 |

---

## 工程纪律（不可破）

1. **Oracle ≠ Live ≠ Shadow** — bench/gate 只用 Oracle  
2. **G0 红线** — 干净件误报 = 0  
3. **定义/状态分离** — rules.yaml vs rule_states.json  
4. **变更必过 gate** — prompt / 规则 / 模型

---

## 看板数据 API

| 端点 | 用途 |
|---|---|
| `GET /api/yhf` | YHF 门禁指标 |
| `GET /api/bench` | AuditBench |
| `GET /api/health` | 规则数、LLM |
| `GET /api/rule-governance` | shadow/deprecated |
| `GET /api/institution` | 机构画像汇总 |
