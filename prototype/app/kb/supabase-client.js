'use strict';

const { ragConfig, canUseSupabase } = require('./config');

function headers(service = true) {
  const cfg = ragConfig();
  const key = service ? cfg.supabaseServiceKey : cfg.supabaseAnonKey;
  // 本地 PostgREST（无 JWT）不需要 Authorization
  if (key === 'local-dev-postgres') return { 'Content-Type': 'application/json', Prefer: 'return=representation' };
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}

function apiBase() {
  const url = ragConfig().supabaseUrl.replace(/\/$/, '');
  // 云端 Supabase 带 /rest/v1；本地 PostgREST 直出表名
  if (url.includes('supabase.co') || url.includes('/rest/v1')) {
    return url.includes('/rest/v1') ? url : `${url}/rest/v1`;
  }
  return url;
}

function restUrl(table, query = '') {
  const q = query ? (query.startsWith('?') ? query : `?${query}`) : '';
  return `${apiBase()}/${table}${q}`;
}

async function rest(method, table, { query = '', body = null, service = true } = {}) {
  const res = await fetch(restUrl(table, query), {
    method,
    headers: headers(service),
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = typeof data === 'object' && data?.message ? data.message : text;
    throw new Error(`Supabase ${method} ${table} ${res.status}: ${msg}`);
  }
  return data;
}

async function upsertEntries(rows) {
  if (!rows.length) return 0;
  const cfg = ragConfig();
  const url = `${cfg.supabaseUrl.replace(/\/$/, '')}/rest/v1/kb_entries?on_conflict=ref_id`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...headers(true),
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`upsertEntries ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return Array.isArray(data) ? data.length : rows.length;
}

async function upsertChunks(rows) {
  if (!rows.length) return 0;
  const cfg = ragConfig();
  const url = `${cfg.supabaseUrl.replace(/\/$/, '')}/rest/v1/kb_chunks?on_conflict=ref_id,chunk_index,corpus_version`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...headers(true),
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`upsertChunks ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return Array.isArray(data) ? data.length : rows.length;
}

async function getEntryByRefId(refId) {
  const rows = await rest('GET', 'kb_entries', {
    query: `ref_id=eq.${encodeURIComponent(refId)}&limit=1`,
    service: false,
  });
  return rows?.[0] || null;
}

async function listEntries({ kbLayer, limit = 500 } = {}) {
  let q = `select=ref_id,text,verify_status,kb_layer&limit=${limit}`;
  if (kbLayer) q += `&kb_layer=eq.${encodeURIComponent(kbLayer)}`;
  return rest('GET', 'kb_entries', { query: q, service: false }) || [];
}

async function countEntries() {
  const rows = await rest('GET', 'kb_entries', {
    query: 'select=ref_id',
    service: false,
  });
  return Array.isArray(rows) ? rows.length : 0;
}

async function countEmbeddedChunks() {
  const rows = await rest('GET', 'kb_chunks', {
    query: 'select=ref_id&embedding=not.is.null',
    service: false,
  });
  return Array.isArray(rows) ? rows.length : 0;
}

/** pgvector 相似度检索（需 kb_match RPC + embedding 已灌） */
async function rpcKbMatch(embedding, { matchLayer = null, matchCount = 8, minSimilarity = 0.25 } = {}) {
  const vec = `[${embedding.join(',')}]`;
  return rest('POST', 'rpc/kb_match', {
    body: {
      query_embedding: vec,
      match_layer: matchLayer,
      match_count: matchCount,
      min_similarity: minSimilarity,
    },
    service: false,
  });
}

async function patchChunkEmbedding(refId, chunkIndex, corpusVersion, embedding) {
  const cfg = ragConfig();
  const q = `ref_id=eq.${encodeURIComponent(refId)}&chunk_index=eq.${chunkIndex}&corpus_version=eq.${encodeURIComponent(corpusVersion)}`;
  const url = `${apiBase()}/kb_chunks?${q}`;
  const key = cfg.supabaseServiceKey;
  const headers = key === 'local-dev-postgres'
    ? { 'Content-Type': 'application/json', Prefer: 'return=representation' }
    : { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  const res = await fetch(url, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ embedding: `[${embedding.join(',')}]`, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`patchChunkEmbedding ${res.status}: ${await res.text()}`);
  return res.json();
}

async function ping() {
  if (!canUseSupabase()) return { ok: false, reason: 'missing_credentials' };
  try {
    const n = await countEntries();
    let embedded = 0;
    try { embedded = await countEmbeddedChunks(); } catch { /* optional */ }
    return { ok: true, entry_count: n, embedded_chunks: embedded };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

async function upsertGovernanceStates(rows) {
  if (!rows.length) return 0;
  const now = new Date().toISOString();
  const payload = rows.map(r => ({
    rule_id: r.rule_id,
    status: r.status || 'active',
    reason: r.reason || null,
    ack_rejects: r.ack_rejects || 0,
    history: r.history || [],
    updated_at: r.updated_at || now,
    synced_at: now,
  }));
  const url = `${apiBase()}/governance_rule_states?on_conflict=rule_id`;
  const cfg = ragConfig();
  const key = cfg.supabaseServiceKey;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...headers(true),
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`upsertGovernanceStates ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return Array.isArray(data) ? data.length : payload.length;
}

async function listGovernanceStates() {
  return rest('GET', 'governance_rule_states', {
    query: 'select=rule_id,status,reason,ack_rejects,history,updated_at,synced_at&order=rule_id.asc',
    service: false,
  }) || [];
}

async function insertGovernanceSnapshot(snapshot, source = 'local') {
  const rows = await rest('POST', 'governance_snapshots', {
    body: { snapshot, source },
    service: true,
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

module.exports = {
  canUseSupabase,
  upsertEntries,
  upsertChunks,
  getEntryByRefId,
  listEntries,
  countEntries,
  countEmbeddedChunks,
  rpcKbMatch,
  patchChunkEmbedding,
  ping,
  upsertGovernanceStates,
  listGovernanceStates,
  insertGovernanceSnapshot,
};
