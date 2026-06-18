'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { slotFillStatus } = require('./intake-merge');
const { INTAKE_SLOTS } = require('./intake-classifier');
const { DEFAULT_CONFIG } = require('./priority-score');

const STORE_DIR = path.join(__dirname, '../../data/priority');
const STORE_PATH = path.join(STORE_DIR, 'store.json');

function emptyStore() {
  return {
    schema_version: '1.0',
    config: { ...DEFAULT_CONFIG, mask_pii: true },
    patients: {},
    cases: {},
    audit_records: [],
    import_batches: [],
    audit_log: [],
  };
}

function loadStore() {
  try {
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    return { ...emptyStore(), ...raw, config: { ...DEFAULT_CONFIG, ...(raw.config || {}) } };
  } catch {
    return emptyStore();
  }
}

function saveStore(store) {
  if (process.env.VERCEL || process.env.READONLY_RUNTIME) return;
  fs.mkdirSync(STORE_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function appendAuditLog(store, entry) {
  store.audit_log = store.audit_log || [];
  store.audit_log.push({ ...entry, ts: entry.ts || new Date().toISOString() });
  store.audit_log = store.audit_log.slice(-500);
}

function patientKeyFromRecord(record) {
  const fp = record.front_page || {};
  const token = record.case_meta?.pii_token;
  if (token) return `P-${token}`;
  const name = fp.patient_name || record.case_meta?.patient_hint || '';
  if (name) return `P-${crypto.createHash('sha256').update(name).digest('hex').slice(0, 8)}`;
  return `P-ANON-${(record.case_meta?.internal_id || record.case_meta?.case_id || 'UNK').slice(-8)}`;
}

function maskName(name, token) {
  if (!name) return token || '患者***';
  if (name.length <= 1) return `${name}*`;
  return name[0] + '*'.repeat(Math.min(name.length - 1, 2));
}

function upsertPatient(store, record, caseApiId) {
  const pid = patientKeyFromRecord(record);
  const fp = record.front_page || {};
  const existing = store.patients[pid] || {
    patient_id: pid,
    case_ids: [],
    created_at: new Date().toISOString(),
  };
  existing.name = fp.patient_name || existing.name || '';
  existing.id_no_masked = existing.id_no_masked || (fp.insurance_no ? `***${String(fp.insurance_no).slice(-4)}` : null);
  existing.gender = fp.sex || existing.gender || null;
  existing.birth = fp.birth_date || existing.birth || null;
  existing.pii_token = record.case_meta?.pii_token || existing.pii_token;
  existing.updated_at = new Date().toISOString();
  if (caseApiId && !existing.case_ids.includes(caseApiId)) existing.case_ids.push(caseApiId);
  store.patients[pid] = existing;
  return pid;
}

function slotCompleteness(record) {
  const filled = slotFillStatus(record);
  const total = INTAKE_SLOTS.filter(s => s.id !== 'unknown' && s.id !== 'full_record').length;
  const anchorCount = (record.fee_list?.items || []).filter(i => i.anchor?.page || i.anchor?.bbox).length;
  const feeCount = record.fee_list?.items?.length || 0;
  return {
    slots_filled: filled,
    completeness: total ? Math.round((filled.length / total) * 1000) / 10 : 0,
    anchor_coverage: feeCount ? Math.round((anchorCount / feeCount) * 1000) / 10 : 0,
    total_slots: total,
  };
}

function detectSource(record) {
  const src = record.case_meta?.intake_source || record.intake_meta?.parser;
  if (src === 'batch_drop' || record.intake_meta) return 'batch';
  if (src === 'structured') return 'structured';
  if (src === 'connector') return 'connector';
  if (src === 'document') return 'document';
  return 'bench';
}

function upsertCaseFromRecord(store, caseApiId, record) {
  const patientId = upsertPatient(store, record, caseApiId);
  const slots = slotCompleteness(record);
  const fp = record.front_page || {};
  const prev = store.cases[caseApiId] || {};
  store.cases[caseApiId] = {
    case_id: caseApiId,
    patient_id: patientId,
    internal_id: record.case_meta?.internal_id || prev.internal_id,
    case_title: record.case_meta?.case_title || prev.case_title,
    status: prev.status || 'uploaded',
    source: detectSource(record),
    dept: fp.admit_dept || prev.dept || null,
    doctor: fp.attending_physician || fp.chief_physician || prev.doctor || null,
    admit_time: fp.admit_time || prev.admit_time,
    discharge_time: fp.discharge_time || prev.discharge_time,
    principal_diagnosis: fp.principal_diagnosis?.name || prev.principal_diagnosis,
    slots_filled: slots.slots_filled,
    completeness: slots.completeness,
    anchor_coverage: slots.anchor_coverage,
    fee_line_count: record.fee_list?.items?.length || 0,
    findings_cache: prev.findings_cache || null,
    findings_cached_at: prev.findings_cached_at || null,
    last_audit_id: prev.last_audit_id || null,
    created_at: prev.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  return store.cases[caseApiId];
}

function syncCasesFromDb(store, casesMap) {
  for (const [apiId, record] of Object.entries(casesMap || {})) {
    if (!record) continue;
    upsertCaseFromRecord(store, apiId, record);
  }
  saveStore(store);
  return store;
}

function setFindingsCache(store, caseApiId, findings, auditMeta) {
  const c = store.cases[caseApiId];
  if (!c) return null;
  c.findings_cache = findings;
  c.findings_cached_at = new Date().toISOString();
  if (auditMeta?.audit_id) c.last_audit_id = auditMeta.audit_id;
  c.updated_at = new Date().toISOString();
  saveStore(store);
  return c;
}

function createAuditRecord(store, { case_id, auditor_id, findings, report_meta, cove, defense, compliance_flags, collective_decision, defense_record }) {
  const audit_id = `AUD-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
  const now = new Date().toISOString();
  const rec = {
    audit_id,
    case_id,
    auditor_id: auditor_id || 'demo-auditor',
    started_at: now,
    finished_at: now,
    findings_snapshot: findings,
    summary: report_meta?.summary || {},
    cove_result: cove || null,
    defense_result: defense || null,
    compliance_gate_result: compliance_flags || null,
    collective_decision: collective_decision || null,
    defense: defense_record || null,
    timeline: [
      { event: '稽核完成', at: now, actor: auditor_id || 'demo-auditor' },
    ],
    appeal_channel: '医疗机构可在收到认定材料后提交申诉与补证材料（演示口径，对齐飞检申辩通道）',
    status_transitions: [{ from: 'uploaded', to: 'audited', ts: now }],
  };
  store.audit_records.push(rec);
  store.audit_records = store.audit_records.slice(-200);

  const c = store.cases[case_id];
  if (c) {
    c.status = 'audited';
    c.last_audit_id = audit_id;
    c.findings_cache = findings;
    c.findings_cached_at = rec.finished_at;
  }
  appendAuditLog(store, { action: 'audit_complete', case_id, audit_id, auditor_id: rec.auditor_id });
  saveStore(store);
  return rec;
}

function setCaseStatus(store, caseApiId, status, reason) {
  const c = store.cases[caseApiId];
  if (!c) return null;
  const from = c.status;
  c.status = status;
  c.updated_at = new Date().toISOString();
  appendAuditLog(store, { action: 'case_status', case_id: caseApiId, from, to: status, reason });
  saveStore(store);
  return c;
}

function recordImportBatch(store, batch) {
  const batch_id = batch.batch_id || `IMP-${Date.now().toString(36)}`;
  const entry = {
    batch_id,
    files: batch.files || [],
    classified: batch.classified || {},
    result_case_ids: batch.result_case_ids || ['uploaded'],
    created_at: new Date().toISOString(),
    errors: batch.errors || [],
  };
  store.import_batches.push(entry);
  store.import_batches = store.import_batches.slice(-50);
  appendAuditLog(store, { action: 'import_batch', batch_id, file_count: (batch.files || []).length });
  saveStore(store);
  return entry;
}

function updateConfig(store, patch, actor) {
  const prev = { ...store.config };
  store.config = { ...store.config, ...patch };
  appendAuditLog(store, { action: 'priority_config_update', actor: actor || 'demo', prev, next: store.config });
  saveStore(store);
  return store.config;
}

function maskPatient(patient, maskPii) {
  if (!maskPii) return patient;
  return {
    ...patient,
    name: maskName(patient.name, patient.pii_token),
    id_no_masked: patient.id_no_masked ? '***' : null,
  };
}

function listPatients(store, { maskPii = true } = {}) {
  return Object.values(store.patients).map(p => maskPatient(p, maskPii));
}

function getPatient(store, patientId, { maskPii = true } = {}) {
  const p = store.patients[patientId];
  if (!p) return null;
  const masked = maskPatient(p, maskPii);
  const cases = (p.case_ids || []).map(id => store.cases[id]).filter(Boolean);
  return { ...masked, cases };
}

module.exports = {
  STORE_PATH,
  loadStore,
  saveStore,
  emptyStore,
  syncCasesFromDb,
  upsertCaseFromRecord,
  setFindingsCache,
  createAuditRecord,
  setCaseStatus,
  recordImportBatch,
  updateConfig,
  slotCompleteness,
  listPatients,
  getPatient,
  maskPatient,
  appendAuditLog,
  patientKeyFromRecord,
};
