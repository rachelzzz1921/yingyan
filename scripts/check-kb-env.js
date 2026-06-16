#!/usr/bin/env node
'use strict';

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
  } catch {
    console.error('❌ 找不到 prototype/app/.env');
    process.exit(1);
  }
})();

function keyKind(token) {
  if (!token) return null;
  if (token === 'local-dev-postgres') return 'local';
  if (token.startsWith('sb_publishable_')) return 'publishable';
  if (token.startsWith('sb_secret_')) return 'secret';
  return jwtRole(token);
}

function jwtRole(token) {
  if (!token || token === 'local-dev-postgres') return token === 'local-dev-postgres' ? 'local' : null;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return payload.role || null;
  } catch {
    return 'invalid';
  }
}

const url = process.env.SUPABASE_URL || '';
const anon = process.env.SUPABASE_ANON_KEY || '';
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const stepfun = process.env.STEPFUN_API_KEY || '';

console.log('Supabase URL:', url || '(未设置)');
console.log('ANON_KEY:', keyKind(anon));
console.log('SERVICE_ROLE_KEY:', keyKind(service));

const ok = url && (keyKind(service) === 'secret' || keyKind(service) === 'service_role');
if (ok) {
  console.log('\n✅ 可以灌库：node scripts/ingest-kb-to-supabase.js --stepfun');
} else if (keyKind(service) === 'publishable' || keyKind(service) === 'anon') {
  console.log('\n⚠️  SERVICE_ROLE_KEY 实际是 publishable/anon，无法写入云端 KB');
  console.log('   → Dashboard → Settings → API → 复制 Secret key（sb_secret_...）');
} else if (service === 'local-dev-postgres') {
  console.log('\nℹ️  当前为本地 Docker KB，云端灌库需换成 supabase.co 的 URL 和 secret key');
} else {
  console.log('\n⚠️  请检查 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY');
}

console.log('StepFun:', stepfun ? '已配置' : '未配置');
const emb = process.env.RAG_EMBEDDING_PROVIDER || 'dashscope';
const dash = process.env.DASHSCOPE_API_KEY;
const zhipu = process.env.ZHIPU_API_KEY;
const sf = process.env.SILICONFLOW_API_KEY;
const embOk = (emb === 'dashscope' && dash) || (emb === 'zhipu' && zhipu) || (emb === 'siliconflow' && sf);
console.log('Embedding:', embOk ? `${emb} 已配置` : `${emb} 未配置（推荐 siliconflow 或 dashscope）`);
