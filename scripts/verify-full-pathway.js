#!/usr/bin/env node
'use strict';
/** 鹰眼全通路验收 — 页面 + 核心 API + 错误格式 */
const http = require('http');

const BASE = process.env.BASE || 'http://localhost:3700';
let failed = 0;

function req(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(BASE + urlPath);
    const opts = {
      hostname: u.hostname,
      port: u.port || 80,
      path: u.pathname + u.search,
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
    };
    const r = http.request(opts, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(d); } catch (_) {}
        resolve({ status: res.statusCode, ct: res.headers['content-type'] || '', raw: d, json });
      });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

async function assert(name, cond, detail) {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed += 1;
  console.log(`  ✗ ${name}${detail ? ': ' + detail : ''}`);
}

async function main() {
  console.log('verify-full-pathway @', BASE);

  const pages = ['/', '/home.html', '/intake.html', '/priority.html', '/dashboard.html'];
  for (const p of pages) {
    const r = await req('GET', p);
    await assert(`GET ${p} 200`, r.status === 200, `got ${r.status}`);
  }

  const apis = [
    '/api/health',
    '/api/cases',
    '/api/priority/rank',
    '/api/rules',
    '/api/bench',
    '/api/yhf',
    '/api/intake/slots',
    '/api/review',
    '/api/history',
    '/api/priority/config',
  ];
  for (const p of apis) {
    const r = await req('GET', p);
    await assert(`GET ${p} 200 + JSON`, r.status === 200 && r.json != null, `status=${r.status}`);
  }

  const unknown = await req('GET', '/api/__pathway_unknown__');
  await assert('unknown API returns JSON 404', unknown.status === 404 && unknown.json?.error, unknown.raw.slice(0, 60));
  await assert('unknown API content-type json', (unknown.ct || '').includes('json'), unknown.ct);

  const audit = await req('POST', '/api/audit', { caseId: 'main' });
  await assert('POST /api/audit main', audit.status === 200 && Array.isArray(audit.json?.findings), `status=${audit.status}`);

  const rank = await req('GET', '/api/priority/rank');
  const caseId = rank.json?.queue?.[0]?.case_id || 'main';
  const detail = await req('GET', `/api/cases/${caseId}`);
  await assert(`GET /api/cases/${caseId}`, detail.status === 200 && detail.json?.case);

  const pkg = await req('POST', '/api/evidence-package', { case_id: caseId, format: 'json' });
  await assert('POST /api/evidence-package', pkg.status === 200 && pkg.json?.ok);

  const batch = await req('POST', '/api/audit/batch', { priority: true, top_n: 1, skip: ['uploaded'], mode: 'live' });
  await assert('POST /api/audit/batch', batch.status === 200 && batch.json?.ok, batch.json?.error || batch.raw.slice(0, 80));

  console.log(failed ? `\nFAIL (${failed})` : '\nPASS');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
