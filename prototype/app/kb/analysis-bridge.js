'use strict';

const { semanticSearch } = require('./retrieval');

/** 从案卷 + 规则触发词构造 RAG 查询 */
function buildQueryFromCase(record, rules = []) {
  const parts = [];
  const meta = record?.case_meta || {};
  if (meta.primary_diagnosis) parts.push(meta.primary_diagnosis);
  if (meta.case_title) parts.push(meta.case_title);
  for (const d of (record?.diagnoses || []).slice(0, 5)) {
    if (d.name || d.text) parts.push(d.name || d.text);
  }
  for (const f of (record?.fee_list?.items || []).slice(0, 12)) {
    if (f.item_name) parts.push(f.item_name);
  }
  for (const r of rules.slice(0, 8)) {
    if (r.trigger_logic) parts.push(String(r.trigger_logic).slice(0, 120));
    if (r.violation_type) parts.push(r.violation_type);
  }
  return [...new Set(parts.filter(Boolean))].join(' ');
}

/**
 * 语义检索命中条目 merge 进 policyTexts（不覆盖已有 ref_id）
 * @returns {{ policyTexts, policyVerified, rag_hits, rag_query }}
 */
async function enrichPolicyContext(record, rules, basePolicyTexts, basePolicyVerified, opts = {}) {
  const query = opts.query || buildQueryFromCase(record, rules);
  const policyTexts = { ...(basePolicyTexts || {}) };
  const policyVerified = { ...(basePolicyVerified || {}) };
  const hits = await semanticSearch(query, {
    limit: opts.limit || 8,
    kbLayer: opts.kbLayer || null,
    policyTexts,
  });
  for (const h of hits) {
    if (!policyTexts[h.ref_id]) {
      policyTexts[h.ref_id] = h.content;
      policyVerified[h.ref_id] = h.verified !== false;
    }
  }
  return { policyTexts, policyVerified, rag_hits: hits, rag_query: query };
}

module.exports = { buildQueryFromCase, enrichPolicyContext };
