'use strict';

/**
 * 通用结构化输出包装器(赛前迭代 Q7 定案)
 * ------------------------------------------------------------
 * 所有走 LLM 的环节 Agent 统一过它:
 *   ① schema 校验(轻量内置校验器,零依赖)
 *   ② 校验/解析失败 → 把报错喂回模型带错重试(≤retries 次)
 *   ③ 仍失败 → 抛 StructuredOutputError,由调用环节自行降级
 *      (分析失败→纯确定性结果;裁定失败→自动转人工;CoVe失败→存疑转线索)
 * 每次重试/降级都记入降级台账(JSONL),供运维面板(G3)展示——
 * 兜底内嵌进系统,界面无感,内部有痕。
 */

const fs = require('fs');
const path = require('path');
const { callLLM } = require('./llm-provider');

const RUNTIME_DIR = path.join(__dirname, '../../data/_runtime');
const DEGRADE_LOG = path.join(RUNTIME_DIR, 'degradation_log.jsonl');

/** 降级台账:stage=环节名, level=retry|degrade, 全程留痕不上 UI */
function logDegrade(stage, level, reason, extra = {}) {
  try {
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    fs.appendFileSync(DEGRADE_LOG, JSON.stringify({
      at: new Date().toISOString(), stage, level, reason: String(reason).slice(0, 300), ...extra,
    }) + '\n', 'utf8');
  } catch (_) { /* 台账写入失败不影响主链路 */ }
}

function readDegradeLog(limit = 200) {
  try {
    const lines = fs.readFileSync(DEGRADE_LOG, 'utf8').trim().split('\n');
    return lines.slice(-limit).map(l => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
  } catch (_) { return []; }
}

// ---------- 稳健 JSON 抽取 ----------
// 现实失败形状(Qwen72B 实测):模型先解说、把**输入数据回显**在第一个 ```json 围栏里,
// 真正答案在最后。所以不能"取第一个围栏块"——要收集全部候选,**从后往前**优先
// (答案跟在叙述后面),有 schema 时由 structuredCall 选第一个过校验的候选。

/** 从文本里扫出一个平衡的 JSON 值(自 startIdx 起);失败返回 null */
function scanBalanced(s, startIdx) {
  const open = s[startIdx], close = open === '[' ? ']' : '}';
  if (open !== '[' && open !== '{') return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = startIdx; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return s.slice(startIdx, i + 1); }
  }
  return null;
}

/** 收集全部可解析候选,按"越靠后越优先"排序返回(已 parse 的值数组) */
function extractJSONCandidates(text) {
  if (!text || !String(text).trim()) throw new Error('LLM未返回内容（空响应）');
  const s = String(text).trim();
  const rawCandidates = [];
  // ① 全部围栏块
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m;
  while ((m = fenceRe.exec(s))) rawCandidates.push({ text: m[1].trim(), pos: m.index });
  // ② 整体
  rawCandidates.push({ text: s, pos: -1 });
  // ③ 括号扫描:每个顶层 { / [ 起点的平衡值(限收 40 个防病态输入)
  for (let i = 0, g = 0; i < s.length && g < 40; i++) {
    if (s[i] === '{' || s[i] === '[') {
      const v = scanBalanced(s, i);
      if (v) { rawCandidates.push({ text: v, pos: i }); i += v.length - 1; g++; }
    }
  }
  // 去重 + parse,按位置倒序(答案在后)
  const seen = new Set();
  const parsed = [];
  for (const c of rawCandidates.sort((a, b) => b.pos - a.pos)) {
    const key = c.text.slice(0, 200);
    if (seen.has(key)) continue;
    seen.add(key);
    try { parsed.push(JSON.parse(c.text)); } catch (_) { /* 不可解析的候选跳过 */ }
  }
  if (!parsed.length) throw new Error('LLM未返回可解析JSON: ' + s.slice(0, 120));
  return parsed;
}

/** 兼容旧签名:返回最靠后的可解析 JSON 值 */
function extractJSON(text) {
  return extractJSONCandidates(text)[0];
}

