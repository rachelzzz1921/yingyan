#!/usr/bin/env node
/**
 * 将 L1 sidecar 云端 URL 写入 Vercel 生产环境（需先 Render Blueprint 部署完成）。
 * 用法：node scripts/setup-l1-cloud.mjs https://yingyan-l1.onrender.com
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const url = process.argv[2]?.replace(/\/$/, '');
if (!url || !/^https?:\/\//.test(url)) {
  console.error('用法: node scripts/setup-l1-cloud.mjs https://<your-l1-host>');
  console.error('先部署: Render → New Blueprint → rachelzzz1921/yingyan → 复制 yingyan-l1 的 URL');
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function probe() {
  try {
    const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(15000) });
    const j = await r.json();
    if (!r.ok) throw new Error(r.statusText);
    return j;
  } catch (e) {
    console.warn('⚠ L1 health 探测失败（Render 冷启动需 30–60s）:', e.message);
    return null;
  }
}

console.log(`\n  鹰眼 · L1 云端接入\n  URL: ${url}\n`);
const health = await probe();
if (health) {
  console.log(`  ✓ health: engine=${health.recommended_engine} paddle=${health.paddle_available} tesseract=${health.tesseract_available}\n`);
}

function vercelEnv() {
  const r = spawnSync('npx', ['vercel', 'env', 'add', 'PPSTRUCTURE_URL', 'production', '--force'], {
    cwd: root,
    input: url,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  if (r.status !== 0) {
    console.error('\n若写入失败，请手动: Vercel → Settings → Environment Variables → PPSTRUCTURE_URL');
    process.exit(r.status || 1);
  }
}

vercelEnv();
console.log('\n▶ 重新部署主站…');
const dep = spawnSync('npx', ['vercel', '--prod', '--yes'], { cwd: root, stdio: 'inherit' });
process.exit(dep.status || 0);
