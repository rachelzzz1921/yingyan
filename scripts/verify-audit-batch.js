#!/usr/bin/env node
'use strict';

/**
 * 验收批量稽核队列 API（需 server 运行中，或内联调用 engine）
 * 用法：node scripts/verify-audit-batch.js [--inline]
 */
const path = require('path');
const auditBatch = require('../prototype/app/engine/audit-batch');

async function inlineTest() {
  const { runAudit } = require('../prototype/app/engine/audit-engine');
  const { loadJsonKB } = require('../prototype/app/kb/retrieval');
  const fs = require('fs');
  const DATA = path.resolve(__dirname, '../prototype/data');
  const rules = JSON.parse(fs.readFileSync(path.join(DATA, 'rules/rules.json'), 'utf8')).rules;
  const maps = loadJsonKB(DATA);
  const ids = ['clean', 'main', 'drg'];
  const job = auditBatch.createJob(ids, { mode: 'oracle' });
  await auditBatch.runJob(job.id, async (caseId) => {
    const folder = caseId === 'main' ? 'case_NSCLC' : `case_${caseId}`;
    const rec = JSON.parse(fs.readFileSync(path.join(DATA, folder, 'medical_record.json'), 'utf8'));
    const t0 = Date.now();
    const rep = runAudit(rec, rules, {
      policyTexts: maps.policyTexts,
      policyVerified: maps.policyVerified,
      shadowRules: [],
      retiredRules: [],
    });
    const ms = Date.now() - t0;
    const isClean = (rec.case_meta?.embedded_violation_count ?? null) === 0;
    return {
      id: caseId,
      found_suspected: rep.report_meta.summary.suspected_count,
      found_clue: rep.report_meta.summary.clue_count,
      shadow_count: rep.report_meta.summary.shadow_count || 0,
      is_clean: isClean,
      false_positives: isClean ? rep.report_meta.summary.suspected_count : null,
      latency_ms: ms,
    };
  });
  const done = auditBatch.getJob(job.id);
  if (done.status !== 'done' || done.total !== 3 || done.results.length !== 3) {
    console.error('❌ batch job 未完成', done);
    process.exit(1);
  }
  console.log('✅ inline batch PASS —', done.summary);
}

async function httpTest() {
  const port = process.env.PORT || 3700;
  const res = await fetch(`http://127.0.0.1:${port}/api/audit/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caseIds: ['clean', 'drg'], mode: 'oracle' }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || res.status);
  const jobId = data.job.id;
  let job = data.job;
  for (let i = 0; i < 30 && job.status !== 'done' && job.status !== 'failed'; i++) {
    await new Promise(r => setTimeout(r, 200));
    const r2 = await fetch(`http://127.0.0.1:${port}/api/audit/batch/${jobId}`);
    job = await r2.json();
  }
  if (job.status !== 'done') {
    console.error('❌ HTTP batch 超时或失败', job);
    process.exit(1);
  }
  console.log('✅ HTTP batch PASS —', job.summary);
}

async function main() {
  if (process.argv.includes('--inline')) {
    await inlineTest();
    return;
  }
  try {
    await httpTest();
  } catch (e) {
    console.log('ℹ️  HTTP 不可用，回退 inline：', e.message);
    await inlineTest();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
