#!/bin/bash
# 完整迭代周期:v6 重基线(含round2+修瞬时失败) → P5 修正重判 → v7 全量重跑(防回归) → 高温鲁棒性 → 报告。
# 零模拟。成功样本走缓存(免费),仅新增/失败样本真调。
set -e
cd "$(dirname "$0")/evals"
export MAX_CALLS=2600
echo "[cycle] 等待其它 MiniMax 进程结束..."
while pgrep -f "run.js\|p5_swap_runner.js" >/dev/null 2>&1; do sleep 5; done

echo "[cycle] (1/5) v6 重基线(纳入 round2 新案 + 重试瞬时 fetch 失败) $(date)"
node run.js --prompts P1,P2,P3,P4,P6,P7 --n 5 --models debater,alt --temp 0.2 --conc 5 --tag baseline_lowtemp

echo "[cycle] (2/5) P5 v7 位置交换重判(修正 C4/R2/R4 + 新案 P5-R4) $(date)"
node p5_swap_runner.js --judges judge,debater --n 5 --temp 0.1 --conc 5 --v7 --tag baseline_p5

echo "[cycle] (3/5) v7 全量重跑:P1/P2/P4/P6 用 v7,P3/P5/P7 回退 v6(缓存命中) $(date)"
node run.js --prompts P1,P2,P3,P4,P6,P7 --n 5 --models debater,alt --temp 0.2 --conc 5 --v7 --tag v7_lowtemp

echo "[cycle] (4/5) 高温(0.7)鲁棒性:辩手模型,v6 与 v7 各跑改动过的 P1/P2/P4/P6 $(date)"
node run.js --prompts P1,P2,P4,P6 --n 5 --models debater --temp 0.7 --conc 5 --tag robust_v6_hi
node run.js --prompts P1,P2,P4,P6 --n 5 --models debater --temp 0.7 --conc 5 --v7 --tag robust_v7_hi

echo "[cycle] (5/5) 失败汇总 + 报告表格 $(date)"
node failures.js --in baseline_lowtemp.json > ../results/failures_v6.txt 2>&1 || true
node failures.js --in v7_lowtemp.json > ../results/failures_v7.txt 2>&1 || true
node report.js --in baseline_lowtemp.json --p5 baseline_p5.json --out ../results/report_tables_v6.md
node report.js --in v7_lowtemp.json --out ../results/report_tables_v7.md
echo "[cycle] 完成 $(date)"
