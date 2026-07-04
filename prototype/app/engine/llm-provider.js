/**
 * 鹰眼 · LLM 提供方适配层（统一接口，解耦 SiliconFlow / MiniMax / Anthropic）
 * ------------------------------------------------------------
 * 真·语义分析(文本) 与 多模态解析(视觉) 分别独立选择提供方：
 *   · 文本/推理 textProvider：SiliconFlow(快) > MiniMax > Anthropic
 *   · 视觉/解析 visionProvider：MiniMax-VL(已实测可用) > SiliconFlow-VL(若配) > Anthropic
 *   两者解耦 —— 稽核走 SiliconFlow 提速，扫描件/PDF 视觉解析仍可走 MiniMax-VL。
 *
 * callLLM(text) / callVision(text+images) → 纯文本结果。所有请求带超时（防长挂起）。
 * 密钥从 process.env 读（server 启动时由 .env 注入；.env 不进 git）。
 * 提供方可用 YINGYAN_LLM_PROVIDER / YINGYAN_VISION_PROVIDER 显式锁定。
 */
'use strict';

const { sanitizeLlmPrompt } = require('./llm-privacy-gate');

// ---- 端点与模型配置 ----
const MINIMAX_BASE = process.env.MINIMAX_BASE || 'https://api.minimaxi.com/v1/text/chatcompletion_v2';
const MINIMAX_MODEL = process.env.YINGYAN_LLM_MODEL || 'MiniMax-Text-01';
const MINIMAX_VL_MODEL = process.env.YINGYAN_VL_MODEL || 'MiniMax-VL-01';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = process.env.YINGYAN_MODEL || 'claude-opus-4-8';
const SF_BASE = process.env.SILICONFLOW_BASE || process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1/chat/completions';
const SF_MODEL = process.env.SILICONFLOW_CHAT_MODEL || 'Qwen/Qwen2.5-72B-Instruct';
const SF_VL_MODEL = process.env.SILICONFLOW_VL_MODEL || ''; // 多数 VL 模型对普通 key 被禁用 → 默认不走 SF 视觉

const DEFAULT_TIMEOUT = Number(process.env.YINGYAN_LLM_TIMEOUT_MS || 90000);

function truthy(v) { return /^(1|true|yes|on)$/i.test(String(v || '')); }
function sfKey() { return process.env.SILICONFLOW_CHAT_KEY || process.env.SILICONFLOW_API_KEY || ''; }
function sfFallback() {
  const key = process.env.SILICONFLOW_FALLBACK_API_KEY || process.env.SILICONFLOW_FALLBACK_CHAT_KEY || '';
  if (!key) return null;
  return {
    base: process.env.SILICONFLOW_FALLBACK_BASE || 'https://api.siliconflow.cn/v1/chat/completions',
    key,
    model: process.env.SILICONFLOW_FALLBACK_CHAT_MODEL || 'Qwen/Qwen2.5-72B-Instruct',
    label: 'SiliconFlow(公网兜底)',
  };
}
function sfPrimaryLabel() {
  return /10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\./.test(SF_BASE) ? 'SiliconFlow(内网)' : 'SiliconFlow';
}
function hasMinimax() { return !!process.env.MINIMAX_API_KEY; }
function hasAnthropic() { return !!process.env.ANTHROPIC_API_KEY; }

// 文本/推理提供方
function provider() {
  const forced = (process.env.YINGYAN_LLM_PROVIDER || '').toLowerCase();
  if (forced) {
    // 显式锁定：只用指定提供方；缺 key 则返回 null（callLLM 抛 needsKey），绝不静默回退到别的模型/服务
    if (forced === 'siliconflow') return sfKey() ? 'siliconflow' : null;
    if (forced === 'minimax') return hasMinimax() ? 'minimax' : null;
    if (forced === 'anthropic') return hasAnthropic() ? 'anthropic' : null;
    if (forced === 'none' || forced === 'disabled') return null; // 显式禁用 LLM
    // 未知值：忽略，落到下方自动选择
  }
  if (sfKey()) return 'siliconflow';
  if (hasMinimax()) return 'minimax';
  if (hasAnthropic()) return 'anthropic';
  return null;
}
// 视觉提供方（与文本解耦）
function visionProvider() {
  const forced = (process.env.YINGYAN_VISION_PROVIDER || '').toLowerCase();
  if (forced === 'minimax' && hasMinimax()) return 'minimax';
  if (forced === 'siliconflow' && sfKey() && SF_VL_MODEL) return 'siliconflow';
  if (forced === 'anthropic' && hasAnthropic()) return 'anthropic';
  if (hasMinimax()) return 'minimax';
  if (sfKey() && SF_VL_MODEL) return 'siliconflow';
  if (hasAnthropic()) return 'anthropic';
  return null;
}

