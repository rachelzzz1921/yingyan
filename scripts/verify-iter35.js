#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(buf) }); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function main() {
  const mod = path.resolve(__dirname, '../prototype/app/engine/review-debate.js');
  const { appendDebateReview } = require(mod);
  const store = { entries: [] };
  const entry = appendDebateReview(store, {
    caseId: 'main',
    finding: { finding_id: 'F-test', rule_id: 'T-201', status: '疑点' },
    debate: { verdict: '降级线索', p5_verdict: '线索', verdict_reason: 'test', prompt: 'P5_judge_v7.txt', position_swap_consistent: true },
  });
  if (entry.action !== '控辩裁' || entry.source !== 'p5_debate' || store.entries.length !== 1) {
    console.error('❌ appendDebateReview', entry);
    process.exit(1);
  }
  console.log('✅ review-debate 模块 PASS');

  const DATA = path.resolve(__dirname, '../prototype/data');
  const { loadRegistry } = require('../prototype/app/engine/case-id');
  const { loadJsonKB } = require('../prototype/app/kb/retrieval');
  const { runAudit } = require('../prototype/app/engine/audit-engine');
  const rules = JSON.parse(fs.readFileSync(path.join(DATA, 'rules/rules.json'), 'utf8')).rules;
  const maps = loadJsonKB(DATA);
  const reg = loadRegistry();
  const boundaryIds = (reg.entries || []).filter(e => e.bench_tier === 'boundary').map(e => e.api_id);
  if (boundaryIds.length < 9) {
    console.error('❌ registry boundary 案卷过少', boundaryIds.length);
    process.exit(1);
  }
  let fp = 0;
  for (const id of boundaryIds) {
    const folder = id === 'main' ? 'case_NSCLC' : `case_${id}`;
    const recPath = path.join(DATA, folder, 'medical_record.json');
    if (!fs.existsSync(recPath)) {
      console.error('❌ 缺案卷', id, recPath);
      process.exit(1);
    }
    const rec = JSON.parse(fs.readFileSync(recPath, 'utf8'));
    const rep = runAudit(rec, rules, {
      policyTexts: maps.policyTexts,
      policyVerified: maps.policyVerified,
      shadowRules: [],
      retiredRules: [],
    });
    const isClean = (rec.case_meta?.embedded_violation_count ?? null) === 0;
    const sus = rep.report_meta.summary.suspected_count;
    if (isClean && sus > 0) {
      console.error(`❌ boundary 误报 ${id}: suspected=${sus}`);
      process.exit(1);
    }
    if (isClean) fp += sus;
  }
  console.log(`✅ boundary oracle G0 PASS — ${boundaryIds.length} 案卷 · 误报合计 ${fp}`);

  if (!fs.existsSync(path.resolve(__dirname, '../.github/workflows/eval-smoke.yml'))) {
    console.error('❌ eval-smoke.yml 缺失');
    process.exit(1);
  }
  console.log('✅ eval-smoke workflow 存在');

  const base = process.env.VERIFY_BASE || 'http://localhost:3700';
  try {
    const bench = await get(`${base}/api/bench`);
    if (bench.status !== 200 || !bench.data.meta?.boundary_cases) {
      console.error('❌ /api/bench 无 boundary meta', bench.status);
      process.exit(1);
    }
    if (!bench.data.meta.boundary_zero_fp) {
      console.error('❌ bench boundary_zero_fp', bench.data.meta);
      process.exit(1);
    }
    const hasTier = bench.data.cases?.some(c => c.bench_tier);
    if (!hasTier) {
      console.error('❌ bench cases 无 bench_tier');
      process.exit(1);
    }
    console.log(`✅ /api/bench boundary PASS — ${bench.data.meta.boundary_cases} 边界案卷`);
  } catch (e) {
    console.log(`⏭ HTTP bench 探针跳过: ${e.message}`);
  }
}

main().catch((e) => {
  console.error('❌ verify-iter35:', e.message);
  process.exit(1);
});
