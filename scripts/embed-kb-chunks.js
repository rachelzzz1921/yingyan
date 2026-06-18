#!/usr/bin/env node
'use strict';

/**
 * 为 kb_chunks 批量写入 pgvector embedding（DashScope / 智谱）
 * 用法：node scripts/embed-kb-chunks.js
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

const { ragConfig, canUseSupabase } = require('../prototype/app/kb/config');
const { canEmbed, embedTexts } = require('../prototype/app/kb/embedding-provider');
const supabase = require('../prototype/app/kb/supabase-client');

async function fetchChunksNeedingEmbed(offset = 0) {
  const cfg = ragConfig();
  const base = cfg.supabaseUrl.replace(/\/$/, '');
  const apiBase = base.includes('supabase.co') ? `${base}/rest/v1` : base;
  const pageSize = 1000;
  const url = `${apiBase}/kb_chunks?select=ref_id,chunk_index,content,corpus_version,embedding&corpus_version=eq.${encodeURIComponent(cfg.corpusVersion)}&embedding=is.null&limit=${pageSize}&offset=${offset}`;
  const key = cfg.supabaseServiceKey;
  const headers = key === 'local-dev-postgres'
    ? {}
    : { apikey: key, Authorization: `Bearer ${key}` };
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`fetch chunks ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

async function fetchAllChunksNeedingEmbed() {
  const all = [];
  let offset = 0;
  for (;;) {
    const page = await fetchChunksNeedingEmbed(offset);
    all.push(...page);
    if (page.length < 1000) break;
    offset += 1000;
  }
  return all;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (!canUseSupabase()) {
    console.error('❌ 缺少 Supabase 配置');
    process.exit(1);
  }
  if (!canEmbed() && !dryRun) {
    console.error('❌ 缺少 DASHSCOPE_API_KEY（或 ZHIPU + RAG_EMBEDDING_PROVIDER=zhipu）');
    process.exit(1);
  }

  let chunks = await fetchAllChunksNeedingEmbed();
  const embedded = await supabase.countEmbeddedChunks().catch(() => null);
  if (dryRun) {
    console.log(`ℹ️  dry-run：待向量化 ${chunks.length} 条，已 embedded=${embedded ?? '?'}`);
    console.log(chunks.length ? '   去掉 --dry-run 并配置 embedding key 后执行写入' : '✅ 无待处理 chunk');
    return;
  }
  if (!chunks.length) {
    console.log('✅ 所有 chunk 已有 embedding，无需处理');
    return;
  }

  const BATCH = 10;
  let done = 0;
  for (;;) {
    if (!chunks.length) {
      chunks = await fetchAllChunksNeedingEmbed();
      if (!chunks.length) break;
    }
    if (!done) console.log(`🔢 待向量化 ${chunks.length} 条 chunk…`);
    const batch = chunks.slice(0, BATCH);
    const vectors = await embedTexts(batch.map(c => c.content));
    for (let j = 0; j < batch.length; j++) {
      const c = batch[j];
      const vec = vectors[j];
      if (!vec?.length) continue;
      await supabase.patchChunkEmbedding(c.ref_id, c.chunk_index, c.corpus_version, vec);
    }
    done += batch.length;
    chunks = chunks.slice(BATCH);
    console.log(`  … 已处理 ${done} 条`);
  }
  const embeddedCount = await supabase.countEmbeddedChunks();
  console.log(`\n✅ 完成，embedded_chunks=${embeddedCount}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