function isReady() { return !!provider(); }
function visionReady() { return !!visionProvider(); }
function providerName() {
  const p = provider();
  if (p === 'siliconflow') return `SiliconFlow(${SF_MODEL})`;
  if (p === 'minimax') return `MiniMax(${MINIMAX_MODEL})`;
  if (p === 'anthropic') return `Anthropic(${ANTHROPIC_MODEL})`;
  return '未配置';
}
function visionModelName() {
  const p = visionProvider();
  if (p === 'minimax') return `MiniMax-VL(${MINIMAX_VL_MODEL})`;
  if (p === 'siliconflow') return `SiliconFlow-VL(${SF_VL_MODEL})`;
  if (p === 'anthropic') return `Anthropic(${ANTHROPIC_MODEL})`;
  return '未配置';
}

// 统一带超时的 fetch（防止某一路 LLM 无限挂起拖死整次稽核）
async function fetchWithTimeout(url, opts, ms = DEFAULT_TIMEOUT) {
  if (typeof fetch !== 'function') throw new Error('需 Node18+ (全局 fetch)');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctl.signal });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`LLM 请求超时（>${Math.round(ms / 1000)}s）`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// 空内容 = 失败（限流/配额/过载/畸形响应）。显式抛错，避免空串被当成"成功"静默吞掉
function nonEmpty(content, label) {
  if (!content || !String(content).trim()) throw new Error(`${label} 返回空内容（可能限流/配额耗尽/模型过载/响应结构异常）`);
  return content;
}

// 瞬时错误判定：限流/过载/超时/空响应/网络抖动 → 可重试；4xx(非429)/缺key → 不重试
function isRetryable(err) {
  if (err && err.needsKey) return false;
  const m = String((err && err.message) || '');
  if (/\b(429|500|502|503|504)\b/.test(m)) return true;
  if (/超时|限流|过载|配额|空内容|rate.?limit|overload|timeout|ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|socket hang/i.test(m)) return true;
  return false;
}

// 带指数退避的重试（默认 2 次）：让一次瞬时抖动不至于丢掉整阶段真分析
async function withRetry(label, fn, retries = Number(process.env.YINGYAN_LLM_RETRIES ?? 2)) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { return await fn(attempt); }
    catch (e) {
      lastErr = e;
      if (attempt === retries || !isRetryable(e)) throw e;
      const backoff = 600 * Math.pow(2, attempt) + attempt * 250; // 600ms → 1450ms → …
      if (process.env.YINGYAN_LLM_TIMING !== '0') console.log(`  [llm-provider] ${label} 第${attempt + 1}次失败(${String(e.message).slice(0, 60)})，${backoff}ms 后重试`);
      await new Promise(r => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}

async function readOpenAIStream(r, label) {
  const text = await r.text();
  let content = '';
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const chunk = JSON.parse(payload);
      const choice = chunk.choices?.[0] || {};
      content += choice.delta?.content || choice.message?.content || choice.text || '';
    } catch {
      // Ignore keepalive/non-JSON SSE frames; empty final content is checked below.
    }
  }
  return nonEmpty(content, label);
}

