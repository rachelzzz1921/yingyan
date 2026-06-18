# 构建任务书（Prompt）：鹰眼 · 医院端「稽核优先通路」

> 把本文件整段交给另一个 AI（建议具备全栈 + 数据产品能力的模型）。
> 它是自包含的：所有领域事实都已写在第 1 节，无需追问背景即可开工。

---

## 0 · 你的角色与最终产物

你是资深全栈 + 数据产品工程师。在【鹰眼】现有的「医保基金事后行政飞检稽核系统」之上，新增一条面向**医院稽核员**的闭环通路：管理患者与就诊案件、管理历史核查记录、管理导入数据（含批量导入），并通过一个**综合优先指数**筛选出"该先稽核谁"。

**产物（缺一不可）：**
1. 可运行的全栈功能（前端 + 后端），与现有 `/api/*` 契约对齐。
2. 数据模型（DDL 或等价 schema）。
3. API 契约（复用清单 + 新增端点的请求/响应示例）。
4. 综合优先指数的**完整算法实现**（含可配置权重）。
5. 种子数据 + README + 关键路径验收用例。

> 技术栈：若调用方未另行指定，默认 **前端 React + TypeScript**、**后端 FastAPI(Python)**（与现有 `/api/ingest`、PP-Structure sidecar 等迹象一致）。允许替换，但必须与现有 `/api/*` 契约兼容。

---

## 1 · 现有系统事实 —— MUST 对齐，**语义不可改、词不可换**

这是一个**事后行政飞检**系统：稽核员对**单份就诊材料包**做语义级三方交叉验证，对齐国家医保智能监控**两库（知识库 KB + 规则库）**与《医疗保障基金使用监督管理条例》**第 38 / 40 条**。它**不是事中实时 pass/fail 拦截**——是事后排序与定性。

### 1.1 数据核心：Case → Finding
- 一个 **Case** = 一份就诊材料包（= 一次患者就诊）。一个患者可有多个 Case。
- 一个 Case 经稽核产出 0..N 个 **Finding**。

### 1.2 Finding 三态（产品核心 vocab，**禁止换词**）

| 状态 | 含义 | 是否落库为 Finding |
|---|---|---|
| `疑点` | 证据闭环：三要素齐备，可直接对质 | ✅ 是 |
| `线索` | 模式异常但本材料包内无法闭环 | ✅ 是（**必须带 `needs_more[]`**） |
| `不输出` | 依赖未证实假设，或引不出任何原文 | ❌ 否（**零记录终态，不产生 Finding**） |

- **`status` 枚举只有 `"疑点" | "线索"`**；`"不输出"` 不是 status 取值，是不落库的终态（评测集里可写 `expected_status:"不输出"`）。
- 官方对齐：`疑点 ↔ 明确违规`，`线索 ↔ 可疑/需申诉`。

### 1.3 Finding 三要素（`疑点`的准入门禁，缺一即降级）
1. **原始证据定位** `evidence[]`：具体到**费用行号 / 病历页码 + 原文摘录**。
2. **违反的政策条款原文** `policy[]`：**KB 引用 ID + 条款原文**（禁止凭记忆编造）。
3. **完整推理过程** `reasoning`：逐步说明如何从证据推出违规结论。

三要素齐备 → `疑点`；任一缺失 → 降级 `线索` 或 `不输出`。

### 1.4 Finding schema（照建，字段名不可改）
```json
{
  "finding_id": "F20260612-001",
  "rule_id": "B-201",
  "status": "疑点 | 线索",
  "violation_type": "将不属于医保基金支付范围的费用纳入医保结算",
  "risk_level": "高 | 中-高 | 中 | 低",
  "amount_involved": 1280.00,
  "evidence": [{ "type": "费用行", "loc": "...", "text": "..." }],
  "policy":   [{ "ref": "KB-...", "text": "...(原文)" }],
  "reasoning": "...",
  "needs_more": []          // 线索态必填；疑点态为空数组
}
```

### 1.5 降级 / 撤销机制（写进状态机 transition guard）
- **CoVe**：`维持` / `降级线索` / `撤销`（撤销 = `不输出`）。
- **控辩裁**：辩方指出要素缺失或有效反向证据 → `降级线索` 或撤销。
- **compliance-gate**：证据 <2 项 / 政策未核验 / 推理过短 → `疑点→线索`。
- **L3 规则**：设计上只出 `线索`（跨就诊、外部资质数据等）。

