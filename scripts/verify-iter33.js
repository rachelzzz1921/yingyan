#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const { summarizeEvalJson, loadG2Opts } = require('../yhf/harness/l1-prompt');
const { loadGateConfig } = require('../yhf/lib/paths');

function main() {
  const v7 = path.resolve(__dirname, '../eval/prompts_v7/P5_judge_v7.txt');
  const text = fs.readFileSync(v7, 'utf8');
  for (const needle of ['S4 同 fact_id', '输出纪律', 'conflicts 数组']) {
    if (!text.includes(needle)) {
      console.error(`❌ P5 v7 缺少 iter-33 段落: ${needle}`);
      process.exit(1);
    }
  }
  console.log('✅ P5 v7 R3/R4 加固段落 PASS');

  const g2 = loadGateConfig().gates?.G2_prompt_pass || {};
  if (!g2.enabled || g2.score_mode !== 'primary') {
    console.error('❌ G2 配置异常', g2);
    process.exit(1);
  }

  const baseline = path.resolve(__dirname, '../eval/results/baseline_p5.json');
  if (!fs.existsSync(baseline)) {
    console.error('❌ baseline_p5.json 缺失');
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(baseline, 'utf8'));
  const opts = loadG2Opts();
  const pri = summarizeEvalJson(data, opts);
  const all = summarizeEvalJson(data, { score_mode: 'all', primary_judge: opts.primary_judge });
  if (pri.green_primary !== pri.total) {
    console.error(`❌ G2 主裁判未全绿 ${pri.green_primary}/${pri.total}`);
    process.exit(1);
  }
  console.log(`✅ G2 baseline 主裁判 ${pri.green_primary}/${pri.total} PASS`);
  console.log(`✅ G2 baseline 双裁判 ${all.green_all}/${all.total}${all.green_all === all.total ? ' 全绿' : '（secondary）'}`);

  const runner = fs.readFileSync(path.resolve(__dirname, '../eval/evals/p5_swap_runner.js'), 'utf8');
  if (!runner.includes('CASE_FILTER')) {
    console.error('❌ p5_swap_runner 缺少 --cases');
    process.exit(1);
  }
  console.log('✅ eval 探针基础设施 PASS');
}

main();
