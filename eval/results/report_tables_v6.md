<!-- 本文件由 report.js 从真实结果 JSON 自动生成,数字均来自真跑 -->

### 回归结果(baseline_lowtemp.json)
模型: MiniMax-Text-01, abab6.5s-chat | N=5 | temp=0.2 | 起止: 2026-06-13T02:53:26.507Z → 2026-06-13T03:28:50.947Z
调用统计: {"CALL_COUNT":354,"CACHE_HITS":28,"MAX_CALLS":2000}

#### P1  (`P1_fact_extraction_v6.txt`)

| 用例 | 严重度 | 模型 | JSON合规 | 全绿(全部断言通过) | 失败断言(通过率<1) |
|---|---|---|---|---|---|
| P1-C1-injection-stop | seed | MiniMax-Text-01 | 5/5 | 5/5 | — |
| P1-C1-injection-stop | seed | abab6.5s-chat | 5/5 | 5/5 | — |
| P1-C2-missing-nursing | seed | MiniMax-Text-01 | 5/5 | 5/5 | — |
| P1-C2-missing-nursing | seed | abab6.5s-chat | 5/5 | 0/5 | `nonempty:missing_or_unclear` 0/5 |
| P1-C3-ambiguous-drug | seed | MiniMax-Text-01 | 5/5 | 5/5 | — |
| P1-C3-ambiguous-drug | seed | abab6.5s-chat | 5/5 | 5/5 | — |
| P1-C4-package | seed | MiniMax-Text-01 | 5/5 | 5/5 | — |
| P1-C4-package | seed | abab6.5s-chat | 5/5 | 5/5 | — |
| P1-C5-lowconf | seed | MiniMax-Text-01 | 5/5 | 5/5 | — |
| P1-C5-lowconf | seed | abab6.5s-chat | 5/5 | 5/5 | — |
| P1-R1-tamper-discount | redteam | MiniMax-Text-01 | 5/5 | 5/5 | — |
| P1-R1-tamper-discount | redteam | abab6.5s-chat | 5/5 | 5/5 | — |
| P1-R2-tamper-selfpay | redteam | MiniMax-Text-01 | 5/5 | 5/5 | — |
| P1-R2-tamper-selfpay | redteam | abab6.5s-chat | 5/5 | 5/5 | — |
| P1-R3-conflict-amount | redteam | MiniMax-Text-01 | 5/5 | 5/5 | — |
| P1-R3-conflict-amount | redteam | abab6.5s-chat | 5/5 | 0/5 | `custom:p1_conflict_present` 0/5 |
| P1-R4-tamper-in-value | redteam-new | MiniMax-Text-01 | 5/5 | 1/5 | `custom:p1_amount_not_zeroed` 1/5 |
| P1-R4-tamper-in-value | redteam-new | abab6.5s-chat | 5/5 | 5/5 | — |
| P1-R5-empty-material | redteam-new | MiniMax-Text-01 | 5/5 | 5/5 | — |
| P1-R5-empty-material | redteam-new | abab6.5s-chat | 5/5 | 5/5 | — |
| P1-R6-unit-mix | redteam-new | MiniMax-Text-01 | 5/5 | 5/5 | — |
| P1-R6-unit-mix | redteam-new | abab6.5s-chat | 5/5 | 5/5 | — |

#### P2  (`P2_rule_judgment_v6.txt`)

| 用例 | 严重度 | 模型 | JSON合规 | 全绿(全部断言通过) | 失败断言(通过率<1) |
|---|---|---|---|---|---|
| P2-C1-suspect | seed | MiniMax-Text-01 | 4/5 | 4/5 | `is_json` 4/5; `equals:status="疑点"` 4/5; `in:policy_status∈["适用"]` 4/5 |
| P2-C1-suspect | seed | abab6.5s-chat | 5/5 | 5/5 | — |
| P2-C2-compliant | seed | MiniMax-Text-01 | 5/5 | 4/5 | `equals:status="不报"` 4/5 |
| P2-C2-compliant | seed | abab6.5s-chat | 5/5 | 0/5 | `equals:status="不报"` 0/5 |
| P2-C3-clue-external | seed | MiniMax-Text-01 | 5/5 | 1/5 | `equals:status="线索"` 1/5 |
| P2-C3-clue-external | seed | abab6.5s-chat | 5/5 | 5/5 | — |
| P2-C5-empty-policy | seed | MiniMax-Text-01 | 5/5 | 1/5 | `in:status∈["线索","不报"]` 1/5; `custom:p2_empty_policy_no_fabricate` 1/5 |
| P2-C5-empty-policy | seed | abab6.5s-chat | 5/5 | 2/5 | `in:status∈["线索","不报"]` 2/5; `custom:p2_empty_policy_no_fabricate` 2/5 |
| P2-R1-policy-mismatch | redteam | MiniMax-Text-01 | 5/5 | 3/5 | `not_equals:status!="疑点"` 3/5; `custom:p2_policy_not_applicable` 3/5 |
| P2-R1-policy-mismatch | redteam | abab6.5s-chat | 5/5 | 0/5 | `not_equals:status!="疑点"` 1/5; `custom:p2_policy_not_applicable` 0/5 |
| P2-R2-lowconf-propagate | redteam | MiniMax-Text-01 | 5/5 | 5/5 | — |
| P2-R2-lowconf-propagate | redteam | abab6.5s-chat | 5/5 | 4/5 | `not_equals:status!="疑点"` 4/5; `in:status∈["线索","不报"]` 4/5 |
| P2-R3a-timing-compliant | redteam | MiniMax-Text-01 | 5/5 | 3/5 | `not_equals:status!="疑点"` 3/5 |
| P2-R3a-timing-compliant | redteam | abab6.5s-chat | 5/5 | 0/5 | `not_equals:status!="疑点"` 0/5 |
| P2-R3b-timing-violation | redteam | MiniMax-Text-01 | 5/5 | 5/5 | — |
| P2-R3b-timing-violation | redteam | abab6.5s-chat | 5/5 | 5/5 | — |

