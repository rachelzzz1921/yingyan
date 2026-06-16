'use strict';

/**
 * 鹰眼 · PP-Structure sidecar 客户端
 * 默认 http://127.0.0.1:8787 · 环境变量 PPSTRUCTURE_URL
 */
const DEFAULT_URL = process.env.PPSTRUCTURE_URL || 'http://127.0.0.1:8787';
const TIMEOUT_MS = Number(process.env.PPSTRUCTURE_TIMEOUT_MS || 120000);

let _healthCache = { at: 0, data: null };

async function fetchJson(url, opts = {}) {
  if (typeof fetch !== 'function') throw new Error('需 Node18+ fetch');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: data.detail || data.error || r.statusText, status: r.status };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? '解析超时' : e.message };
  } finally {
    clearTimeout(t);
  }
}

async function health(force = false) {
  const now = Date.now();
  if (!force && _healthCache.data && now - _healthCache.at < 15000) return _healthCache.data;
  const r = await fetchJson(`${DEFAULT_URL.replace(/\/$/, '')}/health`);
  const out = r.ok ? { ...r.data, reachable: true, url: DEFAULT_URL } : { reachable: false, url: DEFAULT_URL, error: r.error };
  _healthCache = { at: now, data: out };
  return out;
}

function isReady(h) {
  return !!(h || _healthCache.data)?.reachable;
}

async function parseDocument({ fileBase64, mime, filename }) {
  const r = await fetchJson(`${DEFAULT_URL.replace(/\/$/, '')}/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_base64: fileBase64, mime: mime || 'application/octet-stream', filename: filename || 'upload.bin' }),
  });
  if (!r.ok) return { ok: false, error: r.error, hint: '启动解析服务: bash prototype/ppstructure/run.sh' };
  return { ok: true, layout: r.data };
}

module.exports = { parseDocument, health, isReady, DEFAULT_URL };
