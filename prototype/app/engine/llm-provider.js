/**
 * 鹰眼 · LLM 提供方适配层（统一接口，解耦 MiniMax / Anthropic）
 * ------------------------------------------------------------
 * 真·语义分析与多模态解析都经此层。优先 MiniMax（原生多模态，已实测可用）。
 * callLLM(text) / callVision(text+images) → 纯文本结果。
 * 密钥从 process.env 读（server 启动时由 .env 注入；.env 不进 git）。
 */
'use strict';

const MINIMAX_BASE = process.env.MINIMAX_BASE || 'https://api.minimaxi.com/v1/text/chatcompletion_v2';
const MINIMAX_MODEL = process.env.YINGYAN_LLM_MODEL || 'MiniMax-Text-01';
const MINIMAX_VL_MODEL = process.env.YINGYAN_VL_MODEL || 'MiniMax-VL-01';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = process.env.YINGYAN_MODEL || 'claude-opus-4-8';

function provider() {
  if (process.env.MINIMAX_API_KEY) return 'minimax';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return null;
}
function isReady() { return !!provider(); }
function providerName() {
  const p = provider();
  return p === 'minimax' ? `MiniMax(${MINIMAX_MODEL})` : p === 'anthropic' ? `Anthropic(${ANTHROPIC_MODEL})` : '未配置';
}
function visionModelName() {
  const p = provider();
  return p === 'minimax' ? `MiniMax-VL(${MINIMAX_VL_MODEL})` : p === 'anthropic' ? `Anthropic(${ANTHROPIC_MODEL})` : '未配置';
}

async function callLLM({ system, user, maxTokens = 4000 }) {
  const p = provider();
  if (!p) { const e = new Error('真·语义分析需配置 MINIMAX_API_KEY 或 ANTHROPIC_API_KEY'); e.needsKey = true; throw e; }
  if (typeof fetch !== 'function') throw new Error('需 Node18+ (全局 fetch)');
  if (p === 'minimax') {
    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: user });
    const r = await fetch(MINIMAX_BASE, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.MINIMAX_API_KEY },
      body: JSON.stringify({ model: MINIMAX_MODEL, messages, max_tokens: maxTokens, temperature: 0.2 }),
    });
    const data = await r.json();
    if (data.base_resp && data.base_resp.status_code) throw new Error('MiniMax: ' + data.base_resp.status_msg);
    return (data.choices?.[0]?.message?.content) || '';
  }
  // anthropic
  const r = await fetch(ANTHROPIC_URL, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const data = await r.json();
  return (data.content || []).map(c => c.text || '').join('');
}

// 多模态：text + images(base64)。MiniMax-VL 走 OpenAI 兼容 content 数组
async function callVision({ system, user, images = [], mime = 'image/png', maxTokens = 6000 }) {
  const p = provider();
  if (!p) { const e = new Error('多模态解析需配置 MINIMAX_API_KEY'); e.needsKey = true; throw e; }
  if (p === 'minimax') {
    const content = [{ type: 'text', text: user }];
    for (const b64 of images) content.push({ type: 'image_url', image_url: { url: b64.startsWith('data:') ? b64 : `data:${mime};base64,${b64}` } });
    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content });
    const r = await fetch(MINIMAX_BASE, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.MINIMAX_API_KEY },
      body: JSON.stringify({ model: MINIMAX_VL_MODEL, messages, max_tokens: maxTokens, temperature: 0.1 }),
    });
    const data = await r.json();
    if (data.base_resp && data.base_resp.status_code) throw new Error('MiniMax-VL: ' + data.base_resp.status_msg);
    return (data.choices?.[0]?.message?.content) || '';
  }
  // anthropic vision
  const content = [];
  for (const b64 of images) content.push({ type: 'image', source: { type: 'base64', media_type: mime, data: b64 } });
  content.push({ type: 'text', text: user });
  const r = await fetch(ANTHROPIC_URL, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const data = await r.json();
  return (data.content || []).map(c => c.text || '').join('');
}

module.exports = { callLLM, callVision, isReady, providerName, visionModelName, provider };
