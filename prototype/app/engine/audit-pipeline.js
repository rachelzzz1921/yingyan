'use strict';

/**
 * 鹰眼 · 统一稽核管线（RAG 知识层 + 确定性锚点 + LLM 语义增量）
 * ------------------------------------------------------------
 * 七环节编排的执行层：不重造 audit-engine / llm-agent，只做上下文装配与 findings 级融合。
 */

const { parseAdmitDate, filterPolicyMaps } = require('../kb/retrieval');
const { enrichPolicyContext } = require('../kb/analysis-bridge');
const { runParseQA } = require('./parse-qa');
const {
  runAudit,
  buildIndicationLlmFindings,
  reconcile,
  applyRelationsArbitration,
  applyPostAuditGovernance,
} = require('./audit-engine');
const { isReady: llmReady, providerName } = require('./llm-provider');
const { findingNature, caseNature, natureCounts, NATURE_BASIS } = require('./nature');

/** policyTexts → llm-agent 所需 KB 形状 */
function kbFromPolicyTexts(policyTexts, fallbackKb) {
  const entries = Object.entries(policyTexts || {}).map(([ref_id, text]) => ({ ref_id, text }));
  if (entries.length) return { entries };
  return fallbackKb || { entries: [] };
}

/**
 * as_of 过滤 + 可选 RAG enrich
 * @returns {{ policyTexts, policyVerified, policyPending, parseQuality, as_of, ragMeta, kb }}
 */
async function buildEnrichedContext(record, rules, policyMapsRaw, opts = {}) {
  const asOf = parseAdmitDate(record);
  const filtered = filterPolicyMaps(policyMapsRaw, asOf);
  const parseQuality = record.case_meta?.parse_quality || runParseQA(record);
  let policyTexts = filtered.policyTexts;
  let policyVerified = filtered.policyVerified;
  let ragMeta = null;

  if (opts.rag) {
    try {
      const enriched = await enrichPolicyContext(record, rules, policyTexts, policyVerified);
      policyTexts = enriched.policyTexts;
      policyVerified = enriched.policyVerified;
      ragMeta = { query: enriched.rag_query, hits: enriched.rag_hits };
    } catch (_) { /* RAG 失败静默回退静态 KB */ }
  }

  return {
    policyTexts,
    policyVerified,
    policyPending: filtered.policyPending || {},
    policyMeta: filtered.policyMeta || policyMapsRaw?.policyMeta || {},
    citationIndex: filtered.citationIndex || policyMapsRaw?.citationIndex || null,
    parseQuality,
    as_of: asOf ? asOf.toISOString().slice(0, 10) : null,
    ragMeta,
    kb: kbFromPolicyTexts(policyTexts),
  };
}

function feeLineKey(finding) {
  const ids = new Set();
  for (const e of finding.evidence || []) {
    const m = (e.loc || '').match(/第\s*([\d、]+)\s*行/);
    if (m && /费用/.test(e.loc)) m[1].split('、').forEach(n => ids.add(Number(n)));
  }
  return ids.size ? [...ids].sort((a, b) => a - b).join(',') : null;
}

function findingMergeKey(f) {
  return `${f.rule_id}|${feeLineKey(f) || f.finding_id}`;
}

