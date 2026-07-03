'use strict';

/**
 * LLM 隐私门禁 — 所有外部模型调用的统一脱敏入口。
 * llm-provider.callLLM / callVision 在发出请求前自动经过此 gate。
 */

const {
  redactString,
  prepareForLlm,
  PII_LLM_SYSTEM_APPEND,
  PII_VISION_SYSTEM_APPEND,
} = require('./pii-redact');

/**
 * 清洗 prompt 字符串中的证件/电话/邮箱等模式。
 * @param {{ system?: string, user?: string, vision?: boolean, record?: object }} opts
 */
function sanitizeLlmPrompt(opts = {}) {
  const vision = !!opts.vision;
  let system = redactString(opts.system || '');
  let user = redactString(opts.user || '');

  if (vision) {
    system = system ? `${system}\n\n${PII_VISION_SYSTEM_APPEND}` : PII_VISION_SYSTEM_APPEND;
  } else if (system && !system.includes('隐私')) {
    system = `${system}\n\n${PII_LLM_SYSTEM_APPEND}`;
  }

  const meta = { pii_gated: true, vision };
  if (opts.record) {
    const prep = prepareForLlm(opts.record);
    meta.pii_token = prep.meta.pii_token;
    meta.record_redacted = true;
  }

  return { system, user, meta };
}

/** 案卷送多阶段 Agent 前：返回脱敏副本（原始 record 不动） */
function gateRecordForLlm(record) {
  return prepareForLlm(record);
}

module.exports = {
  sanitizeLlmPrompt,
  gateRecordForLlm,
  prepareForLlm,
};
