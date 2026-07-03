'use strict';

/**
 * G5 — 79 条官方规则生产就绪门禁（implemented + workflow + test matrix）
 */
const fs = require('fs');
const path = require('path');
const { REPO_ROOT, loadGateConfig } = require('../lib/paths');

function loadYaml(p) {
  const yaml = require(path.join(REPO_ROOT, 'prototype/app/node_modules/js-yaml'));
  return yaml.load(fs.readFileSync(p, 'utf8'));
}

function runG5Harness(opts = {}) {
  const cfg = loadGateConfig();
  const g5 = cfg.gates?.G5_gz_production_ready || {};
  if (g5.enabled === false) {
    return { layer: 'gz_production', status: 'skip', pass: null, message: 'G5 disabled' };
  }

  const dataDir = opts.dataDir || path.join(REPO_ROOT, 'prototype/data');
  const mapping = loadYaml(path.join(dataDir, 'rules/rule_gz_mapping.yaml'));
  const matrix = fs.existsSync(path.join(dataDir, 'gz_test_matrix.yaml'))
    ? loadYaml(path.join(dataDir, 'gz_test_matrix.yaml')) : { rows: [] };
  const wfOfficial = fs.existsSync(path.join(dataDir, 'rules/workflow_messages_official.yaml'))
    ? loadYaml(path.join(dataDir, 'rules/workflow_messages_official.yaml')) : {};
  const wfRules = fs.existsSync(path.join(dataDir, 'rules/workflow_messages.yaml'))
    ? loadYaml(path.join(dataDir, 'rules/workflow_messages.yaml')) : {};

  const matrixCodes = new Set((matrix.rows || []).map(r => r.official_code));
  const rows = mapping.mappings || [];
  let implemented = 0;
  let workflow = 0;
  let testAnchor = 0;
  let handlerOk = 0;
  const gaps = [];

  for (const m of rows) {
    if (m.coverage_status === 'implemented') implemented++;
    else gaps.push(`${m.official_code}: status=${m.coverage_status}`);

    const hasWf = !!wfOfficial[m.official_code]?.workflow_messages?.precheck
      || (m.eagle_rule_ids || []).some(id => wfRules[id]?.workflow_messages?.precheck);
    if (hasWf && m.production?.workflow === 'complete') workflow++;
    else gaps.push(`${m.official_code}: workflow incomplete`);

    if (matrixCodes.has(m.official_code)) testAnchor++;
    else gaps.push(`${m.official_code}: no test matrix`);

    if (m.production?.handler && m.production.handler !== 'pending') handlerOk++;
  }

  const minImpl = g5.min_implemented ?? 79;
  const minWf = g5.min_workflow ?? 79;
  const minAnchor = g5.min_test_anchor ?? 79;
  const pass = implemented >= minImpl && workflow >= minWf && testAnchor >= minAnchor && handlerOk >= minImpl;

  return {
    layer: 'gz_production',
    gates: { G5_gz_production_ready: pass },
    pass,
    summary: { implemented, workflow, test_anchor: testAnchor, handler_ok: handlerOk, total: rows.length },
    gaps: gaps.slice(0, 15),
    gap_count: gaps.length,
  };
}

module.exports = { runG5Harness };
