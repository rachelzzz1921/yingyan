'use strict';

const fs = require('fs');
const path = require('path');
const { ragConfig, canUseSupabase, canUseStepfun } = require('./config');
const supabase = require('./supabase-client');
const stepfun = require('./stepfun-client');
const { canEmbed, embedOne } = require('./embedding-provider');

const { buildPolicyMetaFromKb, filterPolicyMaps, parseAdmitDate } = require('./as-of');

const DOMAIN_ALIAS = {
  麻醉: '麻醉', 重症医学: '重症', 定点零售药店: '药店', 医学影像: '影像',
  肿瘤: '肿瘤', 心血管内科: '心血管', 血液净化: '血净', 康复: '康复', 临床检验: '检验',
};

function loadJsonKB(dataDir) {
  const kb1 = JSON.parse(fs.readFileSync(path.join(dataDir, 'kb/kb1_policies.json'), 'utf8'));
  let kb2 = { entries: [] };
  try { kb2 = JSON.parse(fs.readFileSync(path.join(dataDir, 'kb/kb2_clinical.json'), 'utf8')); } catch {}
  let pl = { domains: [] };
  try { pl = JSON.parse(fs.readFileSync(path.join(dataDir, 'kb/kb1_problem_lists.json'), 'utf8')); } catch {}
  return buildPolicyMaps(kb1, kb2, pl);
}

function buildPolicyMaps(kb1, kb2, pl) {
  const policyTexts = {};
  const policyVerified = {};
  for (const e of kb1.entries || []) {
    policyTexts[e.ref_id] = e.text;
    policyVerified[e.ref_id] = (e.verify_status || '').startsWith('✅');
  }
  for (const e of kb2.entries || []) {
    policyTexts[e.kb2_id] = e.text;
    policyVerified[e.kb2_id] = (e.verify_status || '').startsWith('✅');
  }
  for (const d of pl.domains || []) {
    const alias = DOMAIN_ALIAS[d.domain] || d.domain;
    const ver = (d.version || '').includes('2025') ? '2025' : '';
    const dverified = (d.verify_status || '').startsWith('✅');
    for (const it of d.items || []) {
      if (it.no != null) {
        for (const k of [`KB1-问题清单${ver}-${alias}-${it.no}`, `KB1-问题清单${alias}-${it.no}`]) {
          policyTexts[k] = `[${d.domain}清单序号${it.no}·${it.type}] ${it.text}`;
          policyVerified[k] = dverified && (it.verify ? it.verify.startsWith('✅') || it.verify.includes('已核实') : true);
        }
      }
    }
    const summary = (d.official_example ? d.official_example + ' ' : '') + (d.items || []).map(i => i.text).join(' / ');
    for (const k of [`KB1-问题清单${alias}(行业B类·待官方核)`, `KB1-问题清单${alias}(旁证·待官方核)`]) {
      policyTexts[k] = summary.slice(0, 400);
    }
  }
  return {
    policyTexts,
    policyVerified,
    policyMeta: buildPolicyMetaFromKb(kb1, kb2),
    source: 'json',
  };
}

async function loadFromSupabase() {
  const rows = await supabase.listEntries({ limit: 1000 });
  if (!rows.length) return null;
  const policyTexts = {};
  const policyVerified = {};
  for (const e of rows) {
    policyTexts[e.ref_id] = e.text;
    policyVerified[e.ref_id] = (e.verify_status || '').startsWith('✅');
  }
  return { policyTexts, policyVerified, source: 'supabase', entry_count: rows.length };
}

/** 启动时加载：Supabase 有数据则 Live，否则 JSON Oracle */
async function loadPolicyMaps(dataDir) {
  const cfg = ragConfig();
  const jsonMaps = loadJsonKB(dataDir);
  if (!cfg.enabled || cfg.mode === 'json') return jsonMaps;
  if (!canUseSupabase()) return jsonMaps;
  try {
    const live = await loadFromSupabase();
    if (live && live.entry_count > 0) return live;
  } catch (e) {
    console.warn('[kb] Supabase 读取失败，回退 JSON:', e.message);
  }
  return jsonMaps;
}

async function getByRefId(refId, jsonFallback) {
  if (canUseSupabase()) {
    try {
      const row = await supabase.getEntryByRefId(refId);
      if (row) return row.text;
    } catch { /* fall through */ }
  }
  return jsonFallback?.policyTexts?.[refId] || null;
}

