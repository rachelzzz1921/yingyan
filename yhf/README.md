# YHF · 鹰眼 Harness Framework（核对稿 v0.1）

> **状态**：草案，供核对后再深入实现。  
> **设计内核**：继承 prototype iter-12→19 **shadow 治理**已验证的三条工程纪律，把「评测」和「治理」用同一套 harness 语言描述。

---

## 1. 为什么要做 YHF

当前鹰眼有三套互不连通的评测路径：

| 现有 | 测什么 | 问题 |
|---|---|---|
| `eval/evals/` | P1–P7 prompt | 与引擎/案卷 gold 脱节 |
| `prototype /api/bench` | 案卷级引擎 | 不接 prompt、不接规则单测 |
| shadow 治理（运行期） | 误报降权 | 没有独立的「三验·影子运行」harness |

文档里写「AuditBench 与三审三验影子运行共用基础设施」，代码上还没做到。  
**YHF 的目标**：不重写 prototype / eval，用 **adapter + 统一门禁** 把它们串起来。

---

## 2. 从 Shadow 继承的三条公理（必须遵守）

这三条在 iter-12→19 已跑通，是 YHF 的 **不可妥协约束**。

### 公理 A · 关注点分离（Oracle ≠ Live ≠ Shadow）

```
Oracle  — 纯引擎，零治理叠加          → 测「规则/引擎写对了没有」
Live    — 引擎 + rule_states 叠加    → 测「运行期误报有没有被降权」
Shadow  — 单规则静默观察，不计分      → 测「新规则准不准上 active」
```

**硬规则**：
- CI / 回归 **只跑 Oracle**，禁止把 `review_feedback` 或 `rule_states` 注入 bench。
- Live 才读 `currentShadowRules()` / `currentRetiredRules()`。
- Shadow harness 只产出 `shadow_metrics{}`，不写正式报告、不改疑点计数。

> 出处：`prototype/docs/ITERATION_REPORTS.md` iter-12——「bench 保持纯引擎 red line oracle，不被运行期治理叠加污染」。

### 公理 B · 安全缺省（空 overlay = 旧行为）

| 空输入 | 期望行为 |
|---|---|
| 无 `--mode` | 等同 `oracle` |
| 空 `rule_states.json` | 全部规则 active |
| 空 `review_feedback.json` | 无 shadow 自动转移 |
| 无 `--gate` | 只跑、不拦 merge |

任何新 harness 选项必须是 **opt-in 叠加层**；默认路径与 iter-19 基线 bit-identical（或指标等价）。

### 公理 C · 定义与状态分离（可逆治理）

```
rules.yaml          → 规则定义（what / how to check）
rule_states.json    → 治理状态（active / shadow / deprecated）
review_feedback.json→ 运行期误报信号（触发 re_review）
yhf/cases/          → 测试资产（gold / 红蓝用例）
```

- 改规则定义 → 过 **Oracle Gate**
- 改治理状态 → 不过 Oracle，只影响 Live / Shadow 统计
- restore 必须清零有效驳回（`ack_rejects`），shadow 再准入需重新攒阈值

---

## 3. 三种运行模式（RunMode）

```javascript
// yhf/lib/modes.js — 概念 API
runAudit(record, rules, {
  mode: 'oracle' | 'live' | 'shadow',
  shadowRules: [],      // live/shadow 时生效
  shadowObserve: 'T-201' // shadow harness：只观察此规则，其余正常计分
})
```

| 模式 | shadowRules | 计分 | 典型调用方 |
|---|---|---|---|
| `oracle` | 忽略 | 全量 findings 计入 | `yhf gate --layer engine`、AuditBench |
| `live` | 读 `rule_states.json` | shadow 命中不计分 | `/api/audit` |
| `shadow` | `[targetRuleId]` | 仅统计 target 规则 vs gold，不进 summary | 规则准入三验 |

**MVP 实现策略**：不先改 `audit-engine.js` 签名，而是在 harness 层用 **wrapper** 组装 `options`：

```javascript
function resolveRunOptions(mode, env) {
  if (mode === 'oracle') return { shadowRules: [], retiredRules: [] };
  if (mode === 'live')  return { shadowRules: currentShadowRules(), retiredRules: currentRetiredRules() };
  // shadow 模式由 l4-shadow.js 按单规则传入
}
```

---

## 4. 四层 Harness（测什么，不重复造轮子）

