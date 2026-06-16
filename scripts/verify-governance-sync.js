#!/usr/bin/env node
'use strict';

/**
 * 验收治理同步逻辑（无需 Supabase）
 */
const { renderBatchReportMarkdown } = require('../prototype/app/engine/audit-batch');

function testBatchExport() {
  const md = renderBatchReportMarkdown({
    id: 'BATCH-test',
    mode: 'oracle',
    status: 'done',
    done: 2,
    total: 2,
    updated_at: new Date().toISOString(),
    summary: { suspected_total: 6, clue_total: 1, shadow_total: 0, clean_false_positives: 0, red_line_clean_zero_fp: true, avg_latency_ms: 5 },
    results: [
      { id: 'main', title: 'NSCLC', found_suspected: 5, found_clue: 1, shadow_count: 0, latency_ms: 8, is_clean: false },
      { id: 'clean', title: '干净', found_suspected: 0, found_clue: 0, shadow_count: 0, latency_ms: 2, is_clean: true },
    ],
  });
  if (!md.includes('BATCH-test') || !md.includes('G0 红线')) {
    console.error('❌ batch markdown 不完整');
    process.exit(1);
  }
  console.log('✅ batch export markdown PASS');
}

function testAdminAuth() {
  const { checkAdmin, adminTokenConfigured } = require('../prototype/app/engine/admin-auth');
  const prev = process.env.YINGYAN_ADMIN_TOKEN;
  process.env.YINGYAN_ADMIN_TOKEN = 'test-secret';
  const bad = checkAdmin({ headers: {} });
  const good = checkAdmin({ headers: { 'x-yingyan-token': 'test-secret' } });
  if (bad.ok || !good.ok) {
    console.error('❌ admin auth 逻辑错误', bad, good);
    process.exit(1);
  }
  if (prev) process.env.YINGYAN_ADMIN_TOKEN = prev;
  else delete process.env.YINGYAN_ADMIN_TOKEN;
  console.log('✅ admin auth PASS (configured=' + adminTokenConfigured() + ')');
}

testBatchExport();
testAdminAuth();