/** 关键词语义兜底（无 pgvector embedding 时） */
function keywordSearch(query, policyTexts, { limit = 8, kbLayerPrefix = null } = {}) {
  const q = String(query);
  const terms = q.split(/[\s,，、；;]+/).filter(Boolean);
  if (!terms.length) return [];
  const wantsOrdinance = /条例/.test(q) && !/实施细则/.test(q);
  const articleMatch = q.match(/第(\d+)条/);
  const scored = [];
  for (const [refId, text] of Object.entries(policyTexts || {})) {
    if (kbLayerPrefix && !refId.startsWith(kbLayerPrefix)) continue;
    let score = 0;
    const lower = text.toLowerCase();
    for (const t of terms) {
      if (text.includes(t) || lower.includes(t.toLowerCase())) score += 1;
    }
    if (wantsOrdinance) {
      if (refId.includes('条例') && !refId.includes('实施细则')) score += 3;
      if (refId.includes('实施细则')) score -= 2;
    }
    if (articleMatch) {
      const art = articleMatch[1];
      if (refId === `KB1-条例-第${art}条`) score += 10;
      else if (refId.startsWith(`KB1-条例-第${art}条`)) score += 6;
    }
    if (score > 0) scored.push({ ref_id: refId, content: text.slice(0, 300), score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/** pgvector 语义检索；无 embedding 时回退 keywordSearch */
async function semanticSearch(query, { limit = 8, kbLayer = null, policyTexts = null, policyVerified = null, policyMeta = null, asOf = null, minSimilarity = 0.25 } = {}) {
  const q = String(query || '').trim();
  if (!q) return [];
  let texts = policyTexts || {};
  let verified = policyVerified || {};
  if (asOf && policyMeta) {
    const filtered = filterPolicyMaps({ policyTexts: texts, policyVerified: verified, policyMeta }, asOf);
    texts = filtered.policyTexts;
    verified = filtered.policyVerified;
  }
  if (canUseSupabase() && canEmbed()) {
    try {
      const embedded = await supabase.countEmbeddedChunks();
      if (embedded > 0) {
        const vec = await embedOne(q);
        if (vec?.length) {
          const rows = await supabase.rpcKbMatch(vec, {
            matchLayer: kbLayer,
            matchCount: limit,
            minSimilarity,
          });
          const vecRows = (rows || []).map(r => ({
            ref_id: r.ref_id,
            kb_layer: r.kb_layer,
            content: r.content,
            score: r.similarity,
            source: 'pgvector',
          }));
          const prefix = kbLayer === 'KB2' ? 'KB2' : kbLayer === 'KB1' ? 'KB1' : kbLayer === 'PL' ? 'KB1-问题清单' : null;
          const kwRows = keywordSearch(q, texts, { limit, kbLayerPrefix: prefix }).map(h => ({
            ...h,
            source: 'keyword',
          }));
          const wantsOrdinance = /条例/.test(q) && !/实施细则/.test(q);
          if (wantsOrdinance && vecRows.length && kwRows.length) {
            const vecTop = vecRows[0]?.ref_id || '';
            const kwTop = kwRows[0]?.ref_id || '';
            if (!vecTop.includes('条例') && kwTop.includes('条例')) {
              const merged = [...kwRows];
              const seen = new Set(kwRows.map(r => r.ref_id));
              for (const r of vecRows) {
                if (!seen.has(r.ref_id)) merged.push(r);
              }
              return merged.slice(0, limit);
            }
          }
          return vecRows;
        }
      }
    } catch (e) {
      console.warn('[kb] semanticSearch pgvector:', e.message);
    }
  }
  const prefix = kbLayer === 'KB2' ? 'KB2' : kbLayer === 'KB1' ? 'KB1' : kbLayer === 'PL' ? 'KB1-问题清单' : null;
  return keywordSearch(q, texts, { limit, kbLayerPrefix: prefix }).map(h => ({
    ...h,
    source: 'keyword',
  }));
}

async function status(dataDir) {
  const jsonMaps = loadJsonKB(dataDir);
  const cfg = ragConfig();
  const sb = canUseSupabase() ? await supabase.ping() : { ok: false, reason: 'not_configured' };
  const sf = canUseStepfun() ? await stepfun.ping() : { ok: false, reason: 'not_configured' };
  return {
    mode: cfg.mode,
    corpus_version: cfg.corpusVersion,
    embedding: {
      provider: cfg.embeddingProvider,
      model: cfg.embeddingModel,
      configured: canEmbed(),
      embedded_chunks: sb.embedded_chunks || 0,
    },
    oracle: { source: 'json', ref_count: Object.keys(jsonMaps.policyTexts).length },
    live: {
      supabase: sb,
      stepfun: sf,
      active: sb.ok && (sb.entry_count || 0) > 0,
      vector_ready: (sb.embedded_chunks || 0) > 0,
    },
    ragflow: { configured: !!(cfg.ragflowUrl && cfg.ragflowApiKey) },
  };
}

module.exports = {
  loadPolicyMaps,
  loadJsonKB,
  getByRefId,
  keywordSearch,
  semanticSearch,
  status,
  parseAdmitDate,
  filterPolicyMaps,
};
