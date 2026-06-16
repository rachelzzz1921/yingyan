#!/usr/bin/env node
'use strict';

/**
 * 治理状态 push/pull Supabase
 * 用法：node scripts/sync-governance-to-supabase.js [push|pull|both]
 */
const fs = require('fs');
const path = require('path');

(function loadEnv() {
  const envPath = path.resolve(__dirname, '../prototype/app/.env');
  try {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const s = line.trim();
      if (!s || s.startsWith('#') || !s.includes('=')) continue;
      const i = s.indexOf('=');
      const k = s.slice(0, i).trim();
      const v = s.slice(i + 1).trim();
      if (k && !process.env[k]) process.env[k] = v;
    }
  } catch {}
})();

const DATA = path.resolve(__dirname, '../prototype/data');
const { syncGovernance, remoteStatus } = require('../prototype/app/engine/governance-sync');

async function main() {
  const direction = process.argv[2] || 'push';
  const st = await remoteStatus();
  console.log('remote:', st);
  if (!st.configured) {
    console.error('❌ 未配置 Supabase');
    process.exit(1);
  }
  const result = await syncGovernance(DATA, direction);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
  console.log(`\n✅ governance sync (${direction}) OK`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
