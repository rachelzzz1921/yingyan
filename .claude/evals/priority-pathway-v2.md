# EVAL DEFINITION: priority-pathway-v2

> ECC eval-harness · Define phase · 对齐《鹰眼-稽核优先通路-v2-真实场景增强-构建prompt.md》§16 + 附录 A

## Capability Evals（本版新增）

| ID | 场景 | 成功标准 |
|---|---|---|
| C1 | violation_nature 映射 | 虚假住院→主观嫌疑+移交；重复收费→非主观差错+退回整改 |
| C2 | 性质升级 | 同机构反复非主观问题达阈值→升主观嫌疑 |
| C3 | DRG L3 | 分解住院/转嫁→线索+needs_more；缺分组器时 amount=null |
| C4 | 特例单议 | 已批准→Outlier 抑制；异常类 Finding 降级/不输出 |
| C5 | 举证包 | POST /api/evidence-package 含三要素+KB原文+审计链 |
| C6 | 违规统计表 | GET /api/report/violation-summary 数字与 Findings 一致、shadow 不计 |
| C7 | 9大领域加权 | risk_tags 命中→priority config 加权生效 |
| C8 | 双边模式 | 稽核/体检三态与 api_score 一致，仅口径不同 |

## Regression Evals（v1 + 不变量）

| ID | 基线 | 成功标准 |
|---|---|---|
| R1 | Gold G1–G6 | `node scripts/run-priority-gold-eval.js` 6/6 PASS |
| R2 | v1 通路 | `node scripts/verify-priority-pathway.js` PASS |
| R3 | YHF 红线 | `bash yhf/run.sh --strict` overall PASS |
| R4 | 三态 vocab | status 仅 疑点/线索；不输出零记录 |
| R5 | shadow | shadow 不计 suspected_count / api_score |

## Gold 锚点（附录 A）

- G1 挂床住院 · G2 重复收费 · G2b 升级 · G3 分解住院 L3 · G4 特例单议 · G5 不输出 · G6 shadow

## 指标

- Capability: pass@1 ≥ 8/8（代码 grader）
- Regression: pass^3 = 100%（R1–R5 全 PASS）

## 运行

```bash
node scripts/run-priority-gold-eval.js
node scripts/verify-priority-pathway.js
bash yhf/run.sh --strict
```
