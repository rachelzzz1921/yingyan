#!/bin/bash
# 全量基线:低温(temp=0.2)双模型 + P5 双裁判位置交换。零模拟,全部真调 MiniMax。
set -e
cd "$(dirname "$0")/evals"
SMOKE="/private/tmp/claude-501/-Users-chenzhiwei-Desktop/cba0d689-0cf0-452f-915d-23c227aa1a2e/tasks/bg9rl7g1w.output"
echo "[baseline] 等待 smoke 完成以避免并发限流..."
until grep -q "结果 →" "$SMOKE" 2>/dev/null; do sleep 3; done
echo "[baseline] smoke 已完成,开始低温双模型基线 $(date)"

# P1-P4,P6,P7 双模型(MiniMax-Text-01 辩手 + abab6.5s-chat 对照),N=5,低温
node run.js --prompts P1,P2,P3,P4,P6,P7 --n 5 --models debater,alt --temp 0.2 --conc 6 --tag baseline_lowtemp

echo "[baseline] P5 位置交换 双裁判(异源 abab6.5s-chat + 同源对照 MiniMax-Text-01),N=5,低温0.1 $(date)"
node p5_swap_runner.js --judges judge,debater --n 5 --temp 0.1 --conc 6 --tag baseline_p5

echo "[baseline] 生成报告表格 $(date)"
node report.js --in baseline_lowtemp.json --p5 baseline_p5.json --out ../results/report_tables_v6.md
echo "[baseline] 完成 $(date)"