// OpenAI 兼容 provider（SiliconFlow/MiniMax）的一次调用
async function callOpenAICompatible({ base, key, model, system, user, maxTokens, temperature, timeoutMs, jsonMode, label, minimax, stream }) {
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: user });
  const body = { model, messages, max_tokens: maxTokens, temperature, stream: !!stream };
  if (jsonMode) body.response_format = { type: 'json_object' }; // 结构化输出：强制合法 JSON，减少解析兜底
  const r = await fetchWithTimeout(base, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify(body),
  }, timeoutMs);
  if (!r.ok) throw new Error(`${label} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  if (body.stream) return readOpenAIStream(r, label);
  const data = await r.json();
  if (minimax && data.base_resp && data.base_resp.status_code) throw new Error(`${label}: ${data.base_resp.status_msg}`);
  return nonEmpty(data.choices?.[0]?.message?.content, label);
}

// jsonMode=true → 请求方保证 prompt 里出现 "JSON" 字样且请求的是 JSON 对象（response_format:json_object 要求对象根）
async function callLLM({ system, user, maxTokens = 4000, temperature = 0.2, timeoutMs = DEFAULT_TIMEOUT, jsonMode = false }) {
  ({ system, user } = sanitizeLlmPrompt({ system, user, vision: false }));
  const p = provider();
  if (!p) { const e = new Error('真·语义分析需配置 SILICONFLOW_API_KEY / MINIMAX_API_KEY / ANTHROPIC_API_KEY'); e.needsKey = true; throw e; }

  if (p === 'siliconflow') {
    const runSf = (cfg, label) => withRetry(label, () => callOpenAICompatible({
      base: cfg.base, key: cfg.key, model: cfg.model, system, user, maxTokens, temperature, timeoutMs, jsonMode, label,
      stream: truthy(process.env.SILICONFLOW_STREAM),
    }));
    const primary = { base: SF_BASE, key: sfKey(), model: SF_MODEL };
    try {
      return await runSf(primary, sfPrimaryLabel());
    } catch (primaryErr) {
      const fb = sfFallback();
      if (!fb || process.env.YINGYAN_LLM_FALLBACK === '0') throw primaryErr;
      if (process.env.YINGYAN_LLM_TIMING !== '0') {
        console.warn(`  [llm-provider] ${sfPrimaryLabel()} 失败(${String(primaryErr.message).slice(0, 72)}) → ${fb.label}`);
      }
      return await runSf(fb, fb.label);
    }
  }
  if (p === 'minimax') {
    return withRetry('MiniMax', () => callOpenAICompatible({
      base: MINIMAX_BASE, key: process.env.MINIMAX_API_KEY, model: MINIMAX_MODEL, system, user, maxTokens, temperature, timeoutMs, jsonMode, label: 'MiniMax', minimax: true,
    }));
  }
  // anthropic（无 response_format；靠 prompt 约束 JSON）
  return withRetry('Anthropic', async () => {
    const r = await fetchWithTimeout(ANTHROPIC_URL, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
    }, timeoutMs);
    if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 160)}`);
    const data = await r.json();
    return nonEmpty((data.content || []).map(c => c.text || '').join(''), 'Anthropic');
  });
}

// 多模态：text + images(base64)。视觉提供方独立选择（默认 MiniMax-VL）
async function callVision({ system, user, images = [], mime = 'image/png', maxTokens = 6000, timeoutMs = DEFAULT_TIMEOUT }) {
  ({ system, user } = sanitizeLlmPrompt({ system, user, vision: true }));
  const p = visionProvider();
  if (!p) { const e = new Error('多模态解析需配置 MINIMAX_API_KEY（视觉）'); e.needsKey = true; throw e; }

  if (p === 'minimax' || p === 'siliconflow') {
    // 两者均走 OpenAI 兼容 content 数组
    const content = [{ type: 'text', text: user }];
    for (const b64 of images) content.push({ type: 'image_url', image_url: { url: b64.startsWith('data:') ? b64 : `data:${mime};base64,${b64}` } });
    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content });
    const base = p === 'minimax' ? MINIMAX_BASE : SF_BASE;
    const key = p === 'minimax' ? process.env.MINIMAX_API_KEY : sfKey();
    const model = p === 'minimax' ? MINIMAX_VL_MODEL : SF_VL_MODEL;
    const r = await fetchWithTimeout(base, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.1 }),
    }, timeoutMs);
    if (!r.ok) throw new Error(`视觉模型 HTTP ${r.status}: ${(await r.text()).slice(0, 160)}`);
    const data = await r.json();
    if (data.base_resp && data.base_resp.status_code) throw new Error('视觉模型: ' + data.base_resp.status_msg);
    return nonEmpty(data.choices?.[0]?.message?.content, '视觉模型');
  }

  // anthropic vision
  const content = [];
  for (const b64 of images) content.push({ type: 'image', source: { type: 'base64', media_type: mime, data: b64 } });
  content.push({ type: 'text', text: user });
  const r = await fetchWithTimeout(ANTHROPIC_URL, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] }),
  }, timeoutMs);
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const data = await r.json();
  return nonEmpty((data.content || []).map(c => c.text || '').join(''), 'Anthropic 视觉');
}

module.exports = { callLLM, callVision, isReady, visionReady, providerName, visionModelName, provider, visionProvider };
