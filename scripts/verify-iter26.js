#!/usr/bin/env node
'use strict';

const { runL1ProductionCheck } = require('../prototype/app/engine/l1-production');
const { renderBatchReportHtml } = require('../prototype/app/engine/audit-batch');

async function main() {
  const html = renderBatchReportHtml({
    id: 'BATCH-test',
    mode: 'oracle',
    status: 'done',
    done: 1,
    total: 1,
    updated_at: new Date().toISOString(),
    summary: { suspected_total: 1, clue_total: 0, shadow_total: 0, red_line_clean_zero_fp: true },
    results: [{ id: 'main', title: '测试', found_suspected: 1, found_clue: 0, shadow_count: 0, latency_ms: 5, is_clean: false }],
  });
  if (!html.includes('window.print') || !html.includes('批量初筛报告')) {
    console.error('❌ HTML 报告不完整');
    process.exit(1);
  }
  console.log('✅ batch HTML/PDF export PASS');

  const l1 = await runL1ProductionCheck();
  console.log(`✅ L1 production check — tier=${l1.production_tier} pass=${l1.pass}/${l1.checks.length}`);
  if (!l1.ready_for_demo && l1.production_tier === 'offline') {
    console.log('   ℹ️  sidecar 未启动（demo 可跳过）');
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
