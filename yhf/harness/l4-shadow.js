'use strict';

/**
 * L4 Shadow Harness — 规则准入「三验·影子运行」（scaffold）。
 * 与 Live shadow（误报降权）分离：此处只产 shadow_metrics，决定规则能否 active。
 */

const { runEngineHarness, discoverCases } = require('./l3-engine');
const { DEFAULTS, loadGateConfig } = require('../lib/paths');
const { resolveRunOptions } = require('../lib/modes');
const fs = require('fs');
const path = require('path');

function loadJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function goldRuleFired(expected, ruleId) {
  if (!expected) return null;
  const list = expected.findings || expected.expected_findings || [];
  return list.some(f => f.rule_id === ruleId && f.status === '疑点');
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
  const rulesDoc = loadJSON(path.join(dataDir, 'rules/rules.json'));
  const kb1 = loadJSON(path.join(dataDir, 'kb/kb1_policies.json'));
  const policyTexts = {};
  const policyVerified = {};
  for (const e of kb1.entries || []) {
    policyTexts[e.ref_id] = e.text;
    policyVerified[e.ref_id] = (e.verify_status || '').startsWith('✅');
  }

  let tp = 0, fp = 0, fn = 0, tn = 0, casesRun = 0;

  for (const id of caseIds) {
    const pack = caseMap[id];
    if (!pack) continue;
    casesRun++;

    // Oracle 跑全量，只看 target rule 是否 fire 疑点
    const rep = runAudit(pack.record, rulesDoc.rules, {
      policyTexts, policyVerified,
      ...resolveRunOptions('oracle'),
    });
    const fired = rep.findings.some(f => f.rule_id === ruleId && f.status === '疑点' && !f.shadow);
    const gold = goldRuleFired(pack.expected, ruleId);

    if (gold === true && fired) tp++;
    else if (gold === true && !fired) fn++;
    else if (gold === false && fired) fp++;
    else if (gold === false && !fired) tn++;
    // gold === null：无标注，不参与 precision 分母（仅计数）
  }

  const denom = tp + fp;
  const precision = denom ? tp / denom : null;
  const fpr = (fp + tn) ? fp / (fp + tn) : null;
  const maxFpr = cfg.shadow_max_fpr ?? 0.10;
  const pass = fpr != null ? fpr <= maxFpr : null;

  return {
    layer: 'shadow',
    rule_id: ruleId,
    cases_run: casesRun,
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
    note: 'scaffold: 仅统计有 gold 标注的案卷；完整版需 rules.test_cases[] 驱动',
  };
}

module.exports = { runShadowHarness };
