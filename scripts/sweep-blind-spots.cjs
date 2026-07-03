#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BASE = process.env.BASE || 'http://localhost:3700';
const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'prototype/data');
const RUN_ID = process.env.RUN_ID || 'sweep-1';

let failed = 0;
const results = [];

async function dbg(hypothesisId, message, data) {
  // #region agent log
  await fetch('http://127.0.0.1:7664/ingest/82cc9e84-dfb6-4801-8348-532350165d81', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '449912' },
    body: JSON.stringify({
      sessionId: '449912',
      runId: RUN_ID,
      hypothesisId,
      location: 'scripts/sweep-blind-spots.cjs',
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

async function req(method, urlPath, body, hypothesisId) {
  const started = Date.now();
  let res;
  try {
    res = await fetch(BASE + urlPath, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    await dbg(hypothesisId, 'request network error', { method, urlPath, error: e.message, durationMs: Date.now() - started });
    return { ok: false, status: 0, json: null, raw: '', ct: '', durationMs: Date.now() - started, error: e.message };
  }
  const ct = res.headers.get('content-type') || '';
  const raw = await res.text();
  let json = null;
  try { json = JSON.parse(raw); } catch (_) {}
  const out = { ok: res.ok, status: res.status, json, raw, ct, durationMs: Date.now() - started };
  await dbg(hypothesisId, 'request complete', { method, urlPath, status: out.status, ok: out.ok, jsonOk: !!json, durationMs: out.durationMs });
  return out;
}

function assert(name, cond, detail = '') {
  results.push({ name, ok: !!cond, detail });
  console.log(cond ? `  ✓ ${name}` : `  ✗ ${name}${detail ? ': ' + detail : ''}`);
  if (!cond) failed += 1;
}

function fileB64(p) {
  return fs.readFileSync(p).toString('base64');
}

function backupRuntime() {
  const files = ['review_feedback.json', 'rule_states.json', 'eval_draft_queue.json', 'priority/store.json'];
  const snap = {};
  for (const rel of files) {
    const p = path.join(DATA, rel);
    snap[rel] = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  }
  return () => {
    for (const [rel, text] of Object.entries(snap)) {
      const p = path.join(DATA, rel);
      if (text == null) {
        try { fs.rmSync(p); } catch (_) {}
      } else {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, text);
      }
    }
  };
}

async function ensurePdfSample() {
  const pdf = path.join(DATA, 'intake_samples/鹰眼演示-住院费用清单-王建国.pdf');
  if (!fs.existsSync(pdf)) {
    spawnSync('python3', [path.join(ROOT, 'scripts/generate-intake-demo-pdf.py')], { cwd: ROOT, stdio: 'ignore' });
  }
  return pdf;
}

async function sweepIntake() {
  const pdf = await ensurePdfSample();
  const payload = {
    merge: false,
    files: [{
      name: path.basename(pdf),
      mime: 'application/pdf',
      fileBase64: fileB64(pdf),
      slotOverride: 'fee_list',
    }],
  };
  const r = await req('POST', '/api/intake/batch', payload, 'H1');
  const fees = r.json?.record?.fee_list?.items || [];
  assert('H1 PDF intake returns record', r.ok && r.json?.record, r.raw.slice(0, 120));
  assert('H1 PDF intake has fee rows', fees.length > 0, `fees=${fees.length}`);
  assert('H1 uploaded case is readable', (await req('GET', '/api/case?id=uploaded', null, 'H1')).json?.fee_list, 'uploaded missing fee_list');
}

async function sweepDashboardBatchMaturity() {
  const cold = await req('GET', '/api/maturity', null, 'H2');
  assert('H2 maturity returns JSON', cold.ok && cold.json, `status=${cold.status}`);
  assert('H2 maturity under dashboard timeout budget', cold.durationMs <= 2500, `durationMs=${cold.durationMs}`);
  const batch = await req('POST', '/api/audit/batch', { priority: true, top_n: 2, skip: ['uploaded'], mode: 'live', concurrency: 2 }, 'H2');
  const jobId = batch.json?.job?.id;
  assert('H2 batch enqueue returns job', batch.ok && jobId, batch.raw.slice(0, 120));
  if (jobId) {
    let latest = null;
    for (let i = 0; i < 8; i += 1) {
      latest = await req('GET', `/api/audit/batch/${jobId}`, null, 'H2');
      if (['done', 'failed'].includes(latest.json?.status)) break;
      await new Promise(r => setTimeout(r, 250));
    }
    assert('H2 batch job reaches done', latest?.json?.status === 'done', `status=${latest?.json?.status}`);
  }
}

async function sweepWorkbenchErrors() {
  const badCase = await req('GET', '/api/case?id=__missing__', null, 'H3');
  assert('H3 missing /api/case does not silently return fallback main', !badCase.json?.case_meta || badCase.json?.case_meta?.case_id !== 'main', 'missing case resolved as a normal record');
  const unknown = await req('GET', '/api/__unknown_sweep__', null, 'H3');
  assert('H3 unknown API is JSON 404', unknown.status === 404 && unknown.json?.error, unknown.raw.slice(0, 80));
  const auditMissing = await req('POST', '/api/audit', { caseId: '__missing__' }, 'H3');
  assert('H3 audit missing case fails explicitly', !auditMissing.ok || auditMissing.json?.error, `status=${auditMissing.status}`);
}

async function sweepReviewShadow() {
  const audit = await req('POST', '/api/audit', { caseId: 'main' }, 'H4');
  const f = audit.json?.findings?.find(x => x.rule_id && x.status === '疑点' && !x.shadow);
  assert('H4 has active finding for review chain', !!f, 'no active finding');
  if (!f) return;
  const restore = backupRuntime();
  try {
    let last = null;
    for (let i = 0; i < 3; i += 1) {
      last = await req('POST', '/api/review', {
        case_id: 'main',
        finding_id: `${f.finding_id || f.rule_id}-sweep-${i}`,
        rule_id: f.rule_id,
        action: '驳回',
        reason: `sweep debug false positive ${i + 1}`,
        source: 'sweep',
      }, 'H4');
    }
    const status = last?.json?.rule_states?.[f.rule_id]?.status;
    assert('H4 three rejects move rule to shadow', status === 'shadow', `rule=${f.rule_id} status=${status}`);
    const gov = await req('GET', '/api/rule-governance', null, 'H4');
    const entry = (gov.json?.entries || []).find(e => e.rule_id === f.rule_id);
    assert('H4 governance exposes shadow rule', entry?.status === 'shadow', `status=${entry?.status}`);
  } finally {
    restore();
    await dbg('H4', 'runtime stores restored after shadow probe', { ruleId: f.rule_id });
  }
}

async function sweepEnginesDeploymentSecurity() {
  const modes = [
    ['/api/audit', { caseId: 'main' }, 'standard'],
    ['/api/audit?mode=exam', { caseId: 'main' }, 'exam'],
    ['/api/audit?rag=1', { caseId: 'main' }, 'rag'],
    ['/api/audit?mode=super', { caseId: 'main' }, 'super'],
  ];
  for (const [urlPath, body, label] of modes) {
    const r = await req('POST', urlPath, body, 'H5');
    assert(`H5 ${label} audit returns findings`, r.ok && Array.isArray(r.json?.findings), r.json?.error || r.raw.slice(0, 80));
  }
  const shim = fs.readFileSync(path.join(ROOT, 'prototype/app/public/pages-shim.js'), 'utf8');
  assert('H5 pages shim documents static API fallback', shim.includes('/api/priority/rank') || shim.includes('priority'), 'priority shim missing');
  const traversal = await req('GET', '/../../prototype/data/rule_states.json', null, 'H5');
  assert('H5 path traversal blocked', traversal.status === 403 || traversal.status === 404, `status=${traversal.status}`);
  const admin = await req('POST', '/api/governance/sync', {}, 'H5');
  assert('H5 governance sync is not open write without auth or explicit demo response', admin.status === 401 || admin.status === 403 || admin.json?.ok === false || admin.json?.error, `status=${admin.status}`);
}

async function main() {
  console.log('sweep-blind-spots @', BASE);
  await dbg('ALL', 'sweep started', { base: BASE, runId: RUN_ID });
  await sweepIntake();
  await sweepDashboardBatchMaturity();
  await sweepWorkbenchErrors();
  await sweepReviewShadow();
  await sweepEnginesDeploymentSecurity();
  await dbg('ALL', 'sweep complete', { failed, total: results.length, results });
  console.log(failed ? `\nFAIL (${failed})` : '\nPASS');
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await dbg('ALL', 'sweep exception', { error: e.message, stack: e.stack });
  process.exit(1);
});
