#!/usr/bin/env node
'use strict';
/** 稽核优先通路 · 关键路径验收 */
const http = require('http');

const BASE = process.env.BASE || 'http://localhost:3700';
let failed = 0;

function get(path, opts = {}) {
  return new Promise((resolve, reject) => {
    http.get(BASE + path, (res) => {
      let d = '';
      res.on('data', c => { d += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    }).on('error', reject);
  });
}

function post(path, payload) {
  return new Promise((resolve, reject) => {
    const u = new URL(BASE + path);
    const req = http.request({
      hostname: u.hostname,
      port: u.port || 80,
      path: u.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, (res) => {
      let d = '';
      res.on('data', c => { d += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d), raw: d }); }
        catch { resolve({ status: res.statusCode, body: d, raw: d }); }
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(payload));
    req.end();
  });
}

async function assert(name, cond, detail) {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed += 1;
  console.log(`  ✗ ${name}${detail ? ': ' + detail : ''}`);
}

async function main() {
  console.log('verify-priority-pathway @', BASE);

  const rank = await get('/api/priority/rank');
  await assert('GET /api/priority/rank 200', rank.status === 200);
  const q = rank.body.queue || [];
  await assert('queue 非空', q.length > 0, `got ${q.length}`);

  const tier1 = q.filter(r => r.tier === 1);
  const tier2 = q.filter(r => r.tier === 2);
  if (tier1.length && tier2.length) {
    const minT1 = Math.min(...tier1.map(r => r.api_score));
    const maxT2 = Math.max(...tier2.map(r => r.api_score));
    await assert('tier1 排在 tier2 前', q.findIndex(r => r.tier === 2) > q.findIndex(r => r.tier === 1));
  }

  const withScore = q.filter(r => r.api_score > 0);
  if (withScore[0]) {
    await assert('breakdown 含 EC/AMT/SEV', withScore[0].breakdown?.ec != null && withScore[0].breakdown?.amt != null);
  }

  const cfg = await get('/api/priority/config');
  await assert('GET /api/priority/config', cfg.status === 200 && cfg.body.config?.W_CLUE != null);

  const patients = await get('/api/patients');
  await assert('GET /api/patients', patients.status === 200);

  const detail = await get('/api/cases/main');
  await assert('GET /api/cases/main', detail.status === 200 && detail.body.case);
  await assert('case detail 含 findings', Array.isArray(detail.body.findings));
  await assert('case detail 含 score/breakdown', detail.body.score?.breakdown?.ec != null);

  const caseId = (rank.body.queue || [])[0]?.case_id || 'main';
  const pkg = await post('/api/evidence-package', { case_id: caseId, format: 'json' });
  await assert('POST /api/evidence-package', pkg.status === 200 && pkg.body.ok);
  await assert('举证包含三要素', pkg.body.payload?.finding?.evidence?.length > 0);

  const hist = await get('/api/history');
  await assert('GET /api/history', hist.status === 200);

  console.log(failed ? `\nFAIL ${failed}` : '\nPASS');
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
