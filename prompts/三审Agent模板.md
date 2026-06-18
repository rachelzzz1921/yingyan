# 三审 Agent 模板（规则准入 · in_review 阶段）

> 配套 `docs/05-竞品二轮与论文武器库.md` §4 与 `rules.yaml` governance_model。  
> 状态机：`draft → in_review(三审) → shadow(三验) → active → re_review/deprecated`

## 适用对象

- **新规则提案**进入 `in_review` 时，按 Policy / Clinical / Engineering 三角色各审一次，**任一审打回即退回 draft**。
- **演示样例**：`GET /api/three-review/demo`（规则 T-201 · 基因检测与病理一致性）。

## 输入契约

```json
{
  "rule_id": "T-201",
  "rule_name": "基因检测与病理诊断一致性",
  "policy_basis": ["KB1-…"],
  "trigger_logic": "…",
  "exclusions": ["…"],
  "sample_finding": { "evidence": [], "status": "疑点" }
}
```

## Round 1 · 政策合规审（Policy）

**角色**：政策合规 Agent  
**铁律**：`policy_basis` 每条须在 KB1 检索到原文；凭记忆写条款 → 打回。

**输出格式**：

1. KB1 命中摘录（ref_id + 逐字 ≤80 字）
2. 规则措辞与政策原文是否一致（是/否 + 差异点）
3. 裁决：`通过` | `打回`（打回须写补证路径）

## Round 2 · 临床合理审（Clinical）

**角色**：临床合理 Agent  
**铁律**：用 KB2 反查合理情形，补全 `exclusions`；未覆盖常见合理情形 → 打回。

**输出格式**：

1. 合理情形清单（≥2 条，带临床依据类型）
2. 当前 exclusions 缺口
3. 裁决：`通过` | `打回`

## Round 3 · 工程可执行审（Engineering）

**角色**：工程可执行 Agent  
**铁律**：`trigger_logic` 对任意标准材料包须产出三态之一（疑点 / 线索 / 不报）；不可执行或恒真/恒假 → 打回。

**输出格式**：

1. 触发路径（材料字段 → 判定）
2. 边界用例预判（≥1 阳 + ≥1 阴）
3. 裁决：`通过` | `打回`

## 演示样例（T-201）

| 轮次 | 角色 | 要点 |
|------|------|------|
| 控方 | 稽核员 | 病理未报 EGFR 突变却收基因检测费 → 疑点 |
| 辩方 | 院方 | 外院已检、本院病理聚焦手术标本 → 要求补材料 |
| 裁判 | 合规裁量 | 部分成立 → 降为**线索**，要求外院报告入卷 |

## 与 shadow 三验的关系

三审通过 ≠ 直接 active。须进入 **shadow（三验）**：红蓝对抗 + 双盲一致性 + 影子运行 FPR≤10%（见看板「规则准入」与 `yhf/harness/l4-shadow.js`）。

## 工作台入口

- 疑点卡「对抗辩论」→ 真·控辩裁 LLM 路径
- 看板 `#three_review` → 本模板固定演示
