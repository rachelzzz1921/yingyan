#!/usr/bin/env node
'use strict';
/**
 * 三 Pitch 入口 · 导航契约验收
 * 用法: node scripts/verify-three-entry-pathways.js
 * 需本地服务: cd prototype/app && node server.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:3700';
const PUBLIC = path.join(__dirname, '../prototype/app/public');
let failed = 0;

function get(urlPath, timeoutMs = 15000) {
  if (urlPath.includes('/api/yhf')) timeoutMs = 120000;
  return new Promise((resolve, reject) => {
    const req = http.get(BASE + urlPath, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: d, headers: res.headers }));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(new Error('timeout ' + urlPath)); });
  });
}

function readPublic(rel) {
  return fs.readFileSync(path.join(PUBLIC, rel), 'utf8');
}

async function assert(name, cond, detail) {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed += 1;
  console.log(`  ✗ ${name}${detail ? ': ' + detail : ''}`);
}

function mustInclude(html, patterns, label) {
  for (const p of patterns) {
    const ok = typeof p === 'string' ? html.includes(p) : p.test(html);
    if (!ok) assert(label + ' · ' + String(p), false);
    else assert(label + ' · ' + String(p), true);
  }
}

async function main() {
  console.log('verify-three-entry-pathways @', BASE);

  // —— 入口① 黄金闭环 ——
  console.log('\n[① 黄金闭环]');
  const golden = await get('/golden.html');
  await assert('GET /golden.html 200', golden.status === 200);
  mustInclude(golden.body, [
    'href="/home.html"',
    'id="btnAgain"',
    'id="btnSwitch"',
    'id="goWorkbench"',
    'encodeURIComponent(CASE_ID)',
  ], 'golden 终点出口');

  // —— 入口② 全面平台 ——
  console.log('\n[② 全面平台]');
  const home = await get('/home.html');
  await assert('GET /home.html 200', home.status === 200);
  mustInclude(home.body, [
    'href="/golden.html"',
    'href="/index.html?role=audit"',
    'href="/plugins.html"',
    'href="/priority.html"',
  ], 'home 三卡分流');

  const indexHtml = readPublic('index.html');
  mustInclude(indexHtml, ['id="lnkBackQueue"', 'href="/priority.html"'], '工作台返回队列 DOM');
  mustInclude(readPublic('app.js'), ["qFrom !== 'priority'", 'lnkBackQueue'], '工作台 from=priority 逻辑');

  const priorityJs = readPublic('priority.js');
  mustInclude(priorityJs, ['from=priority', 'yingyan_role'], '队列角色与回链参数');

  const rank = await get('/api/priority/rank');
  await assert('priority rank API', rank.status === 200);

  // —— 入口③ 插件线 ——
  console.log('\n[③ 插件 & 小工具箱]');
  const plugins = await get('/plugins.html');
  await assert('GET /plugins.html 200', plugins.status === 200);
  mustInclude(plugins.body, [
    'href="/mockhis.html',
    'href="/coder-station.html',
    'href="/settle-station.html',
    'href="/regulator-triage.html',
    'href="/priority.html"',
  ], 'plugins 双动线');

  const reg301 = await get('/regulator-plugins.html');
  await assert('regulator-plugins 301 → plugins#regulator', reg301.status === 301 && (reg301.headers.location || '').includes('plugins.html'));

  const coverage = readPublic('coverage-map.html');
  mustInclude(coverage, ['href="/home.html"'], '覆盖地图回首页');

  // —— 黄金闭环 API 链 ——
  console.log('\n[① API 七步链]');
  const audit = await new Promise((resolve, reject) => {
    const u = new URL(BASE + '/api/audit?mode=exam');
    const req = http.request({
      hostname: u.hostname, port: u.port || 80, path: u.pathname + u.search, method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, (res) => {
      let d = ''; res.on('data', c => { d += c; });
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    });
    req.on('error', reject);
    req.write(JSON.stringify({ caseId: 'main' }));
    req.end();
  });
  await assert('POST /api/audit?mode=exam main', Array.isArray(audit?.findings));

  const diff = await get('/api/exam/diff?case_id=main');
  await assert('GET /api/exam/diff', diff.status === 200 && diff.body.includes('"ok"'));

  const yhf = await get('/api/yhf?layers=engine,rule,prompt,shadow,rag');
  await assert('GET /api/yhf layers', yhf.status === 200 && yhf.body.includes('G0_clean_zero_fp'));

  console.log(failed ? `\nFAIL (${failed})` : '\nPASS · 三入口导航契约 OK');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
