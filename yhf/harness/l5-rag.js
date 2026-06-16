'use strict';

/**
 * L5 RAG Harness — recall@k 对 rag_eval_queries.json 评测集。
 * 优先 pgvector（Supabase Live）；无向量时回退 keywordSearch。
 */

const fs = require('fs');
const path = require('path');
const { DEFAULTS, REPO_ROOT, loadGateConfig } = require('../lib/paths');

function loadEvalSet(dataDir) {
  const fp = path.join(dataDir, 'kb/rag_eval_queries.json');
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

function refMatches(hitRef, expectedRefs) {
  if (!hitRef || !expectedRefs?.length) return false;
  const norm = (s) => String(s).replace(/2025-/g, '');
  for (const exp of expectedRefs) {
    if (hitRef === exp) return true;
    if (norm(hitRef) === norm(exp)) return true;
    const suffix = exp.split('-').pop();
    if (suffix && hitRef.endsWith('-' + suffix)) return true;
  }
  return false;
}

async function runRagHarnessAsync(opts = {}) {
  const cfg = loadGateConfig();
  const dataDir = opts.dataDir || DEFAULTS.prototypeData;
  const evalDoc = loadEvalSet(dataDir);
  const k = opts.k ?? evalDoc.meta?.default_k ?? 8;
  const minRecall = opts.minRecall ?? cfg.rag_min_recall ?? evalDoc.meta?.min_recall ?? 0.75;

  const retrieval = require(path.join(REPO_ROOT, 'prototype/app/kb/retrieval'));
  const maps = retrieval.loadJsonKB(dataDir);

  const cases = [];
  let hitCount = 0;

  for (const q of evalDoc.queries || []) {
    let rows = [];
    let err = null;
    const asOf = q.as_of ? new Date(q.as_of + 'T00:00:00') : null;
    try {
      rows = await retrieval.semanticSearch(q.query, {
        limit: k,
        policyTexts: maps.policyTexts,
        policyVerified: maps.policyVerified,
        policyMeta: maps.policyMeta,
        asOf,
      });
    } catch (e) {
      err = e.message;
    }
    const refIds = (rows || []).map(r => r.ref_id);
    const recalled = (rows || []).some(r => refMatches(r.ref_id, q.expected_refs));
    if (recalled) hitCount += 1;
    cases.push({
      id: q.id,
      query: q.query,
      expected_refs: q.expected_refs,
      hit_refs: refIds,
      top_source: rows?.[0]?.source || (err ? 'error' : 'none'),
      recalled,
      error: err,
    });
  }

  const total = cases.length;
  const recall = total ? hitCount / total : 0;
  const pass = recall >= minRecall;

  return {
    status: 'ok',
    layer: 'rag',
    k,
    min_recall: minRecall,
    recall,
    hit_count: hitCount,
    total_queries: total,
    pass,
    gates: { G4_rag_recall: pass },
    cases,
  };
}

module.exports = { runRagHarnessAsync, refMatches, loadEvalSet };
