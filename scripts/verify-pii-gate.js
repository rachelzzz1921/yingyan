#!/usr/bin/env node
'use strict';

/**
 * 脱敏层契约校验：用户导入案卷在送 LLM 前必须抹掉明文 PII。
 * 用法：node scripts/verify-pii-gate.js
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { piiRedact, redactOcrPlainText, prepareForLlm } = require(path.join(ROOT, 'prototype/app/engine/pii-redact'));
const { sanitizeLlmPrompt } = require(path.join(ROOT, 'prototype/app/engine/llm-privacy-gate'));

const SAMPLE = {
  case_meta: { case_id: 'DEMO-001', pii_token: 'T-ABC' },
  front_page: {
    patient_name: '张三丰',
    admission_no: 'ZY20260315001',
    sex: '男',
    age: 68,
    phone: '13800138000',
    attending_physician: '李医生',
    principal_diagnosis: { name: '非小细胞肺癌', icd10: 'C34.9' },
  },
  progress_notes: [{ text: '患者张三丰今日诉咳嗽，联系电话13800138000。' }],
  fee_list: { items: [{ line_no: 1, item_name: '奥希替尼', amount: 5000 }] },
};

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const red = piiRedact(SAMPLE);
assert(!JSON.stringify(red).includes('张三丰'), 'patient name leaked in piiRedact');
assert(!JSON.stringify(red).includes('13800138000'), 'phone leaked in piiRedact');
assert(!JSON.stringify(red).includes('ZY20260315001'), 'admission_no leaked in piiRedact');
assert(!JSON.stringify(red).includes('李医生'), 'physician name leaked in piiRedact');
assert(red.front_page.patient_name === '[T-ABC]', 'patient_name placeholder wrong');

const ocr = redactOcrPlainText('姓名：王五 手机13912345678 身份证110101199001011234');
assert(!ocr.includes('13912345678'), 'phone in OCR text not redacted');
assert(!ocr.includes('110101199001011234'), 'id card in OCR not redacted');

const prep = prepareForLlm(SAMPLE);
assert(prep.meta.pii_redaction === true, 'prepareForLlm meta missing');

const gated = sanitizeLlmPrompt({
  system: '你是助手',
  user: '联系13912345678',
  vision: true,
});
assert(gated.system.includes('隐私脱敏'), 'vision gate missing PII append');
assert(!gated.user.includes('13912345678'), 'sanitizeLlmPrompt missed phone in user');

console.log('OK verify-pii-gate: record/OCR/prompt 脱敏契约通过');
