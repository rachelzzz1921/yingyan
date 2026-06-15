'use strict';

const fs = require('fs');
const path = require('path');
const { ragConfig, canUseStepfun } = require('./config');

function authHeaders() {
  const cfg = ragConfig();
  return {
    Authorization: `Bearer ${cfg.stepfunApiKey}`,
  };
}

async function api(method, route, { json, formData, headers = {} } = {}) {
  const cfg = ragConfig();
  const url = `${cfg.stepfunBaseUrl.replace(/\/$/, '')}${route}`;
  const res = await fetch(url, {
    method,
    headers: { ...authHeaders(), ...headers },
    body: formData || (json != null ? JSON.stringify(json) : undefined),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = typeof data === 'object' && data?.error?.message ? data.error.message : text;
    throw new Error(`StepFun ${method} ${route} ${res.status}: ${msg}`);
  }
  return data;
}

async function createVectorStore(name) {
  return api('POST', '/vector_stores', { json: { name } });
}

async function listVectorStores() {
  return api('GET', '/vector_stores');
}

async function ensureVectorStore() {
  const cfg = ragConfig();
  if (cfg.stepfunVectorStoreId) {
    return { id: cfg.stepfunVectorStoreId, name: cfg.stepfunVectorStoreName };
  }
  const listed = await listVectorStores();
  const stores = listed?.data || listed || [];
  const hit = stores.find(s => s.name === cfg.stepfunVectorStoreName);
  if (hit) return hit;
  return createVectorStore(cfg.stepfunVectorStoreName);
}

async function uploadTextFile(filename, content) {
  const cfg = ragConfig();
  const blob = new Blob([content], { type: 'text/plain' });
  const form = new FormData();
  form.append('file', blob, filename);
  form.append('purpose', 'retrieval');
  const res = await fetch(`${cfg.stepfunBaseUrl.replace(/\/$/, '')}/files`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(`StepFun upload file ${res.status}: ${text}`);
  return data;
}

async function addFileToVectorStore(vectorStoreId, fileId, description = '') {
  const cfg = ragConfig();
  const form = new FormData();
  form.append('file_ids', fileId);
  if (description) form.append('description', description);
  const res = await fetch(`${cfg.stepfunBaseUrl.replace(/\/$/, '')}/vector_stores/${vectorStoreId}/files`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(`StepFun add to vector store ${res.status}: ${text}`);
  return data;
}

/** 将 KB 条目批量同步到阶跃 Vector Store（语义层托管 RAG） */
async function syncEntriesToVectorStore(entries) {
  if (!canUseStepfun()) return { ok: false, reason: 'missing_stepfun_key' };
  const store = await ensureVectorStore();
  const lines = entries.map(e => `[${e.ref_id}]\n${e.text}`).join('\n\n---\n\n');
  const file = await uploadTextFile(`yingyan-kb-${Date.now()}.txt`, lines);
  const fileId = file.id || file.file_id;
  await addFileToVectorStore(store.id, fileId, `yingyan corpus sync ${entries.length} entries`);
  return { ok: true, vector_store_id: store.id, file_id: fileId, entry_count: entries.length };
}

async function ping() {
  if (!canUseStepfun()) return { ok: false, reason: 'missing_stepfun_key' };
  try {
    await api('GET', '/models');
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

module.exports = {
  canUseStepfun,
  createVectorStore,
  ensureVectorStore,
  uploadTextFile,
  addFileToVectorStore,
  syncEntriesToVectorStore,
  ping,
};
