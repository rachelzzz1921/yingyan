// providers.js — 真实模型调用层(零模拟)。当前接 MiniMax(账号可调的真实模型,跨厂商)。
// 设计:带重试、超时、温度、用量统计;失败如实抛错或计入"调用失败",绝不返回假数据。
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---- 读取本地 .env(不进 git),只取需要的 key,绝不打印 key 本身 ----
// eval/.env 优先;缺的 key 从 prototype/app/.env 兜底(SiliconFlow key 在那边)
function loadEnv() {
  for (const envPath of [path.join(__dirname, '..', '.env'), path.join(__dirname, '..', '..', 'prototype', 'app', '.env')]) {
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
}
loadEnv();

const MINIMAX_KEY = process.env.MINIMAX_API_KEY || '';
const MINIMAX_URL = 'https://api.minimaxi.com/v1/text/chatcompletion_v2';
const SILICONFLOW_KEY = process.env.SILICONFLOW_CHAT_KEY || process.env.SILICONFLOW_API_KEY || '';
const SILICONFLOW_URL = (process.env.SILICONFLOW_BASE || 'https://api.siliconflow.cn/v1') + '/chat/completions';

// ---- 调用缓存:同 (model|temp|promptText)#rep 复用同一真实样本,既省钱又可复现 ----
const RAW_DIR = path.join(__dirname, '..', 'results', 'raw');
fs.mkdirSync(RAW_DIR, { recursive: true });
function cacheKey(model, temp, prompt, rep) {
  const h = crypto.createHash('sha256').update(`${model}|${temp}|${prompt}`).digest('hex').slice(0, 24);
  return `${h}#${rep}`;
}

let CALL_COUNT = 0;          // 真实计费调用数(不含缓存命中)
let CACHE_HITS = 0;
const MAX_CALLS = parseInt(process.env.MAX_CALLS || '2000', 10); // 预算护栏

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// 单次真实调用 MiniMax(OpenAI 兼容)。返回 {text, usage, ok, err}
async function rawMinimax(model, prompt, temperature, maxTokens) {
  if (!MINIMAX_KEY) throw new Error('MINIMAX_API_KEY 缺失,无法真实调用');
  const body = {
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens,
    temperature,
  };
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 120000);
  try {
    const resp = await fetch(MINIMAX_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${MINIMAX_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const j = await resp.json();
    const sc = j?.base_resp?.status_code;
    if (sc !== 0 && sc !== undefined) {
      return { ok: false, err: `minimax status ${sc}: ${j?.base_resp?.status_msg || ''}`, text: '', usage: null };
    }
    const text = j?.choices?.[0]?.message?.content ?? '';
    return { ok: true, text, usage: j?.usage || null, err: null };
  } catch (e) {
    return { ok: false, err: String(e?.message || e), text: '', usage: null };
  } finally {
    clearTimeout(to);
  }
}

// 单次真实调用 SiliconFlow(OpenAI 兼容;C2 千问迁移:内网到手后只换 base/key)。返回 {text, usage, ok, err}
async function rawSiliconFlow(model, prompt, temperature, maxTokens) {
  if (!SILICONFLOW_KEY) throw new Error('SILICONFLOW_CHAT_KEY/SILICONFLOW_API_KEY 缺失,无法真实调用');
  const body = {
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens,
    temperature,
  };
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 180000);
  try {
    const resp = await fetch(SILICONFLOW_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SILICONFLOW_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const j = await resp.json();
    if (!resp.ok || j?.error || j?.code) {
      return { ok: false, err: `siliconflow ${resp.status}: ${j?.error?.message || j?.message || ''}`.trim(), text: '', usage: null };
    }
    const text = j?.choices?.[0]?.message?.content ?? '';
    return { ok: true, text, usage: j?.usage || null, err: null };
  } catch (e) {
    return { ok: false, err: String(e?.message || e), text: '', usage: null };
  } finally {
    clearTimeout(to);
  }
}

// 模型名 → provider 路由:Qwen/deepseek 等走 SiliconFlow,其余走 MiniMax
function rawCall(model, prompt, temperature, maxTokens) {
  if (/\//.test(model) || /^qwen/i.test(model)) return rawSiliconFlow(model, prompt, temperature, maxTokens);
  return rawMinimax(model, prompt, temperature, maxTokens);
}

// 带缓存 + 重试的对外接口。
// opts: {model, prompt, temperature=0.2, maxTokens=8192, rep=0, retries=3, noCache=false}
async function callModel(opts) {
  const { model, prompt, temperature = 0.2, maxTokens = 8192, rep = 0, retries = 3, noCache = false } = opts;
  const key = cacheKey(model, temperature, prompt, rep);
  const cf = path.join(RAW_DIR, key.replace('#', '_') + '.json');
  if (!noCache && fs.existsSync(cf)) {
    const cached = JSON.parse(fs.readFileSync(cf, 'utf8'));
    // 只复用成功样本;失败(fetch failed 等瞬时错误)不复用 → 重跑时会真正重试,
    // 避免把一次网络抖动永久当成"JSON 不合规/模型失败"上报。
    if (cached.ok !== false) { CACHE_HITS++; return { ...cached, cached: true }; }
  }
  if (CALL_COUNT >= MAX_CALLS) {
    throw new Error(`预算护栏触发:已达 MAX_CALLS=${MAX_CALLS} 次真实调用,停止以出阶段报告。`);
  }
  let last = null;
  for (let i = 0; i < retries; i++) {
    CALL_COUNT++;
    const r = await rawCall(model, prompt, temperature, maxTokens);
    if (r.ok) {
      const out = { model, temperature, rep, text: r.text, usage: r.usage, ok: true, ts: Date.now() };
      try { fs.writeFileSync(cf, JSON.stringify(out)); } catch (_) {}
      return { ...out, cached: false };
    }
    last = r;
    // 限流/瞬时错误退避
    await sleep(1500 * (i + 1));
  }
  const out = { model, temperature, rep, text: '', usage: null, ok: false, err: last?.err || 'unknown', ts: Date.now() };
  // 失败也落盘,便于复盘;但不当成功结果用
  try { fs.writeFileSync(cf, JSON.stringify(out)); } catch (_) {}
  return { ...out, cached: false };
}

function stats() { return { CALL_COUNT, CACHE_HITS, MAX_CALLS }; }

// 模型选型(写进报告)。
// C2 千问迁移:EVAL_PROVIDER=siliconflow 时切 Qwen 家族(赛场内网千问的外网代理基线),
// 亦可用 EVAL_DEBATER_MODEL / EVAL_JUDGE_MODEL / EVAL_ALT_MODEL 逐个覆盖。
const QWEN_MODELS = {
  debater: process.env.EVAL_DEBATER_MODEL || 'Qwen/Qwen2.5-72B-Instruct', // 辩手/控辩三方/抽取/合议/治理(P1-P4,P6,P7)
  judge: process.env.EVAL_JUDGE_MODEL || 'Qwen/Qwen2.5-32B-Instruct',     // 裁判(P5)异源:同家族跨规模(诚实标注非跨厂商)
  alt: process.env.EVAL_ALT_MODEL || 'Qwen/Qwen2.5-32B-Instruct',
};
const MINIMAX_MODELS = {
  debater: 'MiniMax-Text-01',   // 辩手/控辩三方/抽取/合议/治理(P1-P4,P6,P7)
  judge: 'abab6.5s-chat',       // 裁判(P5)异源:同厂商跨代不同模型族(诚实标注非跨厂商)
  alt: 'abab6.5s-chat',         // 多模型对比的第二模型
};
const MODELS = (process.env.EVAL_PROVIDER === 'siliconflow') ? QWEN_MODELS : MINIMAX_MODELS;

module.exports = { callModel, stats, MODELS, MINIMAX_KEY: !!MINIMAX_KEY, SILICONFLOW_KEY: !!SILICONFLOW_KEY };
