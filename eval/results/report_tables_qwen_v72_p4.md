<!-- 本文件由 report.js 从真实结果 JSON 自动生成,数字均来自真跑 -->

### 回归结果(qwen_v72_p4.json)
模型: Qwen/Qwen2.5-72B-Instruct, Qwen/Qwen2.5-32B-Instruct | N=5 | temp=0.2 | 起止: 2026-07-02T12:10:16.693Z → 2026-07-02T12:14:43.127Z
调用统计: {"CALL_COUNT":41,"CACHE_HITS":0,"MAX_CALLS":2600}

#### P4  (`P4_defense_v7.txt` **[v7]**)

| 用例 | 严重度 | 模型 | JSON合规 | 全绿(全部断言通过) | 失败断言(通过率<1) |
|---|---|---|---|---|---|
| P4-C1-ironclad-concede | seed | Qwen/Qwen2.5-72B-Instruct | 5/5 | 5/5 | — |
| P4-C1-ironclad-concede | seed | Qwen/Qwen2.5-32B-Instruct | 5/5 | 5/5 | — |
| P4-R1-exclusion-relevance | seed | Qwen/Qwen2.5-72B-Instruct | 5/5 | 5/5 | — |
| P4-R1-exclusion-relevance | seed | Qwen/Qwen2.5-32B-Instruct | 5/5 | 5/5 | — |
| P4-R2-no-fabrication | redteam | Qwen/Qwen2.5-72B-Instruct | 5/5 | 1/5 | `custom:p4_concede_on_ironclad` 1/5 |
| P4-R2-no-fabrication | redteam | Qwen/Qwen2.5-32B-Instruct | 5/5 | 5/5 | — |
| P4-R3-partial-concede-amount | redteam | Qwen/Qwen2.5-72B-Instruct | 5/5 | 5/5 | — |
| P4-R3-partial-concede-amount | redteam | Qwen/Qwen2.5-32B-Instruct | 5/5 | 5/5 | — |
