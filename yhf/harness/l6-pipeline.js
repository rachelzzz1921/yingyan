'use strict';

/**
 * L6 Pipeline Harness — 统一稽核管线包装（runAuditPipeline）回归。
 * 目标：确保 pipeline 包装层不引入误报、且与确定性 runAudit() 保持疑点一致。
 */

const fs = require('fs');
const path = require('path');
const { DEFAULTS, loadGateConfig, REPO_ROOT } = require('../lib/paths');
const { resolveRunOptions } = require('../lib/modes');
const { discoverCases } = require('./l3-engine');

function loadJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function loadPipelineContext(dataDir) {
  const rulesDoc = loadJSON(path.join(dataDir, 'rules/rules.json'));
  const retrieval = require(path.join(REPO_ROOT, 'prototype/app/kb/retrieval'));
  const maps = retrieval.loadJsonKB(dataDir);
  return { rules: rulesDoc.rules, policyMapsRaw: maps };
}

function findingIds(findings) {
  return findings
    .filter(f => f.status === '疑点' && !f.shadow)
    .map(f => f.finding_id);
}

async function runPipelineHarness(opts = {}) {
  const cfg = loadGateConfig();
  const dataDir = opts.dataDir || DEFAULTS.prototypeData;
  const skipIds = opts.skipIds || cfg.skip_case_ids || ['uploaded'];
  const caseMap = discoverCases(dataDir, skipIds);
  const { runAudit } = require(DEFAULTS.prototypeEngine);
  const { runAuditPipeline } = require(path.join(REPO_ROOT, 'prototype/app/engine/audit-pipeline'));
  const ctx = loadPipelineContext(dataDir);
  const runOpts = resolveRunOptions('oracle');

  const cases = [];
  let cleanPass = true;
  let subsetPass = true;

  for (const [caseId, pack] of Object.entries(caseMap)) {
    const record = pack.record;
    const detReport = runAudit(record, ctx.rules, {
      policyTexts: ctx.policyMapsRaw.policyTexts,
      policyVerified: ctx.policyMapsRaw.policyVerified,
      policyPending: ctx.policyMapsRaw.policyPending,
      ...runOpts,
    });
    const pipelineReport = await runAuditPipeline(record, ctx.rules, {
      profile: 'standard',
      policyMapsRaw: ctx.policyMapsRaw,
      shadowRules: [],
      retiredRules: [],
      rag: true,
    });

    const isClean = (record.case_meta?.embedded_violation_count ?? null) === 0;
    const detSummary = detReport.report_meta.summary || {};
    const pipeSummary = pipelineReport.report_meta.summary || {};
    const detIds = new Set(findingIds(detReport.findings));
    const pipelineIds = new Set(findingIds(pipelineReport.findings));
    const missing = [...detIds].filter(id => !pipelineIds.has(id));

    if (isClean && (pipeSummary.suspected_count ?? 0) > 0) cleanPass = false;
    if (missing.length) subsetPass = false;

    cases.push({
      case_id: caseId,
      is_clean: isClean,
      deterministic_suspected: detSummary.suspected_count ?? 0,
      pipeline_suspected: pipeSummary.suspected_count ?? 0,
      missing_deterministic_finding_ids: missing,
    });
  }

  const pass = cleanPass && subsetPass;
  return {
    layer: 'pipeline',
    mode: 'oracle',
    cases,
    checks: {
      clean_zero_fp: cleanPass,
      deterministic_subset: subsetPass,
    },
    pass,
    gates: { G6_pipeline_oracle: pass },
  };
}

module.exports = { runPipelineHarness };