### 1.6 shadow（**叠加标记，不是状态**）
- Finding 可带 `shadow: true`，**不改变 `status`**，仍展示完整证据链，但**不计入** `suspected_count` / `suspected_amount`。
- 统计口径（已实现，须照用）：
```
active   = findings.filter(f => !f.shadow)
suspected= active.filter(f => f.status === '疑点')
clues    = active.filter(f => f.status === '线索')
shadowed = findings.filter(f => f.shadow)   // 单独桶，沉底展示
```

### 1.7 规则治理三态（**与 Finding 三态不同，勿混**）
`draft → shadow → active`（另有 `deprecated`）。这是规则生命周期，不是 Finding 状态。

### 1.8 体检模式
仅切换**展示口径**（如把暴露口径显示为「飞检暴露金额 / 风险点数」），**不改三态、不改分数、不改数据**。

### 1.9 现有导入 / 批量接口（复用，勿重造）
统一产物：单份就诊的 **`medical_record` JSON 材料包**——
- 必备：`case_meta` + `front_page` + `fee_list.items[]`
- 可选（按槽位合并）：入院 / 病程 / 医嘱 / 检验 / 专科记录 等；关键事实带 **`anchor`** 源定位。

入口：
- `POST /api/ingest` 三模式：
  - `structured`：粘贴/上传完整 JSON。
  - `document`：jpg/png 走视觉模型抽取；PDF 走 PP-Structure sidecar；无 key 时仅给契约提示。
  - `connector`：Mock-HIS 拉 encounter。
- `POST /api/intake/batch`：多文件 base64 → 按**文件名/内容/JSON 结构自动分类到 17 个槽位** → 合并注册为 `uploaded` 案卷；支持 JSON / CSV 费用清单 / 纯文本 / PDF 图像；支持 `merge` 增量补全。
- `POST /api/audit/batch`：对**已有 `case_id` 列表**做批量稽核入队，**不是 raw 导入**。

---

## 2 · 要建的五个能力

### 2.1 患者 / 案件管理
- 层级 **Patient → Case → Finding**。患者档案聚合其全部 Case；Case 详情展示 Finding 树 + 证据链（点 `evidence.loc` / `anchor` 可跳到原文/费用行）。
- Case 生命周期：`uploaded`（已导入未稽核）→ `auditing` → `audited`。
- 列表支持按患者维度聚合与按 Case 维度展开两种视图。

### 2.2 历史核查记录管理
- 记录每次稽核：Case、产出的 Finding（含最终 status、CoVe/控辩裁结论、compliance-gate 结果）、稽核员、时间、状态流转轨迹（审计日志）。
- 衍生分析：**患者 / 科室 / 医生 的历史命中率**（= 历史 active findings 数或涉及金额 / 稽核 Case 数）。此数据**回喂** 2.5 的优先指数（HistoryPrior）。

### 2.3 导入数据管理
- 展示每个 Case 的**槽位填充状态**（17 槽中已填哪些）、数据完整度、anchor 覆盖率、来源（structured/document/connector/batch）。
- 支持 `merge` 增量补全、重新导入、查看抽取契约提示（无 key 场景）。

### 2.4 批量导入（UI 包装 `/api/intake/batch`）
- 拖拽多文件 → 实时进度 → 展示**自动分类结果（落到哪个槽位）** → 冲突/重复/失败处理 → 合并注册为 `uploaded` 案卷。
- 与 2.3 打通：批量结果直接进导入数据管理视图。

### 2.5 综合优先筛选引擎（**核心**）
见第 3 节。输出一个**可排序的稽核队列**；稽核员可多选 Top-N → 调 `POST /api/audit/batch` 入队。

---

## 3 · 综合稽核优先指数（Audit Priority Index, `api_score`）

**目标**：在事后飞检场景下，把"证据更闭环、暴露金额更大、罚则更重、且历史更可疑"的案件排到最前，最大化稽核员有限工时的回收价值与定性可靠性。

**作用域**：Case 级；仅对 `active`（`!shadow`）findings 计算。`不输出` 不入（本就不落库）。无 active findings 的 Case 不进排序（或 `api_score=0`）。

### 3.1 硬分层（对齐"疑点 > 线索"）
```
tier(c) = 1  若 ∃ f∈active(c): f.status == '疑点'
        = 2  否则（纯线索案件）
```
排序主键 = `tier` 升序（tier1 先）；其后才看 `api_score`。

### 3.2 三因子（每个归一到 [0,1]）

记 `A = active(c)`，`amt_f = max(f.amount_involved, ε)`，`S = Σ_{f∈A} f.amount_involved`。

**① 证据闭环度 EC**（金额加权的疑点占比）
```
w(疑点)=1.0 ; w(线索)=W_CLUE (默认 0.4)
EC = Σ_{f∈A} w(f)·amt_f  /  Σ_{f∈A} amt_f
```

