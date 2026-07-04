#!/usr/bin/env node
'use strict';
/**
 * 稽核四条通路静态 + API 烟测
 * 用法: node scripts/verify-audit-pathways.js [--live]
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const APP_JS = path.join(ROOT, 'prototype/app/public/app.js');
const CASE_ID = 'anes';

const PATHWAYS = [
  { id: 'fast', query: '', body: {}, minFindings: 1 },
  { id: 'rag', query: '?rag=1', body: { rag: true }, minFindings: 1 },
  { id: 'deep', query: '?mode=llm', body: {}, minFindings: 0, timeoutMs: 180000 },
  { id: 'super', query: '?mode=super', body: { rag: true }, minFindings: 1, timeoutMs: 120000 },
];

let failed = 0;
function fail(msg) { console.error('  ✗', msg); failed += 1; }
function ok(msg) { console.log('  ✓', msg); }

console.log('verify-audit-pathways');

const src = fs.readFileSync(APP_JS, 'utf8');
const defIdx = src.indexOf('function renderModeStrip');
const reportIdx = src.indexOf('function renderReport');
if (defIdx < 0) fail('app.js missing function renderModeStrip');
else if (reportIdx < 0) fail('app.js missing function renderReport');
else if (defIdx > reportIdx) fail('renderModeStrip must be defined before renderReport in app.js');
else ok('renderModeStrip defined before renderReport');

if (!/window\.renderModeStrip\s*=/.test(src)) fail('app.js must export window.renderModeStrip');
else ok('window.renderModeStrip exported');

if (!/j\.error\s*\|\|\s*!r\.ok/.test(fs.readFileSync(path.join(ROOT, 'prototype/app/public/plugin/yingyan-precheck.js'), 'utf8'))) {
  fail('yingyan-precheck.js missing error guard (cross-check)');
} else ok('precheck plugin error guard present');

function postAudit(query, body, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ caseId: CASE_ID, ...body });
    const req = http.request({
      hostname: '127.0.0.1', port: 3700, path: '/api/audit' + query, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: timeoutMs,
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(buf) }); }
        catch (e) { reject(new Error('invalid JSON: ' + buf.slice(0, 120))); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(data);
    req.end();
  });
}

async function liveSmoke() {
  for (const p of PATHWAYS) {
    try {
      const { status, json } = await postAudit(p.query, p.body, p.timeoutMs || 60000);
      if (status >= 400 || json.error) {
        if (p.id === 'deep' && json.report_meta) {
          ok(`${p.id}: fallback report (${json.report_meta.engine_mode?.slice(0, 40) || 'ok'})`);
          continue;
        }
        fail(`${p.id}: HTTP ${status} ${json.error || ''}`);
        continue;
      }
      if (!json.report_meta) { fail(`${p.id}: missing report_meta`); continue; }
      const n = (json.findings || []).length;
      if (n < (p.minFindings || 0)) fail(`${p.id}: findings=${n} expected >= ${p.minFindings}`);
      else ok(`${p.id}: findings=${n} engine=${(json.report_meta.engine_mode || '').slice(0, 36)}…`);
    } catch (e) {
      fail(`${p.id}: ${e.message}`);
    }
  }
}

(async () => {
  if (process.argv.includes('--live')) {
    try {
      await postAudit('', {}, 5000);
      await liveSmoke();
    } catch (e) {
      fail('live smoke skipped: server not reachable (' + e.message + ') — static checks only');
    }
  } else {
    ok('static checks only (pass --live for API smoke against localhost:3700)');
  }
  console.log(failed ? `\n❌ verify-audit-pathways: ${failed} failure(s)` : '\n✅ verify-audit-pathways OK');
  process.exit(failed ? 1 : 0);
})();
