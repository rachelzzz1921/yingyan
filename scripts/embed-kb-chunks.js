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

async function fetchChunksNeedingEmbed() {
  const cfg = ragConfig();
  const base = cfg.supabaseUrl.replace(/\/$/, '');
  const apiBase = base.includes('supabase.co') ? `${base}/rest/v1` : base;
  const url = `${apiBase}/kb_chunks?select=ref_id,chunk_index,content,corpus_version,embedding&corpus_version=eq.${encodeURIComponent(cfg.corpusVersion)}&limit=500`;
  const key = cfg.supabaseServiceKey;
  const headers = key === 'local-dev-postgres'
    ? {}
    : { apikey: key, Authorization: `Bearer ${key}` };
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`fetch chunks ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  return rows.filter(r => !r.embedding);
}

async function main() {
  if (!canUseSupabase()) {
    console.error('❌ 缺少 Supabase 配置');
    process.exit(1);
  }
  if (!canEmbed()) {
    console.error('❌ 缺少 DASHSCOPE_API_KEY（或 ZHIPU + RAG_EMBEDDING_PROVIDER=zhipu）');
    process.exit(1);
  }

  const chunks = await fetchChunksNeedingEmbed();
  if (!chunks.length) {
    console.log('✅ 所有 chunk 已有 embedding，无需处理');
    return;
  }
  console.log(`🔢 待向量化 ${chunks.length} 条 chunk…`);

  const BATCH = 10;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    const vectors = await embedTexts(batch.map(c => c.content));
    for (let j = 0; j < batch.length; j++) {
      const c = batch[j];
      const vec = vectors[j];
      if (!vec?.length) continue;
      await supabase.patchChunkEmbedding(c.ref_id, c.chunk_index, c.corpus_version, vec);
    }
    console.log(`  … ${Math.min(i + BATCH, chunks.length)}/${chunks.length}`);
  }
  const embedded = await supabase.countEmbeddedChunks();
  console.log(`\n✅ 完成，embedded_chunks=${embedded}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
