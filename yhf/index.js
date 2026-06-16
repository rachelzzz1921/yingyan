'use strict';

/** 供 prototype server 调用的 YHF 汇总（无 CLI 副作用） */

const { runEngineHarness } = require('./harness/l3-engine');
const { runShadowHarnessAll } = require('./harness/l4-shadow');
const { runPromptHarness } = require('./harness/l1-prompt');
const { runRuleHarness } = require('./harness/l2-rule');
const { runRagHarnessAsync } = require('./harness/l5-rag');
const { loadGateConfig } = require('./lib/paths');

async function runYhfGate(opts = {}) {
  const cfg = loadGateConfig();
  const layers = opts.layers || ['engine', 'rule', 'rag', 'shadow'];
  const report = { generated: new Date().toISOString(), mode: 'oracle', overall_pass: true };

  if (layers.includes('engine')) {
    report.engine = runEngineHarness();
    if (!report.engine.gates.G0_clean_zero_fp) report.overall_pass = false;
  }
  if (layers.includes('rule')) report.rule = runRuleHarness();
  if (layers.includes('prompt')) report.prompt = runPromptHarness();
  if (layers.includes('shadow') || cfg.gates?.G1_shadow_fpr?.enabled !== false) {
    const coreRules = cfg.core_rules || [];
    report.shadow = runShadowHarnessAll(coreRules, { ruleId: opts.ruleId });
    if (report.shadow.pass === false) report.overall_pass = false;
  }
  if (layers.includes('rag') && cfg.rag_enabled !== false) {
    report.rag = await runRagHarnessAsync({ k: cfg.rag_k, minRecall: cfg.rag_min_recall });
    if (!report.rag.pass) report.overall_pass = false;
  }

  return report;
}

module.exports = { runYhfGate };
