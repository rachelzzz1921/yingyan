#!/usr/bin/env node
/**
 * Vercel 构建前准备：规则编译、部署种子数据、静态资源同步、完整性校验。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'prototype/app');
const DATA = path.join(ROOT, 'prototype/data');
const PUBLIC = path.join(APP, 'public');
const DEPLOY_SEEDS = path.join(DATA, 'deploy');

function copyFile(src, dest) {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return true;
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return 0;
  fs.mkdirSync(dest, { recursive: true });
  let n = 0;
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) n += copyDir(s, d);
    else { fs.copyFileSync(s, d); n++; }
  }
  return n;
}

function seedRuntimeData() {
  if (!fs.existsSync(DEPLOY_SEEDS)) return 0;
  let n = 0;
  for (const name of fs.readdirSync(DEPLOY_SEEDS)) {
    if (!name.endsWith('.json')) continue;
    copyFile(path.join(DEPLOY_SEEDS, name), path.join(DATA, name));
    n++;
  }
  return n;
}

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
}

console.log('\n  鹰眼 · Vercel 构建准备');

run('npm', ['run', 'build:rules'], APP);

const seeded = seedRuntimeData();
console.log(`  ▸ 部署种子数据 ${seeded} 个 JSON`);

const brandOut = path.join(PUBLIC, 'brand');
const gptCopied = copyDir(path.join(ROOT, 'assets/brand/gpt-v2'), path.join(brandOut, 'gpt-v2'));
if (gptCopied) console.log(`  ▸ 品牌参考图 ${gptCopied} 个 → public/brand/gpt-v2`);

run('node', [path.join(ROOT, 'scripts/verify-vercel-bundle.mjs')], ROOT);
console.log('  ▸ 打包校验通过\n');
