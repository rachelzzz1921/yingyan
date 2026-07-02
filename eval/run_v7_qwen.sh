#!/bin/bash
# C2 千问迁移全量回归(赛前D0):同一套 v6/v7 用例在 SiliconFlow Qwen 家族上重跑。
# 与 run_v7.sh 的区别:
#   ① EVAL_PROVIDER=siliconflow → debater=Qwen2.5-72B / judge,alt=Qwen2.5-32B(异源裁判=同家族跨规模)
#   ② 全部 tag 加 qwen_ 前缀 → 不覆盖 MiniMax 基线(yhf gate G2 读 baseline_p5.json,不能被打脏)
# 零模拟。成功样本走缓存(cacheKey 含模型名,天然与 MiniMax 缓存隔离)。
set -e
cd "$(dirname "$0")/evals"
export EVAL_PROVIDER=siliconflow
export MAX_CALLS=2600
echo "[qwen-cycle] 等待其它 eval 进程结束..."
while pgrep -f "run.js\|p5_swap_runner.js" >/dev/null 2>&1; do sleep 5; done

echo "[qwen-cycle] (1/4) v6 基线 @ Qwen(P1-P7,n=5,低温) $(date)"
node run.js --prompts P1,P2,P3,P4,P6,P7 --n 5 --models debater,alt --temp 0.2 --conc 5 --tag qwen_baseline_lowtemp

echo "[qwen-cycle] (2/4) P5 v7 位置交换重判 @ Qwen $(date)"
node p5_swap_runner.js --judges judge,debater --n 5 --temp 0.1 --conc 5 --v7 --tag qwen_baseline_p5

echo "[qwen-cycle] (3/4) v7 全量 @ Qwen:P1/P2/P4/P6 用 v7,P3/P5/P7 回退 v6 $(date)"
node run.js --prompts P1,P2,P3,P4,P6,P7 --n 5 --models debater,alt --temp 0.2 --conc 5 --v7 --tag qwen_v7_lowtemp

echo "[qwen-cycle] (4/4) 失败汇总 + 报告表格 $(date)"
node failures.js --in qwen_baseline_lowtemp.json > ../results/failures_qwen_v6.txt 2>&1 || true
node failures.js --in qwen_v7_lowtemp.json > ../results/failures_qwen_v7.txt 2>&1 || true
node report.js --in qwen_baseline_lowtemp.json --p5 qwen_baseline_p5.json --out ../results/report_tables_qwen_v6.md || true
node report.js --in qwen_v7_lowtemp.json --out ../results/report_tables_qwen_v7.md || true
echo "[qwen-cycle] 完成 $(date)"
