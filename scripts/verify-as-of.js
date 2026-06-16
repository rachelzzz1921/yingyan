#!/usr/bin/env node
'use strict';

/**
 * 验收 KB as_of 时效过滤（入院日 → 有效政策子集）
 * 用法：node scripts/verify-as-of.js
 */
const path = require('path');
const { loadJsonKB } = require('../prototype/app/kb/retrieval');
const { filterPolicyMaps } = require('../prototype/app/kb/as-of');

const DATA = path.resolve(__dirname, '../prototype/data');
const JIANGSU = 'KB1-江苏-护理价格2025';

function check(label, asOfStr, expectJiangsu) {
  const asOf = new Date(asOfStr + 'T00:00:00');
  const maps = loadJsonKB(DATA);
  const filtered = filterPolicyMaps(maps, asOf);
  const has = !!filtered.policyTexts[JIANGSU];
  const ok = has === expectJiangsu;
  console.log(`${ok ? '✅' : '❌'} ${label} (${asOfStr}): 江苏护理=${has ? '含' : '不含'} (期望${expectJiangsu ? '含' : '不含'}) refs=${Object.keys(filtered.policyTexts).length}`);
  return ok;
}

function main() {
  const r1 = check('2024 入院', '2024-06-01', false);
  const r2 = check('2025 入院', '2025-06-01', true);
  const r3 = check('2026 入院', '2026-03-01', true);
  if (!r1 || !r2 || !r3) process.exit(1);
  console.log('\n✅ as_of 过滤验收 PASS');
}

main();
