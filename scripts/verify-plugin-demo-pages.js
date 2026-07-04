#!/usr/bin/env node
'use strict';
/**
 * 插件演示页静态门禁 — 防入口/状态/动作退化。
 * 用法: node scripts/verify-plugin-demo-pages.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'prototype/app/public');
const files = {
  plugins: path.join(PUB, 'plugins.html'),
  overlay: path.join(PUB, 'plugin-overlay.js'),
  chip: path.join(PUB, 'plugin-chip.js'),
  triage: path.join(PUB, 'regulator-triage.html'),
  threshold: path.join(PUB, 'regulator-threshold.html'),
  fieldkit: path.join(PUB, 'regulator-fieldkit.html'),
  precheck: path.join(PUB, 'plugin/yingyan-precheck.js'),
  disposition: path.join(PUB, 'plugin/yingyan-disposition.js'),
  extContent: path.join(ROOT, 'plugin/browser-extension/content.js'),
  extOptions: path.join(ROOT, 'plugin/browser-extension/options.js'),
  sentinel: path.join(ROOT, 'plugin/desktop-sentinel/clipboard-sentinel.js'),
};

let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) { console.error('  ✗', msg); failed += 1; }
function read(k) { return fs.readFileSync(files[k], 'utf8'); }
function mustExist(k) {
  if (!fs.existsSync(files[k])) fail(`${k} missing: ${files[k]}`);
  else ok(`${k} exists`);
}
function mustContain(k, patterns, label) {
  const text = read(k);
  const missing = patterns.filter((p) => (typeof p === 'string' ? !text.includes(p) : !p.test(text)));
  if (missing.length) fail(`${label}: missing ${missing.map(String).join(', ')}`);
  else ok(`${label}`);
}

console.log('verify-plugin-demo-pages');
Object.keys(files).forEach(mustExist);

mustContain('overlay', ['DEFAULT_STATUS', 'statusHtml', 'status: status'], 'plugin-overlay status rail');
mustContain('chip', ['/plugins.html', '院端连播'], 'plugin chip links toolbox and tour');
mustContain('plugins', ['/mockhis.html?tour=1', '/regulator-ocr-import.html', '/plugin-dashboard.html?tour=1'], 'plugins page remains single toolbox entry');

mustContain('triage', ['派给飞检组', 'assignTask', 'task=assigned', 'H 列已写回'], 'triage has dispatch workflow');
mustContain('threshold', ['生成审批说明', '灰度下发 10%', '回滚到 18 岁', 'stageRollout'], 'threshold has ops workflow');
mustContain('fieldkit', ['现场 checklist', 'confirmChecklist', '带着行装包进现场'], 'fieldkit has onsite checklist');

mustContain('precheck', ['两库依据可展开', '等待医生处置', '已完成患者沟通'], 'doctor precheck status and realistic override reasons');
mustContain('disposition', ['处置入同一台账', '等待经办处置', '已完成患者沟通'], 'coder/settle disposition status');
mustContain('extContent', ['本地引擎', '内网引擎', 'isLocal'], 'browser extension engine status');
mustContain('extOptions', ['updateGuard', '可信院内引擎', '本地回环地址'], 'browser extension deployment guard');
mustContain('sentinel', ['--demo-sample', 'DEMO_TSV'], 'desktop sentinel demo sample');

console.log(failed ? `\n❌ verify-plugin-demo-pages: ${failed} failure(s)` : '\n✅ verify-plugin-demo-pages OK');
process.exit(failed ? 1 : 0);
