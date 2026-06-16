'use strict';

const ID_CARD = /\d{17}[\dXx]|\d{15}/g;
const PHONE = /1[3-9]\d{9}/g;

function redactString(s, token) {
  if (typeof s !== 'string' || !s) return s;
  return s
    .replace(ID_CARD, '[证件已脱敏]')
    .replace(PHONE, '[电话已脱敏]');
}

function redactValue(v, token, key) {
  if (v == null) return v;
  if (typeof v === 'string') {
    if (/patient_name|physician|doctor|author|chief/i.test(key || '')) {
      return `[${token || '患者'}]`;
    }
    if (/admission_no|admit_no|住院号/i.test(key || '')) return '[住院号已脱敏]';
    return redactString(v, token);
  }
  if (Array.isArray(v)) return v.map((item, i) => redactValue(item, token, key));
  if (typeof v === 'object') return redactObject(v, token);
  return v;
}

function redactObject(obj, token) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'case_meta') {
      out[k] = {
        ...v,
        internal_id: v.internal_id || v.case_id,
        pii_token: v.pii_token,
        case_id: v.internal_id || v.case_id,
        case_title: v.case_title ? redactString(v.case_title, token) : v.case_title,
      };
      continue;
    }
    if (k === 'front_page' && v && typeof v === 'object') {
      out[k] = {
        ...v,
        patient_name: `[${token || '患者'}]`,
        admission_no: '[住院号已脱敏]',
        attending_physician: v.attending_physician ? '[医师已脱敏]' : v.attending_physician,
        chief_physician: v.chief_physician ? '[医师已脱敏]' : v.chief_physician,
        hospital: v.hospital ? redactString(String(v.hospital), token) : v.hospital,
      };
      continue;
    }
    out[k] = redactValue(v, token, k);
  }
  return out;
}

function piiRedact(record) {
  const token = record?.case_meta?.pii_token || record?.case_meta?.internal_id || 'P-REDACT';
  return redactObject(JSON.parse(JSON.stringify(record)), token);
}

module.exports = { piiRedact, redactString };
