#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const BASE = process.env.BASE || 'http://localhost:3700';
const ROOT = path.resolve(__dirname, '..');
const RUN_ID = process.env.RUN_ID || 'sweep-2';

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
      location: 'scripts/sweep-blind-spots-2.cjs',
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

async function req(method, urlPath, body, hypothesisId, opts = {}) {
  const started = Date.now();
  let res;
  try {
    res = await fetch(BASE + urlPath, {
      method,
      headers: opts.headers || (body ? { 'Content-Type': 'application/json' } : {}),
      body: opts.rawBody != null ? opts.rawBody : (body ? JSON.stringify(body) : undefined),
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

function runBuild() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/build-github-pages.mjs'], {
      cwd: ROOT,
      env: { ...process.env, PAGES_EXPORT_PORT: '3877' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', c => { out += c; });
    child.stderr.on('data', c => { err += c; });
    child.on('close', code => resolve({ code, out, err }));
  });
}

async function sweepStaticBuild() {
  const started = Date.now();
  const build = await runBuild();
  await dbg('H6', 'github pages build finished', { code: build.code, durationMs: Date.now() - started, stderr: build.err.slice(0, 500) });
  assert('H6 GitHub Pages build succeeds', build.code === 0, build.err.slice(0, 300));
  const out = path.join(ROOT, 'gh-pages-build/api-static');
  const needed = [
    'priority-rank.json',
    'priority-config.json',
    'history.json',
    'violation-summary.json',
    'case-details/main.json',
    'checklist/national-2026-self-map-main.json',
  ];
  for (const rel of needed) {
    assert(`H6 static snapshot has ${rel}`, fs.existsSync(path.join(out, rel)), rel);
  }
  const priorityHtml = path.join(ROOT, 'gh-pages-build/priority.html');
  assert('H6 priority.html patched with pages-shim', fs.existsSync(priorityHtml) && fs.readFileSync(priorityHtml, 'utf8').includes('pages-shim.js'));
}

async function sweepEval() {
  const status = await req('GET', '/api/eval/status', null, 'H7');
  assert('H7 eval status JSON', status.ok && status.json, status.raw.slice(0, 80));
  const g2 = await req('GET', '/api/eval/g2', null, 'H7');
  assert('H7 eval g2 harness JSON', g2.ok && g2.json && (g2.json.gates || g2.json.pass_rate != null || g2.json.error == null), g2.raw.slice(0, 120));
}

async function sweepSecurityEdges() {
  const malformed = await req('POST', '/api/audit', null, 'H8', {
    headers: { 'Content-Type': 'application/json' },
    rawBody: '{"caseId":',
  });
  assert('H8 malformed JSON does not 500', malformed.status >= 400 && malformed.status < 500, `status=${malformed.status}`);
  assert('H8 malformed JSON response is JSON', !!malformed.json, malformed.raw.slice(0, 80));
  const traversal = await req('GET', '/deliverables/../../prototype/data/rule_states.json', null, 'H8');
  assert('H8 deliverables traversal blocked', traversal.status === 403 || traversal.status === 404, `status=${traversal.status}`);
  const unauthRule = await req('POST', '/api/rule-governance', { rule_id: 'T-201', action: 'shadow' }, 'H8');
  assert('H8 rule governance write requires auth', unauthRule.status === 401 || unauthRule.status === 403, `status=${unauthRule.status}`);
}

async function sweepConcurrency() {
  const audits = await Promise.all(Array.from({ length: 6 }, (_, i) => req('POST', '/api/audit', { caseId: i % 2 ? 'main' : 'clean' }, 'H9')));
  assert('H9 concurrent audits all return findings arrays', audits.every(r => r.ok && Array.isArray(r.json?.findings)), audits.map(r => r.status).join(','));
  assert('H9 concurrent audits p95 under 2s', Math.max(...audits.map(r => r.durationMs)) < 2000, `max=${Math.max(...audits.map(r => r.durationMs))}`);

  const pdf = path.join(ROOT, 'prototype/data/intake_samples/鹰眼演示-住院费用清单-王建国.pdf');
  const files = [{
    name: path.basename(pdf),
    mime: 'application/pdf',
    fileBase64: fileB64(pdf),
    slotOverride: 'fee_list',
  }];
  const intakes = await Promise.all([
    req('POST', '/api/intake/batch', { merge: false, files }, 'H9'),
    req('POST', '/api/intake/batch', { merge: false, files }, 'H9'),
  ]);
  assert('H9 concurrent intake both succeed', intakes.every(r => r.ok && r.json?.record), intakes.map(r => r.status).join(','));
  const uploaded = await req('GET', '/api/case?id=uploaded', null, 'H9');
  assert('H9 uploaded remains readable after concurrent intake', uploaded.ok && (uploaded.json?.fee_list?.items || []).length > 0);
}

async function main() {
  console.log('sweep-blind-spots-2 @', BASE);
  await dbg('ALL', 'sweep2 started', { base: BASE, runId: RUN_ID });
  await sweepStaticBuild();
  await sweepEval();
  await sweepSecurityEdges();
  await sweepConcurrency();
  await dbg('ALL', 'sweep2 complete', { failed, total: results.length, results });
  console.log(failed ? `\nFAIL (${failed})` : '\nPASS');
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await dbg('ALL', 'sweep2 exception', { error: e.message, stack: e.stack });
  process.exit(1);
});
