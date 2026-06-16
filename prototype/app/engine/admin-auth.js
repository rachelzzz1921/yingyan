'use strict';

const { isConfigured } = require('../kb/config');

function adminTokenConfigured() {
  return isConfigured(process.env.YINGYAN_ADMIN_TOKEN);
}

function readAdminToken(req) {
  const h = req.headers || {};
  const raw = h['x-yingyan-token'] || h['x-yingyan-admin-token'] || '';
  if (raw) return String(raw).trim();
  const auth = h.authorization || h.Authorization || '';
  const m = String(auth).match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

/** demo 未配 token 时放行；生产配 YINGYAN_ADMIN_TOKEN 后治理写操作需令牌 */
function checkAdmin(req) {
  if (!adminTokenConfigured()) {
    return { ok: true, mode: 'demo_open' };
  }
  const token = readAdminToken(req);
  if (token !== process.env.YINGYAN_ADMIN_TOKEN.trim()) {
    return { ok: false, status: 401, error: '需要 YINGYAN_ADMIN_TOKEN（Header: X-Yingyan-Token 或 Authorization: Bearer）' };
  }
  return { ok: true, mode: 'token' };
}

function enforceAdmin(req, res, sendJSON) {
  const r = checkAdmin(req);
  if (!r.ok) {
    sendJSON(res, { error: r.error, auth_required: true }, r.status);
    return false;
  }
  return true;
}

module.exports = { adminTokenConfigured, checkAdmin, enforceAdmin, readAdminToken };