**② 暴露金额 AMT**（log 归一，防大额吞没）
```
AMT = clip( ln(1+S) / ln(1+AMT_CAP), 0, 1 )
AMT_CAP = config（默认 = 案件总额 P95，或 ¥100000）
```

**③ 罚则严重度 SEV**
```
sev(risk_level): 高=1.0, 中-高=0.75, 中=0.5, 低=0.25
条例条款加权: 若 violation 映射《条例》第40条(欺诈骗保) → sev = min(1.0, sev+0.15)；第38条不变
SEV = 0.6·max_{f∈A} sev(f) + 0.4·( Σ sev(f)·amt_f / Σ amt_f )
```

### 3.3 核心分（默认几何均值；可切加权和）
```
core = (EC · AMT · SEV) ^ (1/3)            # 默认，贴合"× 三因子"直觉，比裸乘更稳
# 备选(config 切换): core = w1·EC + w2·AMT + w3·SEV , Σw=1
```

### 3.4 三个调整乘子（把 Q2 四信号收进来，均 ≥1）
```
HistoryPrior = 1 + β · H        # H = max{患者,科室,医生} 历史命中率∈[0,1]，取自 2.2；β默认0.5
Breadth      = 1 + γ · clip(distinct_rule_ids(c) / R_REF, 0, 1)   # γ默认0.3, R_REF默认5
Outlier      = 1 + δ · 1[ S 在同DRG/科室内离群 (>P95 或 >均值+2σ) ]  # δ默认0.2
```
> "诊断–操作–收费不匹配"这一信号已由命中它的规则进入 SEV 与 Breadth，无需单列；若需强调，可在 config 给该 `violation_type` 类目额外权重。

### 3.5 最终分与排序
```
api_score = round( 100 · core · HistoryPrior · Breadth · Outlier , 1 )

排序: ORDER BY tier ASC, api_score DESC, S DESC
```

### 3.6 必须遵守
- **shadow findings 永不进 `api_score`**；在队列里单独沉底桶展示。
- **体检模式**只改展示标签（飞检暴露金额/风险点数），`api_score`、`status`、数据均不变。
- 所有权重（`W_CLUE, AMT_CAP, β, γ, δ, R_REF, w1/w2/w3, 几何/加权切换`）写进**可视化可调的 config**，并在 UI 暴露当前生效值（可解释、可审计）。
- 每个 `api_score` 必须可**展开归因**：显示 EC/AMT/SEV 各自取值与三乘子，便于稽核员理解"为何这条排前面"。

---

## 4 · 数据模型（新增 / 对齐）

```
Patient(  patient_id PK, name(可脱敏), id_no(可脱敏), gender, birth, ... )
Case(     case_id PK, patient_id FK, case_meta(json), front_page(json),
          status ENUM(uploaded,auditing,audited), source ENUM(structured,document,connector,batch),
          slots_filled(json/array), completeness float, created_at, ... )
FeeItem(  item_id PK, case_id FK, line_no, name, code, qty, price, amount, anchor(json) )   # fee_list.items[]
Finding(  见 1.4 全字段; + case_id FK, shadow bool default false, created_at )
AuditRecord( audit_id PK, case_id FK, auditor_id, started_at, finished_at,
             cove_result, defense_result, compliance_gate_result, status_transitions(json) )
ImportBatch( batch_id PK, files(json), classified(json: file→slot), result_case_ids(array),
             created_at, errors(json) )
PriorityScore( case_id PK/FK, tier, ec, amt, sev, core, hist_prior, breadth, outlier,
               api_score, config_snapshot(json), computed_at )   # 可缓存，亦可即时计算
```
（DDL 与 ORM 自定，字段名对齐第 1 节者**不可改**。）

---

## 5 · API 契约

**复用（勿重造）：** `POST /api/ingest`、`POST /api/intake/batch`、`POST /api/audit/batch`（语义见 1.9）。

**新增（示例，路径可调但语义照此）：**
- `GET  /api/patients` / `GET /api/patients/{id}`：患者列表 / 档案（聚合其 Cases）。
- `GET  /api/cases?status=&dept=&doctor=&q=`：案件列表（支持筛选）。
- `GET  /api/cases/{case_id}`：Case 详情（front_page + fee_list + Finding 树 + anchors）。
- `GET  /api/cases/{case_id}/imports`：该 Case 的导入/槽位填充状态。
- `GET  /api/history?patient_id=&dept=&doctor=&from=&to=`：历史核查记录 + 命中率分析。
- `GET  /api/priority/rank?dept=&doctor=&risk_level=&amount_min=&amount_max=&status=&from=&to=`
  → 返回**已排序队列**：`[{case_id, tier, api_score, breakdown:{ec,amt,sev,hist_prior,breadth,outlier}, suspected_count, suspected_amount, top_violation}]`。
