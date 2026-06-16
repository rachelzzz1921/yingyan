'use strict';

/**
 * L4 Shadow Harness — 规则准入「三验·影子运行」。
 * 与 Live shadow（误报降权）分离：此处只产 shadow_metrics，决定规则能否 active。
 */

const { discoverCases } = require('./l3-engine');
const { DEFAULTS, loadGateConfig, REPO_ROOT } = require('../lib/paths');
const { resolveRunOptions } = require('../lib/modes');
const fs = require('fs');
const path = require('path');

function loadJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function loadEngineContext(dataDir) {
  const rulesDoc = loadJSON(path.join(dataDir, 'rules/rules.json'));
  const retrieval = require(path.join(REPO_ROOT, 'prototype/app/kb/retrieval'));
  return { rules: rulesDoc.rules, ...retrieval.loadJsonKB(dataDir) };
}

function goldRuleFired(expected, record, ruleId) {
  const isClean = (record?.case_meta?.embedded_violation_count ?? null) === 0;
  if (isClean) return false;
  if (!expected) return null;
  const list = expected.findings || expected.expected_findings || [];
  return list.some(f => f.rule_id === ruleId && f.status === '疑点');
}

function hasGoldCoverage(expected, record) {
  if ((record?.case_meta?.embedded_violation_count ?? null) === 0) return true;
  return !!expected;
}

/**
 * @param {string} ruleId
 * @param {{ caseIds?: string[] }} opts
 */
function runShadowHarness(ruleId, opts = {}) {
  const cfg = loadGateConfig();
  const dataDir = opts.dataDir || DEFAULTS.prototypeData;
  const skipIds = opts.skipIds || cfg.skip_case_ids || ['uploaded'];
  const caseMap = discoverCases(dataDir, skipIds);
  const caseIds = opts.caseIds || Object.keys(caseMap);

  const { runAudit } = require(DEFAULTS.prototypeEngine);
  const ctx = loadEngineContext(dataDir);

  let tp = 0, fp = 0, fn = 0, tn = 0, casesRun = 0, goldCases = 0;

  for (const id of caseIds) {
    const pack = caseMap[id];
    if (!pack) continue;
    casesRun++;

    const rep = runAudit(pack.record, ctx.rules, {
      policyTexts: ctx.policyTexts,
      policyVerified: ctx.policyVerified,
      ...resolveRunOptions('oracle'),
    });
    const fired = rep.findings.some(f => f.rule_id === ruleId && f.status === '疑点' && !f.shadow);
    const gold = goldRuleFired(pack.expected, pack.record, ruleId);

    if (gold === null) continue;
    goldCases++;
    if (gold === true && fired) tp++;
    else if (gold === true && !fired) fn++;
    else if (gold === false && fired) fp++;
    else if (gold === false && !fired) tn++;
  }

  const denom = tp + fp;
  const precision = denom ? tp / denom : null;
  const fpr = (fp + tn) ? fp / (fp + tn) : null;
  const maxFpr = cfg.shadow_max_fpr ?? 0.10;
  const pass = goldCases === 0 ? null : (fpr != null ? fpr <= maxFpr : null);

  return {
    layer: 'shadow',
    rule_id: ruleId,
    cases_run: casesRun,
    gold_cases: goldCases,
    metrics: { tp, fp, fn, tn, precision, fpr },
    shadow_metrics: {
      true_positive: tp,
      false_positive: fp,
      false_negative: fn,
      precision: precision != null ? +precision.toFixed(3) : null,
      false_positive_rate: fpr != null ? +fpr.toFixed(3) : null,
    },
    gates: { G1_shadow_fpr: pass },
    pass,
    skipped: goldCases === 0,
    note: 'clean 案卷 gold=false；violation 案卷读 expected_findings；无 gold 覆盖则 skipped',
  };
}

function runShadowHarnessAll(coreRules, opts = {}) {
  const results = [];
  let passed = 0, failed = 0, skipped = 0;
  for (const ruleId of coreRules) {
    const r = runShadowHarness(ruleId, opts);
    results.push(r);
    if (r.skipped || r.pass === null) skipped++;
    else if (r.pass) passed++;
    else failed++;
  }
  return {
    layer: 'shadow',
    rules: results,
    summary: { passed, failed, skipped, total: coreRules.length },
    pass: failed === 0,
    gates: { G1_shadow_fpr: failed === 0 },
  };
}

module.exports = { runShadowHarness, runShadowHarnessAll, goldRuleFired, hasGoldCoverage };
