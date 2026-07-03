'use strict';

/**
 * L3 Engine Harness — Oracle 模式案卷回归。
 * 对齐 prototype/server.js /api/bench，强制不传 shadowRules（公理 A）。
 */

const fs = require('fs');
const path = require('path');
const { DEFAULTS, loadGateConfig, REPO_ROOT } = require('../lib/paths');
const { resolveRunOptions } = require('../lib/modes');

function loadJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// 与 prototype/server.js loadAll() 案卷 id 对齐（文件夹名 ≠ API id）
const CASE_ID_ALIAS = { NSCLC: 'main' };

function discoverCases(dataDir, skipIds) {
  const cases = {};
  if (!fs.existsSync(dataDir)) return cases;
  for (const name of fs.readdirSync(dataDir)) {
    if (!name.startsWith('case_')) continue;
    const folderId = name.replace(/^case_/, '');
    const id = CASE_ID_ALIAS[folderId] || folderId;
    if (skipIds.includes(id)) continue;
    const recPath = path.join(dataDir, name, 'medical_record.json');
    if (!fs.existsSync(recPath)) continue;
    const rec = loadJSON(recPath);
    let expected = null;
    const expPath = path.join(dataDir, name, 'expected_findings.json');
    if (fs.existsSync(expPath)) expected = loadJSON(expPath);
    cases[id] = { record: rec, expected, dir: name };
  }
  return cases;
}

function loadEngineContext(dataDir) {
  const rulesDoc = loadJSON(path.join(dataDir, 'rules/rules.json'));
  const retrieval = require(path.join(REPO_ROOT, 'prototype/app/kb/retrieval'));
  const maps = retrieval.loadJsonKB(dataDir);
  return { rules: rulesDoc.rules, policyTexts: maps.policyTexts, policyVerified: maps.policyVerified };
}

function countExpectedSuspected(expected) {
  if (!expected) return null;
  const list = expected.findings || expected.expected_findings || [];
  return list.filter(f => f.status === '疑点').length;
}

function countExpectedClues(expected) {
  const n = expected?.report_meta?.summary?.clue_count;
  return n == null ? null : n;
}

function runEngineHarness(opts = {}) {
  const cfg = loadGateConfig();
  const dataDir = opts.dataDir || DEFAULTS.prototypeData;
  const skipIds = opts.skipIds || cfg.skip_case_ids || ['uploaded'];
  const runOptions = resolveRunOptions('oracle');

  // eslint-disable-next-line import/no-dynamic-require
  const { runAudit } = require(DEFAULTS.prototypeEngine);
  const ctx = loadEngineContext(dataDir);
  const caseMap = discoverCases(dataDir, skipIds);

  const results = [];
  let g0Pass = true;

  for (const [id, { record, expected }] of Object.entries(caseMap)) {
    const t0 = Date.now();
    const rep = runAudit(record, ctx.rules, {
      policyTexts: ctx.policyTexts,
      policyVerified: ctx.policyVerified,
      ...runOptions,
    });
    const ms = Date.now() - t0;

    const expectViolations = record.case_meta?.embedded_violation_count ?? null;
    const isClean = expectViolations === 0;
    const foundSuspected = rep.report_meta.summary.suspected_count;
    const falsePositives = isClean ? foundSuspected : null;

    const failures = [];
    if (isClean && foundSuspected > 0) {
      g0Pass = false;
      failures.push(`G0: clean case "${id}" has ${foundSuspected} suspected finding(s)`);
    }

    const expectedSuspected = countExpectedSuspected(expected);
    if (expectedSuspected != null && foundSuspected !== expectedSuspected) {
      failures.push(`recall: expected ${expectedSuspected} suspected, got ${foundSuspected}`);
    }

    const foundClue = rep.report_meta.summary.clue_count;
    const expectedClue = countExpectedClues(expected);
    if (expectedClue != null && foundClue !== expectedClue) {
      failures.push(`recall: expected ${expectedClue} clues, got ${foundClue}`);
    }

    results.push({
      case_id: id,
      mode: 'oracle',
      title: record.case_meta?.case_title || id,
      is_clean: isClean,
      expected_violations: expectViolations,
      expected_suspected: expectedSuspected,
      expected_clue: expectedClue,
      found_suspected: foundSuspected,
      found_clue: foundClue,
      false_positives: falsePositives,
      latency_ms: ms,
      routing: `${rep.report_meta.routing?.activated_count}/${rep.report_meta.routing?.total}`,
      pass: failures.length === 0,
      failures,
    });
  }

  const clean = results.filter(r => r.is_clean);
  return {
    layer: 'engine',
    mode: 'oracle',
    meta: {
      total_cases: results.length,
      clean_cases: clean.length,
      clean_false_positive_total: clean.reduce((s, c) => s + (c.false_positives || 0), 0),
      red_line_clean_zero_fp: g0Pass,
      avg_latency_ms: results.length
        ? Math.round(results.reduce((s, c) => s + c.latency_ms, 0) / results.length)
        : 0,
    },
    gates: { G0_clean_zero_fp: g0Pass },
    cases: results,
  };
}

module.exports = { runEngineHarness, discoverCases };
