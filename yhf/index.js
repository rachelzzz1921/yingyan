'use strict';

/** 供 prototype server 调用的 YHF 汇总（无 CLI 副作用） */

const { runEngineHarness } = require('./harness/l3-engine');
const { runShadowHarness } = require('./harness/l4-shadow');
const { runPromptHarness } = require('./harness/l1-prompt');
const { runRuleHarness } = require('./harness/l2-rule');

function runYhfGate(opts = {}) {
  const layers = opts.layers || ['engine', 'rule', 'prompt'];
  const report = { generated: new Date().toISOString(), mode: 'oracle', overall_pass: true };

  if (layers.includes('engine')) {
    report.engine = runEngineHarness();
    if (!report.engine.gates.G0_clean_zero_fp) report.overall_pass = false;
  }
  if (layers.includes('rule')) report.rule = runRuleHarness();
  if (layers.includes('prompt')) report.prompt = runPromptHarness();
  if (layers.includes('shadow') || opts.ruleId) {
    report.shadow = runShadowHarness(opts.ruleId || 'T-201');
    if (report.shadow.pass === false) report.overall_pass = false;
  }

  return report;
}

module.exports = { runYhfGate };