// ---------- 轻量 schema 校验器(支持 type/required/properties/items/enum,够七环节用,零依赖) ----------
function validateSchema(value, schema, pathStr = '$') {
  const errors = [];
  if (!schema) return errors;
  const t = schema.type;
  const actual = Array.isArray(value) ? 'array' : (value === null ? 'null' : typeof value);
  if (t && t !== actual) {
    errors.push(`${pathStr}: 期望 ${t},实得 ${actual}`);
    return errors; // 类型都不对,子项不再往下报
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${pathStr}: 值「${String(value).slice(0, 40)}」不在枚举 [${schema.enum.join('|')}]`);
  }
  if (t === 'object') {
    for (const k of (schema.required || [])) {
      if (value[k] === undefined || value[k] === null) errors.push(`${pathStr}.${k}: 缺少必填字段`);
    }
    for (const [k, sub] of Object.entries(schema.properties || {})) {
      if (value[k] !== undefined && value[k] !== null) errors.push(...validateSchema(value[k], sub, `${pathStr}.${k}`));
    }
  }
  if (t === 'array' && schema.items) {
    value.forEach((v, i) => errors.push(...validateSchema(v, schema.items, `${pathStr}[${i}]`)));
  }
  return errors;
}

class StructuredOutputError extends Error {
  constructor(stage, attempts, lastError) {
    super(`[${stage}] 结构化输出在 ${attempts} 次尝试后仍不合法: ${lastError}`);
    this.name = 'StructuredOutputError';
    this.stage = stage;
    this.attempts = attempts;
    this.lastError = String(lastError);
  }
}

/**
 * 结构化调用主入口。
 * @param {object} opts
 * @param {string} opts.stage    环节名(数据比对/违规筛查/明细审核/调查核实/裁定…),入降级台账
 * @param {string} opts.system   system prompt
 * @param {string} opts.user     user prompt
 * @param {object} [opts.schema] 轻量 schema(type/required/properties/items/enum)
 * @param {function} [opts.normalize] 校验前归一化钩子(如顶层数组→{findings:[…]})
 * @param {number} [opts.retries=2] schema/解析失败的带报错重试次数
 * @param {number} [opts.maxTokens]
 * @param {boolean} [opts.jsonMode=true]
 * @returns 解析并通过校验的 JS 值;耗尽重试则抛 StructuredOutputError(调用方按环节降级)
 */
async function structuredCall(opts) {
  const { stage = 'llm', system, user, schema, normalize, retries = 2, maxTokens = 4000, jsonMode = true, timeoutMs } = opts;
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const feedback = attempt === 0 ? '' : [
      '',
      '## 上次输出不合法,请修正后重新输出',
      `报错: ${String(lastErr).slice(0, 400)}`,
      '要求: 只输出一个合法 JSON 值,不要任何解释文字/Markdown 围栏,严格满足上文要求的字段结构。',
    ].join('\n');
    let raw;
    try {
      raw = await callLLM({ system, user: user + feedback, maxTokens, jsonMode, timeoutMs });
    } catch (e) {
      // 网络/限速层重试由 llm-provider.withRetry 负责;走到这说明 provider 级已耗尽 → 不再本层空转
      logDegrade(stage, 'degrade', `provider失败: ${e.message}`, { attempt });
      throw new StructuredOutputError(stage, attempt + 1, e.message);
    }
    try {
      // 候选从后往前试(答案在叙述后面);有 schema 时取第一个过校验的候选——
      // 模型"解说+回显输入+末尾答案"的输出形状被这里吸收,不浪费一次重试
      const candidates = extractJSONCandidates(raw);
      let lastErrs = null;
      for (const cand of candidates) {
        let val = cand;
        try { if (normalize) val = normalize(cand); } catch (_) { continue; }
        const errs = schema ? validateSchema(val, schema) : [];
        if (!errs.length) {
          if (attempt > 0) logDegrade(stage, 'retry', `第${attempt}次带错重试后成功`, { attempt });
          return val;
        }
        lastErrs = errs;
      }
      throw new Error('schema校验失败(全部' + candidates.length + '个JSON候选): ' + (lastErrs || []).slice(0, 5).join('; '));
    } catch (e) {
      lastErr = e.message;
      if (attempt < retries) logDegrade(stage, 'retry', e.message, { attempt: attempt + 1 });
    }
  }
  logDegrade(stage, 'degrade', lastErr, { attempts: retries + 1 });
  throw new StructuredOutputError(stage, retries + 1, lastErr);
}

module.exports = { structuredCall, StructuredOutputError, validateSchema, extractJSON, extractJSONCandidates, logDegrade, readDegradeLog, DEGRADE_LOG };