```
                    ┌─────────────────────────────────────┐
  yhf gate          │  G0 干净件 FP=0  │  G1 shadow FPR   │
  (变更门禁)         │  G2 prompt 全绿  │  G3 时延预算     │
                    └─────────────────────────────────────┘
                                      ▲
        ┌──────────────┬──────────────┼──────────────┬──────────────┐
        │ L1 Prompt    │ L2 Rule      │ L3 Engine    │ L4 Shadow    │
        │ 包装 eval/   │ 单规则 6 用例 │ 包装 bench   │ 静默 metrics │
        └──────────────┴──────────────┴──────────────┴──────────────┘
                                      ▲
                              yhf/cases/ 统一资产（渐进迁移）
```

| 层 | 职责 | MVP 做法 | 后置 |
|---|---|---|---|
| **L1** | 7 个 prompt 回归 | 调用 `eval/evals/run.js`，读其结果 JSON | 用例迁到 `yhf/cases/prompts/` |
| **L2** | 每规则 ≥3 阳 + ≥3 阴 | 从 `rules.yaml` 读 `test_cases[]`，缺则 skip+warn | 红队 agent 补用例 |
| **L3** | 案卷 gold 回归 | 复用 `runAudit` + `expected_findings`，Oracle 模式 | 对齐 `/api/bench` 指标 |
| **L4** | 三验·影子运行 | 对 target 规则跑 shadow 模式，写 `shadow_metrics` | 接历史复核集 |

**MVP 范围（核对用）**：先做 **L3 + Gate G0**，L1 接 eval  exit code，L2/L4 只出 scaffold + skip。

---

## 5. 变更门禁 Gate（四道门）

配置见 `gate.config.yaml`。

| 门 | 条件 | 来源 | MVP |
|---|---|---|---|
| **G0** | 干净案卷误报疑点 = 0 | L3 Engine / AuditBench | ✅ 必做 |
| **G1** | 变更规则 shadow FPR ≤ 10% | L4 Shadow | ⏳ scaffold |
| **G2** | 关联 prompt 断言通过率 = 100% | L1 Prompt | ⏳ 接 eval 报告 |
| **G3** | 单案 P95 时延 ≤ 90000ms | L3 计时 | ⏳ 仅报告不拦 |

```bash
# 核对稿 CLI 形态
node yhf/gate.js                    # 默认：L3 oracle + G0
node yhf/gate.js --layer engine,prompt
node yhf/gate.js --mode oracle      # 显式 oracle（默认）
node yhf/gate.js --rule T-201       # 额外跑 L4 shadow（单规则）
node yhf/gate.js --strict           # G0 失败 exit 1（CI 用）
node yhf/gate.js --report md        # 输出 yhf/results/gate_report.md
```

---

## 6. 统一 TestCase Schema（渐进，不 blocking MVP）

MVP **不强制**迁移 eval 用例；L3 继续读 `prototype/data/case_*/expected_findings.json`。  
Schema 供 L2/L4 和后续合并用：

```yaml
# yhf/schema/testcase.schema.yaml（摘要）
id: "T-201-R01"
layer: rule          # prompt | rule | case | shadow
rule_id: "T-201"
case_ref: "main"     # prototype 案卷 id
kind: positive       # positive | negative | boundary | adversarial
expect:
  fire: true
  status: "疑点"     # 疑点 | 线索 | 不报
  min_amount: 4700
  anchors: ["F037"]
governance:
  shadow_threshold_fpr: 0.10
```

---

## 7. 目录结构（核对稿）

```
yhf/
├── README.md                 ← 本文件
├── gate.config.yaml          ← G0–G3 阈值
├── gate.js                   ← 门禁 CLI（MVP：L3 + G0）
├── lib/
│   ├── modes.js              ← oracle/live/shadow options 解析
│   ├── paths.js              ← 指向 prototype/data、eval/
│   └── report.js             ← 统一报告格式
├── harness/
│   ├── l1-prompt.js          ← 包装 eval（后置）
│   ├── l2-rule.js            ← 单规则（scaffold）
│   ├── l3-engine.js          ← Oracle 案卷回归（MVP 核心）
│   └── l4-shadow.js          ← 单规则 shadow metrics（scaffold）
├── schema/
│   └── testcase.schema.yaml
└── results/                  ← gate 输出（gitignore）
    └── .gitkeep
```

**依赖关系**：`yhf` 通过 `require('../prototype/app/engine/audit-engine')` 调用引擎，**不复制**引擎逻辑。

---

## 8. L3 Engine Harness 行为（MVP 核心，与现有 bench 对齐）

与 `server.js /api/bench` 逻辑一致，但：

