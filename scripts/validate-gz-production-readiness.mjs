#!/usr/bin/env node
/**
 * 79 条官方规则生产就绪校验 — workflow / handler / test_anchor / implemented
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(path.join(ROOT, 'prototype/app/package.json'));
const yaml = require('js-yaml');

const MAPPING_PATH = path.join(ROOT, 'prototype/data/rules/rule_gz_mapping.yaml');
const MATRIX_PATH = path.join(ROOT, 'prototype/data/gz_test_matrix.yaml');
const WORKFLOW_OFFICIAL_PATH = path.join(ROOT, 'prototype/data/rules/workflow_messages_official.yaml');
const WORKFLOW_RULE_PATH = path.join(ROOT, 'prototype/data/rules/workflow_messages.yaml');

function loadYaml(p) {
  if (!fs.existsSync(p)) return null;
  return yaml.load(fs.readFileSync(p, 'utf8'));
}

function main() {
  const strict = process.argv.includes('--strict');
  const mapping = loadYaml(MAPPING_PATH);
  const matrix = loadYaml(MATRIX_PATH);
  const wfOfficial = loadYaml(WORKFLOW_OFFICIAL_PATH) || {};
  const wfRules = loadYaml(WORKFLOW_RULE_PATH) || {};

  const rows = mapping?.mappings || [];
  const matrixByCode = new Map((matrix?.rows || []).map((r) => [r.official_code, r]));

  let implemented = 0;
  let workflowComplete = 0;
  let handlerOk = 0;
  let testAnchor = 0;
  let yhfVerified = 0;
  const issues = [];

  for (const m of rows) {
    if (m.coverage_status === 'implemented') implemented++;
    else issues.push(`${m.official_code}: not implemented (${m.coverage_status})`);

    const prod = m.production || {};
    const hasOfficialWf = !!wfOfficial[m.official_code]?.workflow_messages;
    const hasRuleWf = (m.eagle_rule_ids || []).some((id) => wfRules[id]?.workflow_messages);
    if (prod.workflow === 'complete' && (hasOfficialWf || hasRuleWf)) workflowComplete++;
    else if (prod.workflow !== 'complete') issues.push(`${m.official_code}: production.workflow=${prod.workflow}`);

    if (prod.handler && prod.handler !== 'pending') handlerOk++;
    else issues.push(`${m.official_code}: missing handler`);

    if (matrixByCode.has(m.official_code)) testAnchor++;
    else issues.push(`${m.official_code}: missing test matrix row`);

    if (prod.yhf_verified) yhfVerified++;
  }

  const report = {
    total: rows.length,
    implemented,
    workflow_complete: workflowComplete,
    handler_ok: handlerOk,
    test_anchor: testAnchor,
    yhf_verified: yhfVerified,
    production_ready: implemented === 79 && workflowComplete === 79 && handlerOk === 79 && testAnchor === 79 && yhfVerified === 79,
    issues: issues.slice(0, 20),
    issue_count: issues.length,
  };

  console.log(JSON.stringify(report, null, 2));
  if (strict && !report.production_ready) {
    console.error('❌ G5 production readiness FAIL');
    process.exit(1);
  }
  if (report.production_ready) console.log('✅ 79/79 production ready');
}

main();
