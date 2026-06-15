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

async function ping() {
  if (!canUseSupabase()) return { ok: false, reason: 'missing_credentials' };
  try {
    const n = await countEntries();
    return { ok: true, entry_count: n };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

module.exports = {
  canUseSupabase,
  upsertEntries,
  upsertChunks,
  getEntryByRefId,
  listEntries,
  countEntries,
  ping,
};
