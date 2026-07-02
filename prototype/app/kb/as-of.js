'use strict';

function parseDateOnly(s) {
  if (!s) return null;
  const raw = String(s).trim().split('~').pop().trim().split(/[ T]/)[0];
  const dt = new Date(raw + 'T00:00:00');
  return isNaN(dt.getTime()) ? null : dt;
}

function parseAdmitDate(record) {
  return parseDateOnly(record?.front_page?.admit_time);
}

function isEffective(entry, asOf) {
  if (!asOf) return true;
  const from = parseDateOnly(entry?.effective_from);
  const to = parseDateOnly(entry?.effective_to);
  if (from && asOf < from) return false;
  if (to && asOf > to) return false;
  return true;
}

function filterPolicyMaps(maps, asOf) {
  if (!asOf || !maps) return maps;
  const policyTexts = {};
  const policyVerified = {};
  const policyPending = {};
  for (const [refId, text] of Object.entries(maps.policyTexts || {})) {
    const meta = maps.policyMeta?.[refId];
    if (meta && !isEffective(meta, asOf)) continue;
    policyTexts[refId] = text;
    policyVerified[refId] = maps.policyVerified?.[refId];
    if (maps.policyPending?.[refId]) policyPending[refId] = true;
  }
  return { ...maps, policyTexts, policyVerified, policyPending };
}

function buildPolicyMetaFromKb(kb1, kb2) {
  const policyMeta = {};
  for (const e of kb1?.entries || []) policyMeta[e.ref_id] = e;
  for (const e of kb2?.entries || []) policyMeta[e.kb2_id] = { ...e, ref_id: e.kb2_id };
  return policyMeta;
}

module.exports = {
  parseAdmitDate,
  parseDateOnly,
  isEffective,
  filterPolicyMaps,
  buildPolicyMetaFromKb,
};
