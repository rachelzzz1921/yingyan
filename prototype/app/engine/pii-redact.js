'use strict';

/**
 * PII 脱敏层 — 用户导入案卷在送出外部 LLM 前必须经此模块。
 * 本地 deterministic 引擎仍用原始 record；仅 LLM/视觉结构化路径使用脱敏副本。
 */

const ID_CARD = /\b\d{6}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b|\b\d{15}\b|\b\d{17}[\dXx]\b/g;
const PHONE = /\b1[3-9]\d{9}\b/g;
const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const BANK_CARD = /\b\d{16,19}\b/g;

/** 视觉/结构化抽取 system 附加段：要求模型输出占位符而非明文 PII */
const PII_VISION_SYSTEM_APPEND = [
  '【隐私脱敏 · 强制】',
  '输出 JSON 中不得包含患者真实姓名、完整身份证号、手机号、详细住址；',
  '姓名用 [患者] 或给定 pii_token；住院号用 [住院号已脱敏]；医师姓名用 [医师已脱敏]。',
].join('\n');

const PII_LLM_SYSTEM_APPEND = [
  '【隐私】你收到的材料包已完成脱敏；不得尝试还原或猜测患者真实身份。',
].join('\n');

const NAME_LIKE_KEYS = /^(patient_name|physician|doctor|author|chief|attending|surgeon|operator|nurse|pharmacist|creator|signer|经办|医师|医生|护士)$/i;
const ID_LIKE_KEYS = /^(admission_no|admit_no|inpatient_no|住院号|medical_record_no|case_no|patient_id|id_card|identity|cert_no)$/i;
const PHONE_LIKE_KEYS = /^(phone|mobile|tel|telephone|contact|联系电话|手机)$/i;
const ADDRESS_LIKE_KEYS = /^(address|addr|home_address|户籍|住址|现住址|联系地址)$/i;
const TEXT_BLOB_KEYS = new Set([
  'text', 'chief_complaint', 'present_illness', 'past_history', 'treatment_plan',
  'hospital_course', 'discharge_note', 'note', 'content', 'reason', 'judgment',
  'present_illness', 'physical_exam', 'disposal', 'summary', '_intake_raw',
]);

function redactString(s, _token) {
  if (typeof s !== 'string' || !s) return s;
  return s
    .replace(ID_CARD, '[证件已脱敏]')
    .replace(PHONE, '[电话已脱敏]')
    .replace(EMAIL, '[邮箱已脱敏]')
    .replace(BANK_CARD, '[卡号已脱敏]');
}

function collectKnownPII(record) {
  const names = new Set();
  const fp = record?.front_page || {};
  for (const n of [fp.patient_name, fp.attending_physician, fp.chief_physician, fp.attending, fp.doctor]) {
    if (n && String(n).length >= 2) names.add(String(n).trim());
  }
  for (const n of record?.case_meta?.known_names || []) {
    if (n && String(n).length >= 2) names.add(String(n).trim());
  }
  return [...names];
}

function redactFreeText(s, knownNames, token) {
  let out = redactString(s, token);
  for (const name of knownNames) {
    if (!name || name.length < 2) continue;
    out = out.split(name).join(`[${token || '患者'}]`);
  }
  return out;
}

function redactScalarKey(k, v, token, knownNames) {
  if (v == null) return v;
  if (typeof v === 'string') {
    if (NAME_LIKE_KEYS.test(k)) return k.match(/patient/i) ? `[${token || '患者'}]` : '[医师已脱敏]';
    if (ID_LIKE_KEYS.test(k)) return '[住院号已脱敏]';
    if (PHONE_LIKE_KEYS.test(k)) return '[电话已脱敏]';
    if (ADDRESS_LIKE_KEYS.test(k)) return '[地址已脱敏]';
    if (TEXT_BLOB_KEYS.has(k)) return redactFreeText(v, knownNames, token);
    return redactString(v, token);
  }
  if (Array.isArray(v)) return v.map((item, i) => redactValue(item, token, knownNames, k, i));
  if (typeof v === 'object') return redactObject(v, token, knownNames);
  return v;
}

function redactValue(v, token, knownNames, key) {
  return redactScalarKey(key || '', v, token, knownNames);
}

function redactObject(obj, token, knownNames) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'case_meta' && v && typeof v === 'object') {
      out[k] = {
        ...v,
        internal_id: v.internal_id || v.case_id,
        pii_token: v.pii_token || token,
        case_id: v.internal_id || v.case_id,
        case_title: v.case_title ? redactFreeText(String(v.case_title), knownNames, token) : v.case_title,
      };
      continue;
    }
    if (k === 'front_page' && v && typeof v === 'object') {
      out[k] = {
        ...v,
        patient_name: `[${token || '患者'}]`,
        admission_no: '[住院号已脱敏]',
        inpatient_no: v.inpatient_no ? '[住院号已脱敏]' : v.inpatient_no,
        attending_physician: v.attending_physician ? '[医师已脱敏]' : v.attending_physician,
        chief_physician: v.chief_physician ? '[医师已脱敏]' : v.chief_physician,
        attending: v.attending ? '[医师已脱敏]' : v.attending,
        doctor: v.doctor ? '[医师已脱敏]' : v.doctor,
        phone: v.phone ? '[电话已脱敏]' : v.phone,
        mobile: v.mobile ? '[电话已脱敏]' : v.mobile,
        address: v.address ? '[地址已脱敏]' : v.address,
        hospital: v.hospital ? redactString(String(v.hospital), token) : v.hospital,
      };
      continue;
    }
    out[k] = redactScalarKey(k, v, token, knownNames);
  }
  return out;
}

/** 案卷 deep copy 脱敏（送 LLM 的 record 主体） */
function piiRedact(record) {
  if (!record || typeof record !== 'object') return record;
  const token = record?.case_meta?.pii_token || record?.case_meta?.internal_id || 'P-REDACT';
  const knownNames = collectKnownPII(record);
  return redactObject(JSON.parse(JSON.stringify(record)), token, knownNames);
}

/** OCR/纯文本送 LLM 结构化前的脱敏 */
function redactOcrPlainText(text, opts = {}) {
  const known = opts.knownNames || [];
  return redactFreeText(String(text || ''), known, opts.token || 'P-REDACT');
}

/** 准备 LLM 输入：脱敏 record + 可写入 report_meta 的 manifest */
function prepareForLlm(record) {
  const token = record?.case_meta?.pii_token || record?.case_meta?.internal_id || 'P-REDACT';
  return {
    record: piiRedact(record),
    meta: {
      pii_redaction: true,
      pii_token: token,
      redacted_at: new Date().toISOString(),
      layers: ['front_page', 'case_meta', 'free_text', 'id_phone_email'],
    },
  };
}

module.exports = {
  piiRedact,
  redactString,
  redactOcrPlainText,
  redactFreeText,
  prepareForLlm,
  collectKnownPII,
  PII_VISION_SYSTEM_APPEND,
  PII_LLM_SYSTEM_APPEND,
};
