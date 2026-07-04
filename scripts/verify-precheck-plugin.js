#!/usr/bin/env node
'use strict';
/**
 * 事前提醒插件静态门禁 — 防 TDZ/双份漂移/误报合规放行
 * 用法: node scripts/verify-precheck-plugin.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const PRECHECK_SRC = path.join(ROOT, 'prototype/app/public/plugin/yingyan-precheck.js');
const PRECHECK_EXT = path.join(ROOT, 'plugin/browser-extension/yingyan-precheck.js');
const CONTENT_EXT = path.join(ROOT, 'plugin/browser-extension/content.js');
const DISPOSITION = path.join(ROOT, 'prototype/app/public/plugin/yingyan-disposition.js');
const SERVER = path.join(ROOT, 'prototype/app/server.js');
const RUNNER = path.join(ROOT, 'prototype/app/engine/precheck-runner.js');

let failed = 0;
function fail(msg) { console.error('  ✗', msg); failed += 1; }
function ok(msg) { console.log('  ✓', msg); }

function sha(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function mustContain(file, patterns, label) {
  const text = fs.readFileSync(file, 'utf8');
  for (const p of patterns) {
    if (typeof p === 'string' ? !text.includes(p) : !p.test(text)) {
      fail(`${label}: missing ${String(p)}`);
      return;
    }
  }
  ok(`${label}: required patterns present`);
}

console.log('verify-precheck-plugin');

// 1) 内嵌演示与浏览器扩展 yingyan-precheck.js 必须字节一致
if (!fs.existsSync(PRECHECK_EXT)) {
  fail('browser-extension/yingyan-precheck.js missing');
} else if (sha(PRECHECK_SRC) !== sha(PRECHECK_EXT)) {
  fail('yingyan-precheck.js drift: sync prototype → plugin/browser-extension/');
} else {
  ok('yingyan-precheck.js in sync (prototype ↔ extension)');
}

// 2) 客户端：接口 error / 网络失败不得伪装合规放行
mustContain(PRECHECK_SRC, [
  'j.error || !r.ok',
  'result.error',
  '事前预检未完成',
], 'yingyan-precheck.js error UX');

mustContain(CONTENT_EXT, ['result.error'], 'content.js blocks submit on error');

mustContain(DISPOSITION, ['result.error', '校验未完成'], 'yingyan-disposition.js error UX');

// 3) 服务端：编排必须走 precheck-runner，禁止在 handler 内联 precheckToneForRule
const server = fs.readFileSync(SERVER, 'utf8');
if (!/runPrecheck\(patient, items/.test(server)) {
  fail('server.js /api/precheck must call runPrecheck from precheck-runner');
} else ok('server.js delegates to precheck-runner');
if (/precheckToneForRule/.test(server.split('/api/precheck')[1]?.split('if (p === ')[0] || '')) {
  fail('server.js /api/precheck must not call precheckToneForRule inline');
} else ok('server.js no inline precheckToneForRule');

// 4) runner：require 必须在使用前（排除 destructuring 行本身）
const runner = fs.readFileSync(RUNNER, 'utf8');
const reqIdx = runner.indexOf("require('./precheck-native')");
const useIdx = runner.indexOf('interaction: precheckToneForRule');
if (useIdx >= 0 && (reqIdx < 0 || reqIdx > useIdx)) {
  fail('precheck-runner.js: require precheck-native before using precheckToneForRule');
} else ok('precheck-runner.js require order OK');

// 5) G7 场景烟测（离线，不依赖 HTTP 服务）
const { runPrecheckSmoke } = require(path.join(ROOT, 'yhf/harness/l7-precheck-smoke'));
const smoke = runPrecheckSmoke();
if (!smoke.pass) {
  for (const c of smoke.cases.filter((x) => !x.pass)) {
    fail(`G7 scenario ${c.id}: ${(c.failures || []).join('; ')}`);
  }
} else {
  ok(`G7 precheck smoke ${smoke.cases.length}/${smoke.cases.length} scenarios`);
}

console.log(failed ? `\n❌ verify-precheck-plugin: ${failed} failure(s)` : '\n✅ verify-precheck-plugin OK');
process.exit(failed ? 1 : 0);
