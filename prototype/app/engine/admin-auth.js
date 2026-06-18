'use strict';

const { isConfigured } = require('../kb/config');

function adminTokenConfigured() {
  return isConfigured(process.env.YINGYAN_ADMIN_TOKEN);
}

function serviceKeyConfigured() {
  return isConfigured(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function authRequired() {
  return adminTokenConfigured() || serviceKeyConfigured();
}

function readAdminToken(req) {
  const h = req.headers || {};
  const raw = h['x-yingyan-token'] || h['x-yingyan-admin-token'] || '';
  if (raw) return String(raw).trim();
  const auth = h.authorization || h.Authorization || '';
  const m = String(auth).match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

/** demo 未配令牌时放行；生产可用 YINGYAN_ADMIN_TOKEN 或 Supabase Service Role（Bearer） */
function checkAdmin(req) {
  if (!authRequired()) {
    return { ok: true, mode: 'demo_open' };
  }
  const token = readAdminToken(req);
  if (adminTokenConfigured() && token === process.env.YINGYAN_ADMIN_TOKEN.trim()) {
    return { ok: true, mode: 'yingyan_token' };
  }
  if (serviceKeyConfigured() && token === process.env.SUPABASE_SERVICE_ROLE_KEY.trim()) {
    return { ok: true, mode: 'supabase_service' };
  }
  return {
    ok: false,
    status: 401,
    error: '需要 YINGYAN_ADMIN_TOKEN 或 SUPABASE_SERVICE_ROLE_KEY（Header: X-Yingyan-Token 或 Authorization: Bearer）',
  };
}

function enforceAdmin(req, res, sendJSON) {
  const r = checkAdmin(req);
  if (!r.ok) {
    sendJSON(res, { error: r.error, auth_required: true }, r.status);
    return false;
  }
  return true;
}

module.exports = { adminTokenConfigured, serviceKeyConfigured, authRequired, checkAdmin, enforceAdmin, readAdminToken };
