#!/usr/bin/env node
'use strict';

const http = require('http');
const path = require('path');
const fs = require('fs');
const auditBatch = require('../prototype/app/engine/audit-batch');
const { runPromptHarness } = require('../yhf/harness/l1-prompt');

function get(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:3700${urlPath}`, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

async function runInlineBatch(concurrency, ids) {
  const { runAudit } = require('../prototype/app/engine/audit-engine');
  const { loadJsonKB } = require('../prototype/app/kb/retrieval');
  const DATA = path.resolve(__dirname, '../prototype/data');
  const rules = JSON.parse(fs.readFileSync(path.join(DATA, 'rules/rules.json'), 'utf8')).rules;
  const maps = loadJsonKB(DATA);
  const job = auditBatch.createJob(ids, { mode: 'oracle', concurrency });
  const t0 = Date.now();
  await auditBatch.runJob(job.id, async (caseId) => {
    const folder = caseId === 'main' ? 'case_NSCLC' : `case_${caseId}`;
    const rec = JSON.parse(fs.readFileSync(path.join(DATA, folder, 'medical_record.json'), 'utf8'));
    const t1 = Date.now();
    const rep = runAudit(rec, rules, {
      policyTexts: maps.policyTexts,
      policyVerified: maps.policyVerified,
      shadowRules: [],
      retiredRules: [],
    });
    const isClean = (rec.case_meta?.embedded_violation_count ?? null) === 0;
    return {
      id: caseId,
      found_suspected: rep.report_meta.summary.suspected_count,
      found_clue: rep.report_meta.summary.clue_count,
      shadow_count: rep.report_meta.summary.shadow_count || 0,
      is_clean: isClean,
      false_positives: isClean ? rep.report_meta.summary.suspected_count : null,
      latency_ms: Date.now() - t1,
    };
  }, { concurrency });
  return { ms: Date.now() - t0, job: auditBatch.getJob(job.id) };
}

async function main() {
  const g2 = runPromptHarness();
  if (g2.status !== 'cached' || !g2.cases) {
    console.error('❌ G2 无 eval 缓存报告', g2);
    process.exit(1);
  }
  console.log(`✅ G2 report PASS — ${g2.green}/${g2.cases} (${Math.round((g2.pass_rate || 0) * 100)}%) · ${g2.source}`);

  const ids = ['clean', 'drg', 'ortho', 'anes', 'icu', 'pharmacy'];
  const par = await runInlineBatch(3, ids);
  if (par.job.status !== 'done' || par.job.results.length !== ids.length) {
    console.error('❌ batch 并发任务失败', par.job);
    process.exit(1);
  }
  if (par.job.concurrency !== 3) {
    console.error('❌ batch concurrency 字段异常', par.job.concurrency);
    process.exit(1);
  }
  if (!par.job.summary?.red_line_clean_zero_fp) {
    console.error('❌ batch 并发 G0 红线', par.job.summary);
    process.exit(1);
  }
  console.log(`✅ batch concurrency PASS — ${ids.length} 案卷 · ${par.ms}ms · G0 OK`);

  const { status, body } = await get('/api/eval/g2');
  if (status !== 200) {
    console.error('❌ /api/eval/g2 status', status);
    process.exit(1);
  }
  const api = JSON.parse(body);
  if (!api.cases || api.pass_rate == null) {
    console.error('❌ /api/eval/g2 缺通过率', api);
    process.exit(1);
  }
  console.log(`✅ /api/eval/g2 PASS — ${api.message || api.pass_rate}`);

  const bench = JSON.parse((await get('/api/bench')).body);
  if (bench.meta?.total_cases !== 22) {
    console.error('❌ bench 案卷数', bench.meta?.total_cases);
    process.exit(1);
  }
  console.log('✅ bench 22 案卷');
}

main().catch((e) => {
  console.error('❌ verify-iter29:', e.message);
  process.exit(1);
});
