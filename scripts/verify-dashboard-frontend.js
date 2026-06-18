#!/usr/bin/env node
'use strict';
/**
 * 看板前端静态门禁 — 防止跨脚本裸调用 / 语法错误导致「xxx is not defined」
 * 用法: node scripts/verify-dashboard-frontend.js
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'prototype/app/public');
const MANIFEST = path.join(PUBLIC, 'dash-bridges.json');

let failed = 0;
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}
function ok(msg) {
  console.log('  ✓', msg);
}

console.log('verify-dashboard-frontend');

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const pageCfg = manifest.pages['dashboard.html'];
if (!pageCfg) {
  fail('dash-bridges.json missing dashboard.html');
  process.exit(1);
}

const htmlPath = path.join(PUBLIC, 'dashboard.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const scriptOrder = [...html.matchAll(/<script src="\/([^"]+)"><\/script>/g)].map((m) => m[1]);

const dashIdx = scriptOrder.indexOf('dashboard.js');
if (dashIdx === -1) fail('dashboard.html must load dashboard.js');

for (const script of pageCfg.scripts) {
  const idx = scriptOrder.indexOf(script);
  if (idx === -1) {
    fail(`dashboard.html missing script ${script}`);
    continue;
  }
  if (script !== 'dashboard.js' && idx >= dashIdx) {
    fail(`${script} must appear before dashboard.js in dashboard.html`);
  } else if (script !== 'dashboard.js') {
    ok(`load order: ${script} → dashboard.js`);
  }
}

for (const script of pageCfg.scripts) {
  const file = path.join(PUBLIC, script);
  if (!fs.existsSync(file)) {
    fail(`missing ${script}`);
    continue;
  }
  try {
    execSync(`node --check "${file}"`, { stdio: 'pipe' });
    ok(`syntax OK: ${script}`);
  } catch (e) {
    fail(`syntax error in ${script}: ${e.stderr?.toString().trim() || e.message}`);
  }
}

const dashTasksExports = new Set();
for (const [file, bridge] of Object.entries(pageCfg.bridges || {})) {
  const src = fs.readFileSync(path.join(PUBLIC, file), 'utf8');
  const blockRe = new RegExp(`(?:window|global)\\.${bridge.global}\\s*=\\s*\\{([\\s\\S]*?)\\};`, 'm');
  const block = blockRe.exec(src);
  if (!block) {
    fail(`${file} must assign window.${bridge.global} (or global.${bridge.global}) = { ... }`);
    continue;
  }
  const body = block[1];
  for (const exp of bridge.exports) {
    if (!new RegExp(`\\b${exp}\\b`).test(body)) {
      fail(`${file} window.${bridge.global} missing export: ${exp}`);
    } else {
      ok(`${file} exports ${bridge.global}.${exp}`);
      if (bridge.global === 'DashTasks') dashTasksExports.add(exp);
    }
  }
}

const dashSrc = fs.readFileSync(path.join(PUBLIC, 'dashboard.js'), 'utf8');
if (!dashSrc.includes('function dashCall(')) fail('dashboard.js must define dashCall()');

for (const exp of dashTasksExports) {
  const re = new RegExp(`\\b${exp}\\s*\\(`, 'g');
  let m;
  while ((m = re.exec(dashSrc)) !== null) {
    const lineStart = dashSrc.lastIndexOf('\n', m.index) + 1;
    const lineEnd = dashSrc.indexOf('\n', m.index);
    const line = dashSrc.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
    if (!line.includes('dashCall(') && !line.includes(`function ${exp}(`)) {
      fail(`dashboard.js must use dashCall('${exp}') — found bare call: ${line.trim().slice(0, 80)}`);
    }
  }
}

if (failed) {
  console.error(`\nFAIL (${failed} checks)`);
  process.exit(1);
}
console.log('\nPASS');
process.exit(0);
