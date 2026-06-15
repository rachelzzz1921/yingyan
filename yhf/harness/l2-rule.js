'use strict';

/**
 * L2 Rule Harness — 扫描核心规则 test_cases + Oracle smoke。
 */

const fs = require('fs');
const path = require('path');
const { DEFAULTS, loadGateConfig } = require('../lib/paths');
const { discoverCases } = require('./l3-engine');
const { resolveRunOptions } = require('../lib/modes');

function loadRules(dataDir) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, 'rules/rules.json'), 'utf8')).rules || {};
}

function runRuleHarness(opts = {}) {
  const cfg = loadGateConfig();
  const dataDir = opts.dataDir || DEFAULTS.prototypeData;
  const coreIds = opts.coreRules || cfg.core_rules || [];
  const rules = loadRules(dataDir);
  const ruleMap = {};
  for (const r of rules) ruleMap[r.rule_id] = r;

  const scope = coreIds.length ? coreIds : rules.map(r => r.rule_id);
  const missing = [];
  const tested = [];
  let { runAudit } = require(DEFAULTS.prototypeEngine);
  const kb1 = JSON.parse(fs.readFileSync(path.join(dataDir, 'kb/kb1_policies.json'), 'utf8'));
  const policyTexts = {}, policyVerified = {};
  for (const e of kb1.entries || []) {
    policyTexts[e.ref_id] = e.text;
    policyVerified[e.ref_id] = (e.verify_status || '').startsWith('✅');
  }
  const caseMap = discoverCases(dataDir, ['uploaded']);
  const mainCase = caseMap.main?.record || Object.values(caseMap)[0]?.record;

  for (const id of scope) {
    const r = ruleMap[id];
    if (!r) {
      missing.push({ rule_id: id, have: 0, need: 6, error: 'rule not found' });
      continue;
    }
    const tc = r.test_cases || r.governance?.test_cases || [];
    const pos = tc.filter(t => t.polarity === 'positive' || t.expect === 'fire').length;
    const neg = tc.filter(t => t.polarity === 'negative' || t.expect === 'no_fire').length;
    if (tc.length < 6 || pos < 3 || neg < 3) {
      missing.push({ rule_id: id, have: tc.length, need: 6, positive: pos, negative: neg });
      continue;
    }
    if (mainCase) {
      try {
        const rep = runAudit(mainCase, rules, {
          policyTexts, policyVerified, ...resolveRunOptions('oracle'),
        });
        const fired = rep.findings.some(f => f.rule_id === id);
        tested.push({ rule_id: id, test_cases: tc.length, positive: pos, negative: neg, fires_on_main: fired });
      } catch (e) {
        tested.push({ rule_id: id, error: e.message });
      }
    }
  }

  return {
    layer: 'rule',
    status: missing.length ? 'partial' : 'ok',
    core_rules: scope,
    total_rules: scope.length,
    rules_with_full_cases: tested.length,
    missing_test_cases: missing.length,
    missing_sample: missing.slice(0, 8),
    missing_details: missing,
    tested_sample: tested.slice(0, 5),
    tested_all: tested,
    gates: { L2_core_full_cases: missing.length === 0 },
    pass: missing.length === 0 ? true : null,
    note: coreIds.length
      ? `L2 核心集 ${scope.length} 条，每条 ≥3阳+≥3阴 test_cases`
      : '完整 L2 需每条规则 6 用例 + 独立红蓝断言；当前为扫描+主案卷 smoke',
  };
}

module.exports = { runRuleHarness };