/** 确定性 findings 为锚 + LLM 增量，双路命中标 both */
function mergePipelineFindings(detReport, llmReport, opts = {}) {
  const detFindings = (detReport.findings || []).map(f => ({ ...f, ran_by: f.ran_by || 'deterministic' }));
  const llmFindings = (llmReport.findings || []).map(f => ({ ...f, ran_by: 'llm' }));

  const originMap = new Map();
  detFindings.forEach(f => {
    originMap.set(findingMergeKey(f), { det: true, llm: false });
  });
  llmFindings.forEach(f => {
    const key = findingMergeKey(f);
    const entry = originMap.get(key) || { det: false, llm: false };
    entry.llm = true;
    if (!entry.llmDetail) entry.llmDetail = { reasoning: f.reasoning, cove: f.cove, confidence: f.confidence };
    originMap.set(key, entry);
  });

  const combined = [...detFindings, ...llmFindings];
  const ruleMap = {};
  for (const r of (opts.rules || [])) ruleMap[r.rule_id] = r;
  const arb = applyRelationsArbitration(combined, ruleMap, opts.record);
  const rec = reconcile(arb.findings);
  const gov = applyPostAuditGovernance(rec.findings, {
    shadowRules: opts.shadowRules,
    retiredRules: opts.retiredRules,
    policyTexts: opts.policyTexts || {},
    policyVerified: opts.policyVerified || {},
    citationIndex: opts.citationIndex || null,
  });

  const merged = gov.findings.map(f => ({ ...f }));
  for (const f of merged) {
    const key = findingMergeKey(f);
    const origin = originMap.get(key);
    if (origin?.det && origin?.llm) {
      f.ran_by = 'both';
      if (origin.llmDetail) f.llm_corroboration = origin.llmDetail;
    } else if (origin?.llm) {
      f.ran_by = 'llm';
    } else {
      f.ran_by = f.ran_by || 'deterministic';
    }
    f.nature = findingNature(f);
    f.nature_basis = NATURE_BASIS[f.nature];
  }
  const case_nature = caseNature(merged);

  const report = {
    ...detReport,
    findings: merged,
    correctly_not_flagged: detReport.correctly_not_flagged || [],
    real_agent: true,
    report_meta: {
      ...detReport.report_meta,
      case_nature,
      case_nature_basis: NATURE_BASIS[case_nature],
      real_agent: true,
      llm_provider: llmReport.report_meta?.llm_provider || providerName(),
      context_manifest: llmReport.report_meta?.context_manifest || detReport.report_meta?.context_manifest,
      stage_ms: llmReport.report_meta?.stage_ms,
      reconciliation_log: rec.reconciliation_log || [],
      layers: {
        deterministic: { ran: true },
        rag: opts.ragMeta
          ? { ran: true, hits: opts.ragMeta.hits?.length || 0, query: opts.ragMeta.query }
          : { ran: false },
        llm_semantic: {
          ran: true,
          provider: llmReport.report_meta?.llm_provider || providerName(),
          prosecutor_ms: llmReport.report_meta?.stage_ms?.prosecutor,
          cove_ms: llmReport.report_meta?.stage_ms?.cove,
        },
      },
      engine_mode: `统一管线·深度语义（确定性锚点+RAG+LLM · ${llmReport.report_meta?.llm_provider || providerName()}）`,
      analysis_kind: 'deterministic+rag+llm_merged',
      summary: {
        ...gov.summary,
        case_nature,
        nature_counts: natureCounts(merged),
        total_findings: merged.length,
      },
      shadow_governance: true,
    },
  };
  if (opts.ragMeta) report.report_meta.rag = opts.ragMeta;
  return report;
}

function filterL2Rules(rules, routing) {
  const activated = new Set(routing?.activated || []);
  const l2 = rules.filter(r => activated.has(r.rule_id) && !/L1/.test(r.layer || ''));
  return l2.length ? l2 : rules.filter(r => !/L1/.test(r.layer || ''));
}

function profileUsesRag(profile, opts) {
  if (profile === 'super' || profile === 'deep') return true;
  return !!opts.rag;
}

/**
 * @param {object} record
 * @param {object[]} rules
 * @param {object} opts { profile, policyMapsRaw, shadowRules, retiredRules, rag, llmShadow }
 */
