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
  const prevY = process.env.YINGYAN_ADMIN_TOKEN;
  const prevS = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.YINGYAN_ADMIN_TOKEN = 'test-secret';
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bad = checkAdmin({ headers: {} });
  const good = checkAdmin({ headers: { 'x-yingyan-token': 'test-secret' } });
  process.env.YINGYAN_ADMIN_TOKEN = '';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc-key';
  const goodSvc = checkAdmin({ headers: { authorization: 'Bearer svc-key' } });
  if (bad.ok || !good.ok || !goodSvc.ok || goodSvc.mode !== 'supabase_service') {
    console.error('❌ admin auth 逻辑错误', bad, good, goodSvc);
    process.exit(1);
  }
  if (prevY) process.env.YINGYAN_ADMIN_TOKEN = prevY;
  else delete process.env.YINGYAN_ADMIN_TOKEN;
  if (prevS) process.env.SUPABASE_SERVICE_ROLE_KEY = prevS;
  else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  console.log('✅ admin auth PASS (configured=' + adminTokenConfigured() + ')');
}

testBatchExport();
testAdminAuth();
