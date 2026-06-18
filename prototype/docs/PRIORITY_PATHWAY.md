# 稽核优先通路（v2 · 真实场景增强）

> iter-28 · Node + JSON · ECC eval-harness 验收  
> v1 基础见下文；v2 增强对齐《鹰眼-稽核优先通路-v2-真实场景增强-构建prompt.md》

## v2 增强摘要

| # | 能力 | 模块/端点 |
|---|---|---|
| ① | `violation_nature` + 处置建议 + 反复升级 | `priority-nature.js` |
| ② | DRG L3 线索 + 病历首页一致性 | `priority-enrich.js` |
| ③ | `special_case_review` 离群抑制 | `priority-score.js` |
| ④ | 举证包 PDF/HTML | `POST /api/evidence-package` |
| ⑤ | 违规点认定 + 费用统计表 | `GET /api/report/violation-summary` |
| ⑥ | 9大领域 `risk_tags` + DIP 辅助维度 | `priority-enrich.js` |
| ⑦ | 自查清单 | `GET /api/checklist` |
| 横切 | AuditRecord 留痕 timeline/申辩 | `priority-store.js` |

## ECC 验收

```bash
node scripts/run-priority-gold-eval.js      # 附录 A G1–G6
node scripts/verify-priority-pathway.js
bash yhf/run.sh --strict
```

Eval 定义：`.claude/evals/priority-pathway-v2.md`  
Eval 报告：`.claude/evals/priority-pathway-v2.log`

---

# 稽核优先通路（v1 基础）

## 能力概览

| 能力 | 入口 |
|---|---|
| 稽核优先队列（首屏） | `/priority.html` |
| 看板摘要 | `dashboard.html#priority` |
| 导入（复用） | `/api/ingest` · `/api/intake/batch` |
| 批量稽核（复用） | `POST /api/audit/batch` |

## 数据落盘

`prototype/data/priority/store.json`：

- `patients` / `cases` / `audit_records` / `import_batches` / `audit_log`
- `config`：优先指数权重（W_CLUE, AMT_CAP, β, γ, δ …）

## 新增 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/patients` | 患者列表（默认脱敏） |
| GET | `/api/patients/{id}` | 患者档案 + Cases |
| GET | `/api/cases?detail=1&status=&dept=&q=` | 案件列表（扩展原 `/api/cases`） |
| GET | `/api/cases/{case_id}` | Case 详情 + Finding 缓存 |
| GET | `/api/cases/{case_id}/imports` | 槽位填充 / 导入状态 |
| GET | `/api/history` | 历史核查 + 命中率 |
| GET | `/api/priority/rank` | **已排序队列** + shadow 桶 |
| GET/PUT | `/api/priority/config` | 读/改权重（写 audit_log） |

## api_score 公式

```
tier = 1 若含 active 疑点；2 若仅线索；3 无 active
EC, AMT, SEV → core（默认几何均值）
api_score = round(100 × core × HistoryPrior × Breadth × Outlier, 1)
ORDER BY tier ASC, api_score DESC, S DESC
```

**shadow findings 永不进 api_score**（沉底桶单独展示）。

## 启动与验收

```bash
cd prototype/app
node server.js

# 可选：写入种子 audit_records（HistoryPrior 演示）
node ../../scripts/seed-priority-store.js

# 关键路径验收（需 server 已起）
node ../../scripts/verify-priority-pathway.js
```

## 验收清单（prompt §9）

1. 批量导入 → `/api/intake/batch` → `uploaded` 案卷 → 导入中心可见槽位
2. 队列：含疑点案卷全部排在纯线索之前；层内 api_score 降序
3. 归因面板 EC/AMT/SEV + 三乘子与公式一致
4. shadow 不计 suspected_count / api_score
5. 勾选 Top-N → `/api/audit/batch` → 写入 audit_records → HistoryPrior 更新
6. 体检模式只改展示口径（priority 页 checkbox），分数不变
7. 默认 mask_pii 脱敏列表姓名

## 假设（README 标注）

- **持久化**：JSON 文件，非 Postgres DDL（与 demo 原型一致；字段名对齐 prompt §4）
- **前端**：vanilla JS，非 React（与用户确认的底座对齐）
- **Finding 缓存**：首次 `/api/priority/rank` 对案卷跑确定性引擎并缓存 findings