1. **强制 Oracle 模式**（不传 shadowRules）
2. **可读 gold**：对比 `expected_findings.json`（有则算 recall，无则只报 FP）
3. **输出结构化报告**：供 gate 和 dashboard 消费

```javascript
// 每个案卷产出
{
  case_id: "main",
  mode: "oracle",
  is_clean: false,
  expected_suspected: 5,
  found_suspected: 5,
  false_positives: 0,        // 仅 clean 案卷
  latency_ms: 4,
  pass: true,
  failures: []               // ["FP: B-201 on clean"]
}
```

**G0 判定**：所有 `is_clean === true` 的案卷 `found_suspected === 0`（与现 bench `red_line_clean_zero_fp` 一致）。

---

## 9. L4 Shadow Harness 行为（scaffold，核对设计）

用于规则准入「三验·影子运行」，**不是**运行期 live shadow。

```javascript
// 输入
{ rule_id: "T-201", cases: ["main","clean","ortho",...], mode: "shadow" }

// 对每个案卷：runAudit(..., { shadowObserve: "T-201" })
// 或等价：只统计该 rule 的 findings vs gold

// 输出 → 可写入 rules 的 shadow_metrics
{
  rule_id: "T-201",
  cases_run: 10,
  true_positive: 4,
  false_positive: 0,
  false_negative: 1,
  precision: 0.80,
  fpr: 0.00,
  pass: true   // fpr <= gate.config shadow_max_fpr
}
```

与 **Live shadow** 的区别：

| | Live shadow | L4 shadow harness |
|---|---|---|
| 触发 | 复核驳回 ≥3 | 人工 / CI `--rule` |
| 目的 | 保护稽核员不被坏规则误伤 | 决定规则能否转 active |
| 计分 | 主报告不计，findings 仍展示 | 只产 metrics，无正式报告 |
| 数据 | `rule_states.json` | `shadow_metrics{}` on rule |

---

## 10. 与现有系统的关系（不推翻 iter-19）

```
eval/evals/run.js     ──L1 包装──►  yhf/gate.js
prototype/audit-engine ◄──require──  yhf/harness/l3-engine.js
prototype/server /api/bench          保留；yhf 与之指标对齐，可后续改为调 yhf
prototype/rule_states.json           仅 Live 模式读取；gate 默认不碰
```

**原则**：YHF 是 **编排层 + 门禁层**，不是第三套引擎。

---

## 11. MVP 交付清单（请你核对）

| # | 交付物 | 说明 |
|---|---|---|
| 1 | `yhf/README.md` | 本核对稿 |
| 2 | `gate.config.yaml` | G0–G3 阈值 |
| 3 | `harness/l3-engine.js` | Oracle 案卷回归，复用 prototype 数据 |
| 4 | `gate.js` | `--strict` 时 G0 失败 exit 1 |
| 5 | `lib/modes.js` | 三模式 options 解析（文档+代码一致） |
| 6 | `harness/l4-shadow.js` | scaffold，跑通单规则 metrics 打印 |
| 7 | `harness/l1-prompt.js` | stub，打印「请手动跑 eval/run.js」 |
| 8 | `harness/l2-rule.js` | stub，扫描 rules 缺 test_cases 的规则 |

**明确不做（等核对后再定）**：
- 不改 `audit-engine.js` 加 `mode` 字段（先用 options 包装）
- 不迁移 eval 47 用例到 yhf
- 不做三审 Agent 自动化
- 不做 HTML dashboard（先 markdown 报告）

---

## 12. 待你确认的问题

1. **Gate 默认层**：是否同意 MVP 只拦 **G0（干净件零误报）**，G2 prompt 先 report-only？
2. **案卷集**：L3 是否用 prototype 现有全部案卷（含 uploaded 排除），与 `/api/bench` 完全一致？
3. **Gold 标准**：有 `expected_findings.json` 的案卷才算 recall；没有的只参与 G0，是否 OK？
4. **L4 准入线**：shadow FPR ≤ 10% 是否与文档一致？precision 是否也要 ≥ 90%？
5. **CLI 名**：`yhf/gate.js` vs 根目录 `npm run gate` — 偏好哪种？
6. **下一步优先级**：核对通过后，先做 L4 完整实现，还是先 L2 规则 6 用例批量？

---

## 13. 一句话

> **YHF = Shadow 的三条公理 + 四层 harness 编排 + 四道变更门禁；MVP 只保证 Oracle 案卷回归与 G0 红线，其余层 scaffold 不 blocking。**

核对 OK 后，按 §11 清单逐项实现并跑通 `node yhf/gate.js --strict`。
