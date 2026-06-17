#!/usr/bin/env node
/**
 * 校验 Vercel Serverless 运行时所需文件是否齐全（构建阶段 fail-fast）。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const REQUIRED = [
  'api/index.js',
  'prototype/app/server.js',
  'prototype/app/package.json',
  'prototype/data/rules/rules.json',
  'prototype/data/rules/rules.yaml',
  'prototype/data/kb/kb1_policies.json',
  'prototype/data/kb/kb2_clinical.json',
  'prototype/data/kb/kb1_problem_lists.json',
  'prototype/data/case_registry.json',
  'prototype/data/tasks_board.json',
  'prototype/data/case_NSCLC/medical_record.json',
  'prototype/app/public/index.html',
  'prototype/app/public/dashboard.html',
  'prototype/app/public/app.js',
  'prototype/app/public/dashboard.js',
  'yhf/index.js',
  'yhf/run.sh',
  'docs/ROADMAP.md',
  'prototype/app/bundle/docs/ROADMAP.md',
  'prototype/app/bundle/prototype/docs/TASKS.md',
  'eval/README.md',
  'eval/OPEN_ISSUES.md',
];

const OPTIONAL_BUT_EXPECTED = [
  'prototype/data/rule_states.json',
  'prototype/data/review_feedback.json',
  'prototype/data/rule_patch_overlay.json',
  'prototype/data/rule_precipitation_queue.json',
];

function listCaseRecords() {
  const dataDir = path.join(ROOT, 'prototype/data');
  return fs.readdirSync(dataDir)
    .filter((n) => n.startsWith('case_') && fs.statSync(path.join(dataDir, n)).isDirectory())
    .map((n) => `prototype/data/${n}/medical_record.json`);
}

const missing = [];
for (const rel of [...REQUIRED, ...listCaseRecords()]) {
  if (!fs.existsSync(path.join(ROOT, rel))) missing.push(rel);
}

if (missing.length) {
  console.error('Vercel 打包校验失败，缺少文件：');
  for (const m of missing) console.error('  -', m);
  process.exit(1);
}

const optionalMissing = OPTIONAL_BUT_EXPECTED.filter((rel) => !fs.existsSync(path.join(ROOT, rel)));
if (optionalMissing.length) {
  console.warn('  ⚠ 可选运行态 JSON 未生成（将使用引擎默认值）：', optionalMissing.join(', '));
}

const bundleChecks = [
  'prototype/app/bundle/docs/ROADMAP.md',
  'prototype/app/bundle/prototype/docs/TASKS.md',
  'prototype/app/bundle/yhf/README.md',
];
const bundleMissing = bundleChecks.filter((rel) => !fs.existsSync(path.join(ROOT, rel)));
if (bundleMissing.length) {
  console.error('Vercel 看板文档 bundle 不完整：');
  for (const m of bundleMissing) console.error('  -', m);
  process.exit(1);
}

const cases = listCaseRecords().length;
console.log(`  ✓ 案卷 ${cases} 份 · 规则/KB/前端/YHF 均已就绪`);