async function runAuditPipeline(record, rules, opts = {}) {
  const profile = opts.profile || 'fast';
  const t0 = Date.now();
  const useRag = profileUsesRag(profile, opts);
  const ctx = await buildEnrichedContext(record, rules, opts.policyMapsRaw, { rag: useRag });

  const runOpts = {
    policyTexts: ctx.policyTexts,
    policyVerified: ctx.policyVerified,
    policyPending: ctx.policyPending,
    policyMeta: ctx.policyMeta,
    citationIndex: ctx.citationIndex,
    parseQuality: ctx.parseQuality,
    shadowRules: opts.shadowRules || [],
    retiredRules: opts.retiredRules || [],
  };

  let indicationSemantic = 'sync';
  if (profile === 'super' && llmReady()) {
    try {
      const extraFindings = await buildIndicationLlmFindings(record, rules, ctx.policyTexts, ctx.policyVerified, ctx.citationIndex);
      if (extraFindings.length) {
        indicationSemantic = 'llm';
        runOpts.extraFindings = extraFindings;
        runOpts.skipIndicationSync = true;
      }
    } catch (_) { /* 适应症 LLM 失败回退 sync */ }
  }

  const detReport = runAudit(record, rules, runOpts);
  if (ctx.ragMeta) detReport.report_meta.rag = ctx.ragMeta;

  if (profile === 'deep') {
    if (!llmReady()) {
      const err = new Error('未配置 LLM API Key');
      err.needsKey = true;
      throw err;
    }
    const { llmAgentAudit } = require('./llm-agent');
    const rulesForLlm = filterL2Rules(rules, detReport.report_meta.routing);
    const llmReport = await llmAgentAudit(record, rulesForLlm, {
      kb: ctx.kb,
      policyTexts: ctx.policyTexts,
      policyVerified: ctx.policyVerified,
      citationIndex: ctx.citationIndex,
      shadowRules: opts.shadowRules,
      retiredRules: opts.retiredRules,
    });
    const merged = mergePipelineFindings(detReport, llmReport, {
      record,
      rules,
      shadowRules: opts.shadowRules,
      retiredRules: opts.retiredRules,
      policyTexts: ctx.policyTexts,
      policyVerified: ctx.policyVerified,
      citationIndex: ctx.citationIndex,
      ragMeta: ctx.ragMeta,
    });
    merged.report_meta.elapsed_ms = Date.now() - t0;
    merged.report_meta.as_of = ctx.as_of;
    merged.report_meta.shadow_governance = true;
    merged.report_meta.analysis_profile = 'deep';
    return merged;
  }

  detReport.report_meta.elapsed_ms = Date.now() - t0;
  detReport.report_meta.as_of = ctx.as_of;
  detReport.report_meta.layers = {
    deterministic: { ran: true },
    rag: ctx.ragMeta ? { ran: true, hits: ctx.ragMeta.hits?.length || 0 } : { ran: false },
    llm_semantic: { ran: false },
  };
  detReport.report_meta.analysis_profile = profile;
  detReport.report_meta.shadow_governance = true;

  if (profile === 'super') {
    detReport.report_meta.super_fused = true;
    detReport.report_meta.indication_semantic = indicationSemantic;
    detReport.report_meta.super_llm = llmReady()
      ? (indicationSemantic === 'llm' ? 'indication+B-201' : 'deferred')
      : 'fallback';
    detReport.report_meta.analysis_kind = 'deterministic+template+rag';
    detReport.report_meta.engine_mode = llmReady()
      ? (indicationSemantic === 'llm'
        ? '超级增强：RAG+适应症LLM语义(B-201)+规则合议'
        : '超级增强：RAG+对抗防护+规则合议（LLM 语义请点「真·语义分析」）')
      : '超级增强：RAG+对抗防护（LLM 未配置）';
  } else if (useRag) {
    detReport.report_meta.analysis_kind = 'deterministic+template+rag';
    if (!detReport.report_meta.engine_mode?.includes('RAG')) {
      detReport.report_meta.engine_mode = 'RAG 增强稽核：确定性规则引擎 + pgvector 语义检索增强政策上下文';
    }
  } else {
    detReport.report_meta.analysis_kind = 'deterministic+template';
  }

  detReport.report_meta.real_agent = false;
  return detReport;
}

module.exports = {
  buildEnrichedContext,
  kbFromPolicyTexts,
  mergePipelineFindings,
  runAuditPipeline,
  feeLineKey,
  filterL2Rules,
};
