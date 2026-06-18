#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const { loadG2Opts } = require('../yhf/harness/l1-prompt');

function main() {
  const html = fs.readFileSync(path.resolve(__dirname, '../prototype/app/public/priority.html'), 'utf8');
  const js = fs.readFileSync(path.resolve(__dirname, '../prototype/app/public/priority.js'), 'utf8');
  if (!html.includes('id="priTopN"') || !html.includes('btnBatchTopN')) {
    console.error('❌ priority.html 缺少 Top N 入队控件');
    process.exit(1);
  }
  if (!js.includes('runBatchTopN') || !js.includes('top_n')) {
    console.error('❌ priority.js 缺少队首 N 入队逻辑');
    process.exit(1);
  }
  console.log('✅ priority Top N UI PASS');

  const cfg = fs.readFileSync(path.resolve(__dirname, '../yhf/gate.config.yaml'), 'utf8');
  if (!/score_mode:\s*primary/.test(cfg)) {
    console.error('❌ G2 score_mode 未设为 primary');
    process.exit(1);
  }
  if (!/secondary_report:\s*true/.test(cfg)) {
    console.error('❌ G2 secondary_report 未开启');
    process.exit(1);
  }
  const g2 = loadG2Opts();
  if (g2.score_mode !== 'primary' || g2.primary_judge !== 'MiniMax-Text-01') {
    console.error('❌ loadG2Opts 解析异常', g2);
    process.exit(1);
  }
  const { loadGateConfig } = require('../yhf/lib/paths');
  const gates = loadGateConfig().gates?.G2_prompt_pass || {};
  if (!gates.enabled) {
    console.error('❌ G2 enabled 应为 true');
    process.exit(1);
  }
  console.log('✅ G2 hard gate enabled PASS');

  const runner = fs.readFileSync(path.resolve(__dirname, '../eval/evals/p5_swap_runner.js'), 'utf8');
  if (!runner.includes('CASE_FILTER')) {
    console.error('❌ p5_swap_runner 缺少 --cases 过滤');
    process.exit(1);
  }
  console.log('✅ P5 --cases 探针支持 PASS');
}

main();
