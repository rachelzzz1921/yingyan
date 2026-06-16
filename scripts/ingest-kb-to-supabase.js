#!/usr/bin/env node
'use strict';

/**
 * 将 prototype/data/kb/*.json 灌入 Supabase，并可选同步到阶跃 Vector Store
 * 用法：node scripts/ingest-kb-to-supabase.js [--stepfun]
 */
const fs = require('fs');
const path = require('path');

// 加载 app/.env
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

const { ragConfig, canUseSupabase, canUseStepfun } = require('../prototype/app/kb/config');
const { canEmbed } = require('../prototype/app/kb/embedding-provider');
const supabase = require('../prototype/app/kb/supabase-client');
const stepfun = require('../prototype/app/kb/stepfun-client');

const DATA = path.resolve(__dirname, '../prototype/data');
const DOMAIN_ALIAS = {
  麻醉: '麻醉', 重症医学: '重症', 定点零售药店: '药店', 医学影像: '影像',
  肿瘤: '肿瘤', 心血管内科: '心血管', 血液净化: '血净', 康复: '康复', 临床检验: '检验',
};

function loadJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

function flattenKB() {
  const kb1 = loadJSON(path.join(DATA, 'kb/kb1_policies.json'));
  let kb2 = { entries: [] };
  try { kb2 = loadJSON(path.join(DATA, 'kb/kb2_clinical.json')); } catch {}
  let pl = { domains: [] };
  try { pl = loadJSON(path.join(DATA, 'kb/kb1_problem_lists.json')); } catch {}

  const cfg = ragConfig();
  const rows = [];

  for (const e of kb1.entries || []) {
    rows.push({
      kb_layer: 'KB1',
      ref_id: e.ref_id,
      doc_id: e.doc_id,
      layer: e.layer,
      authority: e.authority,
      doc_no: e.doc_no,
      doc_name: e.doc_name,
      effective_from: e.effective_from || null,
      effective_to: e.effective_to || null,
      region: e.region,
      unit_type: e.unit_type,
      locator: e.locator,
      text: e.text,
      violation_tags: e.violation_tags || [],
      linked_rules: e.linked_rules || [],
      verify_status: e.verify_status,
      source_url: e.source_url,
      metadata: {},
      corpus_version: cfg.corpusVersion,
    });
  }

  for (const e of kb2.entries || []) {
    rows.push({
      kb_layer: 'KB2',
      ref_id: e.kb2_id,
      doc_id: e.doc_id || e.kb2_id,
      layer: e.layer || '临床指南',
      authority: e.authority,
      doc_name: e.doc_name || e.title,
      text: e.text,
      linked_rules: e.linked_rules || [],
      verify_status: e.verify_status,
      source_url: e.source_url,
      metadata: { disease: e.disease, drug: e.drug },
      corpus_version: cfg.corpusVersion,
    });
  }

  for (const d of pl.domains || []) {
    const alias = DOMAIN_ALIAS[d.domain] || d.domain;
    const ver = (d.version || '').includes('2025') ? '2025' : '';
    for (const it of d.items || []) {
      if (it.no != null) {
        for (const refId of [`KB1-问题清单${ver}-${alias}-${it.no}`, `KB1-问题清单${alias}-${it.no}`]) {
          rows.push({
            kb_layer: 'PL',
            ref_id: refId,
            layer: '问题清单',
            doc_name: d.domain,
            text: `[${d.domain}清单序号${it.no}·${it.type}] ${it.text}`,
            verify_status: it.verify || d.verify_status,
            metadata: { domain: d.domain, item_no: it.no, type: it.type },
            corpus_version: cfg.corpusVersion,
          });
        }
      } else if (it.text) {
        const refId = `KB1-问题清单-${alias}-${it.type || '项'}-${rows.filter(r => r.kb_layer === 'PL' && r.ref_id.includes(alias)).length + 1}`;
        rows.push({
          kb_layer: 'PL',
          ref_id: refId,
          layer: '问题清单',
          doc_name: d.domain,
          text: `[${d.domain}·${it.type || '问题项'}] ${it.text}`,
          verify_status: it.verify || d.verify_status,
          metadata: { domain: d.domain, type: it.type },
          corpus_version: cfg.corpusVersion,
        });
      }
    }
    const summary = (d.official_example ? d.official_example + ' ' : '') + (d.items || []).map(i => i.text).join(' / ');
    for (const k of [`KB1-问题清单${alias}(行业B类·待官方核)`, `KB1-问题清单${alias}(旁证·待官方核)`]) {
      if (!rows.some(r => r.ref_id === k) && summary.trim()) {
        rows.push({
          kb_layer: 'PL',
          ref_id: k,
          layer: '问题清单',
          doc_name: d.domain,
          text: summary.slice(0, 400),
          verify_status: d.verify_status,
          metadata: { domain: d.domain, kind: 'summary' },
          corpus_version: cfg.corpusVersion,
        });
      }
    }
  }

  return rows.map(normalizeRow);
}

