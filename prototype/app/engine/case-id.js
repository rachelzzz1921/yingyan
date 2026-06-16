'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.resolve(__dirname, '../../data');
const REGISTRY_PATH = path.join(DATA_DIR, 'case_registry.json');

const CASE_ID_ALIAS = { NSCLC: 'main' };

function loadRegistry() {
  try {
    const raw = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    return { entries: raw.entries || [], meta: raw.meta || {} };
  } catch {
    return { entries: [], meta: { version: 1 } };
  }
}

function saveRegistry(reg) {
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2), 'utf8');
}

function makePiiToken() {
  return 'P-' + crypto.randomBytes(2).toString('hex');
}

function padSeq(n) {
  return String(n).padStart(3, '0');
}

function formatId(scope, domain, seq) {
  return `YY-${scope}-${domain}-${padSeq(seq)}`;
}

function nextSeq(entries, scope, domain) {
  const prefix = `YY-${scope}-${domain}-`;
  let max = 0;
  for (const e of entries) {
    if (!e.internal_id?.startsWith(prefix)) continue;
    const n = parseInt(e.internal_id.slice(prefix.length), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return max + 1;
}

function allocateCaseId({ scope = 'INT', domain = 'UNK', folder = null, api_id = null, bench_tier = null } = {}) {
  const reg = loadRegistry();
  const seq = nextSeq(reg.entries, scope, domain);
  const internal_id = formatId(scope, domain, seq);
  const entry = {
    internal_id,
    folder,
    api_id,
    scope,
    domain,
    bench_tier,
    pii_token: makePiiToken(),
    created_at: new Date().toISOString(),
  };
  reg.entries.push(entry);
  saveRegistry(reg);
  return entry;
}

function registerExisting(entry) {
  const reg = loadRegistry();
  const idx = reg.entries.findIndex(e => e.internal_id === entry.internal_id || e.folder === entry.folder);
  const merged = { ...entry, pii_token: entry.pii_token || makePiiToken(), created_at: entry.created_at || new Date().toISOString() };
  if (idx >= 0) reg.entries[idx] = { ...reg.entries[idx], ...merged };
  else reg.entries.push(merged);
  saveRegistry(reg);
  return merged;
}

function getByFolder(folder) {
  const reg = loadRegistry();
  return reg.entries.find(e => e.folder === folder) || null;
}

function getByInternalId(id) {
  const reg = loadRegistry();
  return reg.entries.find(e => e.internal_id === id) || null;
}

function ensureRecordMeta(record, opts = {}) {
  if (!record.case_meta) record.case_meta = {};
  const cm = record.case_meta;
  if (cm.internal_id && cm.pii_token) return cm;

  const folder = opts.folder || null;
  let regEntry = folder ? getByFolder(folder) : (cm.case_id ? getByInternalId(cm.case_id) : null);

  if (!regEntry && cm.case_id?.startsWith('YY-')) {
    regEntry = getByInternalId(cm.case_id);
  }

  if (!regEntry && opts.scope) {
    regEntry = allocateCaseId({
      scope: opts.scope,
      domain: opts.domain || 'UNK',
      folder,
      api_id: opts.api_id,
      bench_tier: opts.bench_tier,
    });
  }

  if (regEntry) {
    cm.internal_id = regEntry.internal_id;
    cm.pii_token = regEntry.pii_token;
    if (!cm.case_id || cm.case_id.startsWith('UPLOAD-')) cm.case_id = regEntry.internal_id;
  } else if (!cm.internal_id) {
    cm.internal_id = cm.case_id || `YY-INT-UNK-${Date.now().toString(36).toUpperCase()}`;
    cm.pii_token = cm.pii_token || makePiiToken();
  }
  return cm;
}

function discoverCaseFolders(dataDir = DATA_DIR) {
  const out = [];
  if (!fs.existsSync(dataDir)) return out;
  for (const name of fs.readdirSync(dataDir)) {
    if (!name.startsWith('case_')) continue;
    const folderId = name.replace(/^case_/, '');
    const apiId = CASE_ID_ALIAS[folderId] || folderId;
    out.push({ folder: name, folderId, apiId });
  }
  return out;
}

function bootstrapRegistry(dataDir = DATA_DIR) {
  const reg = loadRegistry();
  if (reg.entries.length > 0) return reg;

  const seeds = [
    { folder: 'case_NSCLC', api_id: 'main', scope: 'DEMO', domain: 'NSCLC', bench_tier: 'violation', internal_id: 'YY-DEMO-NSCLC-001' },
    { folder: 'case_clean', api_id: 'clean', scope: 'BENCH', domain: 'CLEAN', bench_tier: 'clean', internal_id: 'YY-BENCH-CLEAN-001' },
    { folder: 'case_ortho', api_id: 'ortho', scope: 'BENCH', domain: 'ORTHO', bench_tier: 'violation', internal_id: 'YY-BENCH-ORTHO-001' },
    { folder: 'case_drg', api_id: 'drg', scope: 'BENCH', domain: 'DRG', bench_tier: 'violation', internal_id: 'YY-BENCH-DRG-001' },
    { folder: 'case_imaging', api_id: 'imaging', scope: 'BENCH', domain: 'IMG', bench_tier: 'violation', internal_id: 'YY-BENCH-IMG-001' },
    { folder: 'case_edge_egfr', api_id: 'edge_egfr', scope: 'BENCH', domain: 'EDGE-EGFR', bench_tier: 'boundary', internal_id: 'YY-BENCH-EDGE-EGFR-001' },
    { folder: 'case_edge_gcsf', api_id: 'edge_gcsf', scope: 'BENCH', domain: 'EDGE-GCSF', bench_tier: 'boundary', internal_id: 'YY-BENCH-EDGE-GCSF-001' },
    { folder: 'case_anes', api_id: 'anes', scope: 'BENCH', domain: 'ANES', bench_tier: 'violation', internal_id: 'YY-BENCH-ANES-001' },
    { folder: 'case_pharmacy', api_id: 'pharmacy', scope: 'BENCH', domain: 'PHARM', bench_tier: 'violation', internal_id: 'YY-BENCH-PHARM-001' },
    { folder: 'case_icu', api_id: 'icu', scope: 'BENCH', domain: 'ICU', bench_tier: 'violation', internal_id: 'YY-BENCH-ICU-001' },
  ];

  for (const s of seeds) {
    registerExisting({ ...s, pii_token: makePiiToken(), created_at: new Date().toISOString() });
  }
  return loadRegistry();
}

function registryStats() {
  const reg = loadRegistry();
  const entries = reg.entries || [];
  return {
    total: entries.length,
    by_scope: entries.reduce((m, e) => { m[e.scope] = (m[e.scope] || 0) + 1; return m; }, {}),
    by_tier: entries.reduce((m, e) => { if (e.bench_tier) m[e.bench_tier] = (m[e.bench_tier] || 0) + 1; return m; }, {}),
  };
}

module.exports = {
  REGISTRY_PATH,
  CASE_ID_ALIAS,
  loadRegistry,
  allocateCaseId,
  registerExisting,
  getByFolder,
  getByInternalId,
  ensureRecordMeta,
  discoverCaseFolders,
  bootstrapRegistry,
  registryStats,
  formatId,
};
