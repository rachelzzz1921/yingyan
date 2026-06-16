'use strict';

const { ragConfig, isConfigured } = require('./config');

const BATCH = 10;

function embeddingConfig() {
  const cfg = ragConfig();
  return {
    provider: process.env.RAG_EMBEDDING_PROVIDER || 'dashscope',
    model: process.env.RAG_EMBEDDING_MODEL || 'text-embedding-v3',
    dimensions: Number(process.env.RAG_EMBEDDING_DIMENSIONS || 1024),
    dashscopeApiKey: process.env.DASHSCOPE_API_KEY,
    zhipuApiKey: process.env.ZHIPU_API_KEY,
    siliconflowApiKey: process.env.SILICONFLOW_API_KEY,
    siliconflowBaseUrl: process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1',
    instruction: process.env.RAG_EMBEDDING_INSTRUCTION || 'Represent this medical insurance audit knowledge for retrieval:',
  };
}

function canEmbed() {
  const c = embeddingConfig();
  if (c.provider === 'dashscope') return isConfigured(c.dashscopeApiKey);
  if (c.provider === 'zhipu') return isConfigured(c.zhipuApiKey);
  if (c.provider === 'siliconflow') return isConfigured(c.siliconflowApiKey);
  return false;
}

async function embedTexts(texts, opts = {}) {
  const c = { ...embeddingConfig(), ...opts };
  const cleaned = texts.map(t => String(t || '').slice(0, 6000));
  if (!cleaned.length) return [];
  if (c.provider === 'dashscope') return embedDashScope(cleaned, c);
  if (c.provider === 'zhipu') return embedZhipu(cleaned, c);
  if (c.provider === 'siliconflow') return embedSiliconFlow(cleaned, c);
  throw new Error(`Unknown RAG_EMBEDDING_PROVIDER: ${c.provider}`);
}

async function embedOne(text, opts = {}) {
  const [vec] = await embedTexts([text], opts);
  return vec || null;
}

async function embedDashScope(texts, { model, dashscopeApiKey, dimensions, instruction }) {
  if (!dashscopeApiKey) throw new Error('Missing DASHSCOPE_API_KEY');
  const results = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const input = instruction ? batch.map(t => `${instruction}\n${t}`) : batch;
    const res = await fetch('https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding', {
      method: 'POST',
      headers: { Authorization: `Bearer ${dashscopeApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: { texts: input }, parameters: { dimension: dimensions } }),
    });
    if (!res.ok) throw new Error(`DashScope embed ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const rows = data?.output?.embeddings;
    if (!Array.isArray(rows)) throw new Error('DashScope unexpected embed response');
    for (const item of rows.sort((a, b) => a.text_index - b.text_index)) results.push(item.embedding);
  }
  return results;
}

async function embedZhipu(texts, { model, zhipuApiKey }) {
  if (!zhipuApiKey) throw new Error('Missing ZHIPU_API_KEY');
  const results = [];
  for (const text of texts) {
    const res = await fetch('https://open.bigmodel.cn/api/paas/v4/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${zhipuApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model || 'embedding-3', input: text }),
    });
    if (!res.ok) throw new Error(`Zhipu embed ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    results.push(data?.data?.[0]?.embedding);
  }
  return results;
}

/** 硅基流动 — OpenAI 兼容 /v1/embeddings，新用户有大额免费额度 */
async function embedSiliconFlow(texts, { model, siliconflowApiKey, siliconflowBaseUrl, dimensions }) {
  if (!siliconflowApiKey) throw new Error('Missing SILICONFLOW_API_KEY');
  const results = [];
  const modelId = model || 'BAAI/bge-m3';
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const res = await fetch(`${siliconflowBaseUrl.replace(/\/$/, '')}/embeddings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${siliconflowApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelId, input: batch, encoding_format: 'float' }),
    });
    if (!res.ok) throw new Error(`SiliconFlow embed ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const rows = data?.data;
    if (!Array.isArray(rows)) throw new Error('SiliconFlow unexpected embed response');
    for (const item of rows.sort((a, b) => a.index - b.index)) {
      const vec = item.embedding;
      if (dimensions && vec?.length > dimensions) results.push(vec.slice(0, dimensions));
      else results.push(vec);
    }
  }
  return results;
}

module.exports = { embeddingConfig, canEmbed, embedTexts, embedOne };
