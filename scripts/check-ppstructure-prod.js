#!/usr/bin/env node
'use strict';

/**
 * PP-Structure / L1 sidecar 生产就绪检查（iter-25）
 * 用法：node scripts/check-ppstructure-prod.js
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PP = path.resolve(__dirname, '../prototype/ppstructure');
const url = process.env.PPSTRUCTURE_URL || 'http://127.0.0.1:8787';

function check(name, ok, detail) {
  console.log(`${ok ? '✅' : '⚠️ '} ${name}: ${detail}`);
  return ok;
}

async function main() {
  let pass = 0;
  let warn = 0;

  try {
    const py = execSync('python3 --version', { encoding: 'utf8' }).trim();
    const m = py.match(/(\d+)\.(\d+)/);
    const major = m ? Number(m[1]) : 99;
    const minor = m ? Number(m[2]) : 0;
    const okPy = major < 3 || (major === 3 && minor <= 12);
    if (check('Python 版本', okPy, `${py}${okPy ? '' : '（Paddle 需 ≤3.12，当前用 lite 回退）'}`)) pass++; else warn++;
  } catch {
    check('Python 版本', false, '未安装 python3'); warn++;
  }

  if (fs.existsSync(path.join(PP, 'run.sh'))) { pass++; console.log('✅ run.sh: 存在'); }
  else { warn++; console.log('⚠️  run.sh: 缺失'); }

  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
    const h = await res.json();
    console.log(`✅ sidecar health: reachable engine=${h.recommended_engine || h.engine || '?'}`);
    pass++;
    if (h.recommended_engine === 'ppstructure') console.log('   ★ 完整 PP-StructureV3 已就绪');
    else console.log('   ℹ️  当前 lite/tesseract 模式 — 生产扫描件建议 install-paddle.sh + Python≤3.12');
  } catch (e) {
    check('sidecar health', false, `未启动 (${url}) — bash prototype/ppstructure/run.sh`); warn++;
  }

  try {
    execSync('tesseract --version', { stdio: 'pipe' });
    console.log('✅ tesseract: 已安装');
    pass++;
  } catch {
    check('tesseract', false, '未安装（扫描图 OCR 需 brew install tesseract tesseract-lang）'); warn++;
  }

  console.log(`\n${warn ? '⚠️' : '✅'} 生产就绪检查完成 — ${pass} pass / ${warn} warn`);
  if (warn) process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
