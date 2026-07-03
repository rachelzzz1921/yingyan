'use strict';

/** 供 prototype server 调用的 YHF 汇总（无 CLI 副作用） */

const { runEngineHarness } = require('./harness/l3-engine');
const { runManifestRecall } = require('./harness/manifest-recall');
const { runShadowHarnessAll } = require('./harness/l4-shadow');
const { runPromptHarness } = require('./harness/l1-prompt');
const { runRuleHarness } = require('./harness/l2-rule');
const { runRagHarnessAsync } = require('./harness/l5-rag');
const { runPipelineHarness } = require('./harness/l6-pipeline');
const { runG5Harness } = require('./harness/g5-gz-production');
const { loadGateConfig } = require('./lib/paths');

async function runYhfGate(opts = {}) {
  const cfg = loadGateConfig();
  const layers = opts.layers || ['engine', 'pipeline', 'rule', 'rag', 'shadow'];
  const report = { generated: new Date().toISOString(), mode: 'oracle', overall_pass: true };

  if (layers.includes('engine')) {
    report.engine = runEngineHarness();
    if (!report.engine.gates.G0_clean_zero_fp) report.overall_pass = false;
  }
  if (layers.includes('pipeline') || cfg.gates?.G6_pipeline_oracle?.enabled) {
    report.pipeline = await runPipelineHarness();
    if (report.pipeline.pass === false) report.overall_pass = false;
  }
  // 独立地面真值层(金标准去自评化):与引擎自生成快照解耦的第二道真值。
  // G0b_clean_zero_fp 阻塞(独立复核零误报);recall_floor 报告态(非阻塞,同既有 recall 口径)。
  if (layers.includes('engine') || layers.includes('manifest')) {
    try {
      report.manifest = runManifestRecall();
      if (report.manifest.gates?.G0b_clean_zero_fp === false) report.overall_pass = false;
    } catch (e) { report.manifest = { layer: 'manifest_recall', status: 'error', message: String(e && e.message) }; }
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
  if (layers.includes('engine') || layers.includes('gz_production') || cfg.gates?.G5_gz_production_ready?.enabled) {
    try {
      report.gz_production = runG5Harness();
      if (report.gz_production.pass === false) report.overall_pass = false;
    } catch (e) {
      report.gz_production = { layer: 'gz_production', status: 'error', message: String(e && e.message), pass: false };
      report.overall_pass = false;
    }
  }

  return report;
}

module.exports = { runYhfGate };