- `GET/PUT /api/priority/config`：读/改优先指数权重（改动写审计日志）。
- `POST /api/audit/batch`（复用）：传 `priority/rank` 勾选的 `case_id[]` 入队。

---

## 6 · 界面（screens）

1. **稽核队列（首屏）**：按 `api_score` 排序的案件卡片/表；每行显示 tier 徽标（疑点/线索）、api_score、暴露金额、Top violation、命中率提示；可展开**分数归因**；支持上方筛选条（科室/医生/风险等级/金额区间/状态/日期）；多选 → "加入批量稽核"按钮（调 `/api/audit/batch`）；**shadow 桶沉底单独区**。
2. **案件详情**：左 front_page + 基本信息；中 `fee_list` 表（行号、金额、anchor 跳转）；右 **Finding 树**（疑点/线索分组，每条展开三要素：evidence 定位 / policy 原文+KB ref / reasoning；标注 CoVe·控辩裁·compliance-gate 结果与 needs_more）。
3. **患者档案**：聚合该患者全部 Case、历史 Finding、个人历史命中率。
4. **历史核查记录 / 命中率分析**：按患者/科室/医生维度的命中率与金额排行（即 HistoryPrior 的可视化来源）。
5. **导入中心**：三入口（structured / document / connector）+ 批量拖拽区；批量展示自动分类到 17 槽的结果、完整度、错误与重复处理、merge 增量补全。

---

## 7 · 流程闭环（必须打通）
```
导入(/api/ingest 或 /api/intake/batch) → Case=uploaded
  → 稽核产出 Finding(疑点/线索；不输出不落库；可带 shadow)
  → /api/priority/rank 计算 api_score 并排序
  → 稽核员筛选 + 勾选 Top-N → /api/audit/batch 入队 → Case=auditing
  → 复核(CoVe/控辩裁/compliance-gate)定性 → Case=audited
  → 写入 AuditRecord(历史)
  → 历史命中率回喂 HistoryPrior，影响后续排序
```

---

## 8 · 数据安全与合规（医院患者数据 = 敏感医疗信息）
- **脱敏开关**：列表/导出可隐去 `name`/`id_no`（保留 anchor 定位与 case_id 关联），默认对非必要场景脱敏。
- **基于角色的访问 + 操作审计日志**：谁查看了哪个患者、谁稽核了哪个 Case、谁改了 config，全部留痕（可追溯、可复现）。
- PII **不进日志、不进 URL query**；批量导入文件落本地处理、不外发第三方。
- 与现有"证据必须引原文、政策必须引 KB 原文（禁止编造）"一致：所有展示的 policy/evidence 必须可回溯到源。

---

## 9 · 交付与验收

**交付：** 可运行前后端 + DDL/schema + API 示例 + 优先指数实现 + 种子数据（含至少 3 个 Case：一个含疑点、一个纯线索、一个含 shadow，便于演示分层与不计分）+ README + 验收用例。

**验收标准（关键路径）：**
1. 批量拖入混合文件（JSON + CSV 费用清单 + PDF 图像）→ 自动分类落槽 → 注册为 `uploaded` 案卷，导入中心可见槽位填充状态。
2. 稽核队列默认排序正确：**含疑点案件全部排在纯线索案件之前**；层内按 api_score 降序；改 config 权重后排序实时更新。
3. 任一案件可展开 api_score 归因，EC/AMT/SEV + 三乘子数值与公式一致。
4. shadow finding 不计入 suspected_count/suspected_amount，且不影响 api_score，在沉底桶单独展示。
5. 勾选 Top-N → `/api/audit/batch` 入队 → 定性后写入历史 → 该患者/科室/医生历史命中率更新 → 再次排序时 HistoryPrior 生效。
6. 体检模式切换后展示口径改变，但 api_score 与三态数值不变。
7. 开启脱敏后列表/导出不含明文 PII；所有 policy/evidence 可回溯到源定位。

---

## 10 · 给你的硬约束（再强调）
- 第 1 节的 vocab 与 schema **照搬**：三态只 `疑点/线索`、`不输出`零记录、三要素门禁、shadow 不计分、规则治理三态勿混。
- 复用现有 `/api/ingest`、`/api/intake/batch`、`/api/audit/batch`，**勿重造导入**。
- 优先指数权重全 config 化、可解释、可审计；这是事后排序工具，**不是事中 pass/fail**。
- 不确定的实现细节（字段、栈）可自行合理补全，但**对齐第 1 节的部分不得改动**；补全处在 README 标注"假设"。
```
