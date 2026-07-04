'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { isReadonlyRuntime } = require('./runtime-env');

const DATA_DIR = path.join(__dirname, '../../data');
const STORE_PATH = path.join(DATA_DIR, 'evidence_links.json');

function emptyStore() {
  return { schema_version: '1.0', links: [] };
}

function loadStore() {
  try {
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    return { ...emptyStore(), ...raw, links: Array.isArray(raw.links) ? raw.links : [] };
  } catch {
    return emptyStore();
  }
}

function saveStore(store) {
  if (isReadonlyRuntime()) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify({ ...emptyStore(), ...store }, null, 2), 'utf8');
}

function caseKeys(record, explicitCaseId) {
  const meta = record?.case_meta || {};
  return [...new Set([
    explicitCaseId,
    meta.api_case_id,
    meta.case_id,
    meta.internal_id,
    meta.case_title,
  ].filter(Boolean).map(String))];
}

function normalizeFeeLineId(record, lineNo) {
  const item = (record?.fee_list?.items || []).find(x => Number(x.line_no) === Number(lineNo));
  if (item?.fee_line_id) return item.fee_line_id;
  return `${record?.case_meta?.case_id || record?.case_meta?.internal_id || 'CASE'}-L${lineNo || 'X'}`;
}

function addOnsiteEvidence({ caseId, record, finding, task, payload, operators, officers, ts }) {
  const now = ts || new Date().toISOString();
  const lineNo = payload?.line_no || task?.fee_line_no || finding?.fee_line_no || null;
  const link = {
    link_id: `EVL-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`,
    case_id: caseId,
    case_keys: caseKeys(record, caseId),
    finding_id: finding?.finding_id || task?.source_finding_id || null,
    rule_id: finding?.rule_id || task?.basis_ref?.rule_id || null,
    task_id: task?.task_id || null,
    station_id: task?.station_id || null,
    team: task?.team || null,
    fee_line_id: normalizeFeeLineId(record, lineNo),
    line_no: lineNo,
    material_type: 'onsite_evidence',
    material_id: payload?.photo_ref || payload?.doc_no || payload?.material_id || `onsite-${task?.task_id || 'task'}`,
    layer: 4,
    layer_label: '现场实证',
    source: 'onsite',
    match_type: 'onsite_verified',
    anchor_position: {
      field: payload?.photo_ref ? 'photo_ref' : (payload?.doc_no ? 'doc_no' : 'transcript_summary'),
      text: payload?.photo_ref || payload?.doc_no || payload?.transcript_summary || task?.type || '现场实证',
    },
    payload: {
      photo_ref: payload?.photo_ref || null,
      doc_no: payload?.doc_no || null,
      transcript_summary: payload?.transcript_summary || payload?.summary || null,
      ts: now,
      operator: operators?.[0] || payload?.operator || '现场检查员',
      operators: operators || [],
      officers: officers || [],
    },
    created_at: now,
  };
  const store = loadStore();
  store.links.push(link);
  store.links = store.links.slice(-1000);
  saveStore(store);
  return link;
}

function linksForRecord(record, explicitCaseId) {
  const keys = new Set(caseKeys(record, explicitCaseId));
  if (!keys.size) return [];
  return (loadStore().links || []).filter(l =>
    (l.case_keys || []).some(k => keys.has(String(k))) || keys.has(String(l.case_id || ''))
  );
}

function mergeOnsiteLinks(record, evidenceChain, explicitCaseId) {
  if (!evidenceChain) return evidenceChain;
  const links = linksForRecord(record, explicitCaseId);
  if (!links.length) return evidenceChain;
  const byLine = new Map();
  for (const l of links) {
    const key = l.line_no != null ? Number(l.line_no) : null;
    if (key != null) byLine.set(key, [...(byLine.get(key) || []), l]);
  }
  const feeLines = (evidenceChain.fee_lines || []).map(line => {
    const onsite = byLine.get(Number(line.line_no)) || [];
    if (!onsite.length) return line;
    const nodes = [...(line.nodes || [])];
    for (const link of onsite) {
      nodes.push({
        material_type: 'onsite_evidence',
        label: '现场实证',
        layer: 4,
        layer_label: '现场实证',
        kind: 'onsite',
        provided: true,
        match_type: link.match_type || 'onsite_verified',
        weight: 1,
        source: 'onsite',
        anchor: {
          material_id: link.material_id,
          field: link.anchor_position?.field || 'onsite',
          text: link.anchor_position?.text || '现场实证',
        },
        payload: link.payload || {},
      });
    }
    return { ...line, nodes, onsite_evidence_count: onsite.length };
  });
  return {
    ...evidenceChain,
    fee_lines: feeLines,
    evidence_links: [...(evidenceChain.evidence_links || []), ...links],
    onsite_evidence: links,
    layer4_label: '现场实证',
  };
}

module.exports = {
  STORE_PATH,
  loadStore,
  saveStore,
  addOnsiteEvidence,
  linksForRecord,
  mergeOnsiteLinks,
};