const ROW_KEYS = [
  'kb_layer', 'ref_id', 'doc_id', 'layer', 'authority', 'doc_no', 'doc_name',
  'effective_from', 'effective_to', 'region', 'unit_type', 'locator', 'text',
  'violation_tags', 'linked_rules', 'verify_status', 'source_url', 'metadata', 'corpus_version',
];

function normalizeRow(row) {
  const out = {};
  for (const k of ROW_KEYS) {
    if (k === 'violation_tags' || k === 'linked_rules') out[k] = row[k] || [];
    else if (k === 'metadata') out[k] = row[k] || {};
    else out[k] = row[k] ?? null;
  }
  return out;
}

function toChunks(entries) {
  const cfg = ragConfig();
  return entries.map(e => ({
    ref_id: e.ref_id,
    kb_layer: e.kb_layer,
    chunk_index: 0,
    content: e.text,
    metadata: e.metadata || {},
    corpus_version: cfg.corpusVersion,
  }));
}

async function main() {
  const syncStepfun = process.argv.includes('--stepfun');
  if (!canUseSupabase()) {
    console.error('❌ 缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY，请先配置 prototype/app/.env');
    process.exit(1);
  }

  const entries = flattenKB();
  console.log(`📦 准备灌入 ${entries.length} 条 KB 条目…`);

  // PostgREST upsert 需要 Prefer header
  const cfg = ragConfig();
  const base = cfg.supabaseUrl.replace(/\/$/, '');
  const apiBase = base.includes('supabase.co') ? `${base}/rest/v1` : base;
  const url = `${apiBase}/kb_entries?on_conflict=ref_id`;
  const res = await fetch(url, {
    method: 'POST',
    headers: (() => {
      const cfg = ragConfig();
      const key = cfg.supabaseServiceKey;
      if (key === 'local-dev-postgres') {
        return { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' };
      }
      return {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      };
    })(),
    body: JSON.stringify(entries),
  });
  if (!res.ok) {
    console.error('❌ Supabase upsert 失败:', res.status, await res.text());
    process.exit(1);
  }
  const saved = await res.json();
  console.log(`✅ Supabase kb_entries: ${saved.length} 条`);

  const chunks = toChunks(entries);
  const chunkUrl = `${apiBase}/kb_chunks?on_conflict=ref_id,chunk_index,corpus_version`;
  const chunkRes = await fetch(chunkUrl, {
    method: 'POST',
    headers: (() => {
      const key = cfg.supabaseServiceKey;
      if (key === 'local-dev-postgres') {
        return { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' };
      }
      return {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      };
    })(),
    body: JSON.stringify(chunks),
  });
  if (!chunkRes.ok) {
    console.warn('⚠️ kb_chunks 写入失败（embedding 可后续补）:', await chunkRes.text());
  } else {
    const chunkSaved = await chunkRes.json();
    console.log(`✅ Supabase kb_chunks: ${chunkSaved.length} 条`);
  }

  if (!process.argv.includes('--no-embed') && canEmbed()) {
    console.log('🔢 写入 pgvector embedding（DashScope）…');
    require('child_process').execSync('node scripts/embed-kb-chunks.js', {
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..'),
    });
  } else if (!canEmbed()) {
    console.warn('⚠️ 未配置 DASHSCOPE_API_KEY，跳过 pgvector。配置后运行: node scripts/embed-kb-chunks.js');
  }

  if (syncStepfun) {
    if (!canUseStepfun()) {
      console.warn('⚠️ 跳过阶跃 Vector Store：未配置 STEPFUN_API_KEY');
    } else {
      console.log('🔄 同步到阶跃 Vector Store…');
      const sf = await stepfun.syncEntriesToVectorStore(entries);
      console.log('✅ 阶跃 Vector Store:', sf);
    }
  }

  console.log('\n完成。重启 server 后 /api/kb/status 应显示 live.active=true');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