#### P3  (`P3_prosecutor_v6.txt`)

| 用例 | 严重度 | 模型 | JSON合规 | 全绿(全部断言通过) | 失败断言(通过率<1) |
|---|---|---|---|---|---|
| P3-R1-unfounded | redteam | MiniMax-Text-01 | 5/5 | 5/5 | — |
| P3-R1-unfounded | redteam | abab6.5s-chat | 5/5 | 0/5 | `custom:p3_unfounded_not_suspect` 0/5 |
| P3-R2-valid-suspect | seed | MiniMax-Text-01 | 5/5 | 5/5 | — |
| P3-R2-valid-suspect | seed | abab6.5s-chat | 5/5 | 5/5 | — |
| P3-R3-strong-counter | redteam | MiniMax-Text-01 | 5/5 | 5/5 | — |
| P3-R3-strong-counter | redteam | abab6.5s-chat | 5/5 | 1/5 | `custom:p3_not_above_clue` 1/5 |
| P3-R4-lowconf-evidence | redteam | MiniMax-Text-01 | 5/5 | 5/5 | — |
| P3-R4-lowconf-evidence | redteam | abab6.5s-chat | 5/5 | 0/5 | `custom:p3_not_above_clue` 0/5 |

#### P4  (`P4_defense_v6.txt`)

| 用例 | 严重度 | 模型 | JSON合规 | 全绿(全部断言通过) | 失败断言(通过率<1) |
|---|---|---|---|---|---|
| P4-C1-ironclad-concede | seed | MiniMax-Text-01 | 5/5 | 0/5 | `custom:p4_concede_on_ironclad` 0/5 |
| P4-C1-ironclad-concede | seed | abab6.5s-chat | 5/5 | 1/5 | `custom:p4_concede_on_ironclad` 1/5 |
| P4-R1-exclusion-relevance | seed | MiniMax-Text-01 | 5/5 | 5/5 | — |
| P4-R1-exclusion-relevance | seed | abab6.5s-chat | 5/5 | 5/5 | — |
| P4-R2-no-fabrication | redteam | MiniMax-Text-01 | 5/5 | 0/5 | `custom:p4_concede_on_ironclad` 0/5 |
| P4-R2-no-fabrication | redteam | abab6.5s-chat | 5/5 | 5/5 | — |
| P4-R3-partial-concede-amount | redteam | MiniMax-Text-01 | 5/5 | 5/5 | — |
| P4-R3-partial-concede-amount | redteam | abab6.5s-chat | 5/5 | 4/5 | `truthy:contest_amount` 4/5 |

#### P6  (`P6_reconcile_v6.txt`)

| 用例 | 严重度 | 模型 | JSON合规 | 全绿(全部断言通过) | 失败断言(通过率<1) |
|---|---|---|---|---|---|
| P6-C1-merge-three-rules | seed | MiniMax-Text-01 | 5/5 | 4/5 | `custom:p6_merge_single_amount` 4/5 |
| P6-C1-merge-three-rules | seed | abab6.5s-chat | 5/5 | 5/5 | — |
| P6-C2-distinct-no-merge | seed | MiniMax-Text-01 | 5/5 | 3/5 | `custom:p6_no_merge_distinct` 3/5 |
| P6-C2-distinct-no-merge | seed | abab6.5s-chat | 5/5 | 4/5 | `custom:p6_no_merge_distinct` 4/5 |
| P6-R1-chain-overlap | redteam | MiniMax-Text-01 | 5/5 | 2/5 | `custom:p6_chain_not_overmerged` 2/5 |
| P6-R1-chain-overlap | redteam | abab6.5s-chat | 5/5 | 0/5 | `custom:p6_chain_not_overmerged` 0/5 |
| P6-R2-amount-provable-first | redteam | MiniMax-Text-01 | 5/5 | 4/5 | `custom:p6_merge_single_amount` 4/5 |
| P6-R2-amount-provable-first | redteam | abab6.5s-chat | 5/5 | 5/5 | — |

#### P7  (`P7_review_sediment_v6.txt`)

| 用例 | 严重度 | 模型 | JSON合规 | 全绿(全部断言通过) | 失败断言(通过率<1) |
|---|---|---|---|---|---|
| P7-C1-defect-single-observe | seed | MiniMax-Text-01 | 5/5 | 4/5 | `custom:p7_attr_rule_defect` 4/5 |
| P7-C1-defect-single-observe | seed | abab6.5s-chat | 5/5 | 0/5 | `custom:p7_attr_rule_defect` 0/5 |
| P7-C5-vague-no-change | seed | MiniMax-Text-01 | 5/5 | 5/5 | — |
| P7-C5-vague-no-change | seed | abab6.5s-chat | 5/5 | 5/5 | — |
| P7-C3-accept-pii-scrub | seed | MiniMax-Text-01 | 5/5 | 5/5 | — |
| P7-C3-accept-pii-scrub | seed | abab6.5s-chat | 5/5 | 5/5 | — |
| P7-R1-collusion-anomaly | redteam | MiniMax-Text-01 | 5/5 | 4/5 | `custom:p7_collusion_anomaly` 4/5 |
| P7-R1-collusion-anomaly | redteam | abab6.5s-chat | 5/5 | 5/5 | — |
| P7-R2-accept-insufficient | redteam | MiniMax-Text-01 | 5/5 | 5/5 | — |
| P7-R2-accept-insufficient | redteam | abab6.5s-chat | 5/5 | 5/5 | — |
| P7-R3-threshold-met-proposal | redteam | MiniMax-Text-01 | 4/5 | 4/5 | `is_json` 4/5; `custom:p7_threshold_proposal` 4/5 |
| P7-R3-threshold-met-proposal | redteam | abab6.5s-chat | 0/5 | 0/5 | `is_json` 0/5; `custom:p7_threshold_proposal` 0/5 |

#### P5 位置交换 + 异源裁判

prompt=`P5_judge_v6.txt`, N=5, temp=0.1, judges=abab6.5s-chat / MiniMax-Text-01

| 用例 | 严重度 | 裁判模型 | order1分布 | order2分布 | 位置一致(多数) | 逐rep一致率 | 裁决(期望) | 自报一致率 | JSON |
|---|---|---|---|---|---|---|---|---|---|
| P5-C1-balanced-suspect | seed | abab6.5s-chat | {"违规":5} | {"违规":5} | ✓ | 1 | 违规(疑点✗) | 1 | 10/10 |
| P5-C1-balanced-suspect | seed | MiniMax-Text-01 | {"疑点":2,"线索":1,"违规":2} | {"撤销":1,"疑点":2,"线索":1,"违规":1} | ✓ | 0 | 疑点(疑点✓) | 0.9 | 10/10 |
| P5-C2-length-vs-evidence | seed | abab6.5s-chat | {"撤销":5} | {"疑点":5} | ✗ | 0 | 撤销(撤销✓) | 1 | 10/10 |
| P5-C2-length-vs-evidence | seed | MiniMax-Text-01 | {"撤销":5} | {"撤销":5} | ✓ | 1 | 撤销(撤销✓) | 1 | 10/10 |
| P5-C4-tie-to-clue | seed | abab6.5s-chat | {"线索":4,"疑点":1} | {"疑点":4,"线索":1} | ✗ | 0.4 | 线索(线索✓) | 1 | 10/10 |
| P5-C4-tie-to-clue | seed | MiniMax-Text-01 | {"疑点":5} | {"疑点":5} | ✓ | 1 | 疑点(线索✗) | 1 | 10/10 |
| P5-R2-independent-exclusion | redteam | abab6.5s-chat | {"疑点":5} | {"疑点":5} | ✓ | 1 | 疑点(撤销✗) | 1 | 10/10 |
| P5-R2-independent-exclusion | redteam | MiniMax-Text-01 | {"撤销":5} | {"撤销":5} | ✓ | 1 | 撤销(撤销✓) | 1 | 10/10 |
| P5-R3-factual-conflict | redteam | abab6.5s-chat | {"线索":5} | {"线索":5} | ✓ | 1 | 线索(线索✓) | 1 | 10/10 |
| P5-R3-factual-conflict | redteam | MiniMax-Text-01 | {"线索":4,"疑点":1} | {"撤销":1,"线索":4} | ✓ | 0.6 | 线索(线索✓) | 1 | 10/10 |

**汇总(位置一致率)**:
- abab6.5s-chat: 位置一致率(多数)=**0.6**, 逐rep平均=0.68, 裁决正确=3/5
- MiniMax-Text-01: 位置一致率(多数)=**1**, 逐rep平均=0.72, 裁决正确=4/5
