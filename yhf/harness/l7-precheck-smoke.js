'use strict';

/**
 * L7 Precheck Smoke — MockHIS / 编码员 DRG 演示场景零漏报门禁。
 * 确保事前提醒管线不静默失败、不误报 S0/C0/C2 干净件。
 */

const fs = require('fs');
const path = require('path');
const { DEFAULTS, REPO_ROOT } = require('../lib/paths');

const MOCKHIS = {
  S1: {
    patient: { sex: '女', age: 16, diagnosis: '社区获得性肺炎(J15.900)' },
    items: [
      { name: '左氧氟沙星氯化钠注射液', qty: 5, unit: '袋' },
      { name: '小儿氨酚黄那敏颗粒', qty: 2, unit: '盒' },
      { name: '血常规', qty: 1, unit: '次' },
    ],
    mustHit: ['AGE-101'],
    mustClean: false,
  },
  S2: {
    patient: { sex: '女', age: 52, diagnosis: '尿路感染(N39.000)' },
    items: [
      { name: '前列腺特异性抗原(PSA)测定', qty: 1, unit: '次' },
      { name: '经直肠前列腺超声', qty: 1, unit: '次' },
      { name: '头孢呋辛酯片', qty: 1, unit: '盒' },
    ],
    mustHit: ['F-001'],
    mustClean: false,
  },
  S3: {
    patient: { sex: '男', age: 63, diagnosis: '肺恶性肿瘤(C34.900)' },
    items: [
      { name: '注射用奥希替尼', qty: 1, unit: '盒' },
      { name: '昂丹司琼注射液', qty: 2, unit: '支' },
      { name: '血常规', qty: 1, unit: '次' },
    ],
    mustHit: ['T-201'],
    mustClean: false,
  },
  S4: {
    patient: { sex: '女', age: 34, diagnosis: '低蛋白血症(E88.000)' },
    items: [
      { name: '人血白蛋白', qty: 3, unit: '瓶' },
      { name: '波生坦分散片', qty: 1, unit: '盒' },
    ],
    mustHit: ['B-201'],
    mustClean: false,
  },
  S0: {
    patient: { sex: '男', age: 45, diagnosis: '高血压病(I10.x00)' },
    items: [
      { name: '苯磺酸氨氯地平片', qty: 1, unit: '盒' },
      { name: '血常规', qty: 1, unit: '次' },
    ],
    mustHit: [],
    mustClean: true,
  },
};

const DRG = {
  C1: { input: { diagnosis: '重症肺炎', icd10: 'J15.901', has_severe_evidence: false }, mustHit: ['D-401'], mustClean: false },
  C2: { input: { diagnosis: '重症肺炎', icd10: 'J15.901', has_severe_evidence: true }, mustHit: [], mustClean: true },
  C0: { input: { diagnosis: '社区获得性肺炎', icd10: 'J15.900', has_severe_evidence: false }, mustHit: [], mustClean: true },
};

function loadJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function ruleIds(hits) {
  return [...new Set((hits || []).map((h) => h.rule_id))];
}

function evalScenario(id, got, spec) {
  const ids = ruleIds(got.hits);
  const failures = [];
  if (got.error) failures.push(`error: ${got.error}`);
  for (const r of spec.mustHit || []) {
    if (!ids.includes(r)) failures.push(`missing ${r}`);
  }
  if (spec.mustClean && !got.clean) failures.push(`expected clean, got ${ids.join(',')}`);
  return { id, pass: failures.length === 0, failures, got: ids };
}

function runPrecheckSmoke(opts = {}) {
  const dataDir = opts.dataDir || DEFAULTS.prototypeData;
  const rulesDoc = loadJSON(path.join(dataDir, 'rules/rules.json'));
  const retrieval = require(path.join(REPO_ROOT, 'prototype/app/kb/retrieval'));
  const maps = retrieval.loadJsonKB(dataDir);
  const { runPrecheck } = require(path.join(REPO_ROOT, 'prototype/app/engine/precheck-runner'));
  const { detectDrgUpcoding } = require(path.join(REPO_ROOT, 'prototype/app/engine/precheck-drg'));

  const cases = [];
  for (const [id, spec] of Object.entries(MOCKHIS)) {
    let got;
    try {
      got = runPrecheck(spec.patient, spec.items, {
        rules: rulesDoc.rules,
        policyTexts: maps.policyTexts,
        policyVerified: maps.policyVerified,
      });
    } catch (e) {
      got = { error: e.message, hits: [], clean: true };
    }
    cases.push(evalScenario(id, got, spec));
  }

  for (const [id, spec] of Object.entries(DRG)) {
    let hits;
    try {
      hits = detectDrgUpcoding(spec.input, { policyTexts: maps.policyTexts, policyVerified: maps.policyVerified });
    } catch (e) {
      hits = [];
      cases.push({ id, pass: false, failures: [e.message], got: [] });
      continue;
    }
    const got = { hits, clean: hits.length === 0 };
    cases.push(evalScenario(id, got, spec));
  }

  const pass = cases.every((c) => c.pass);
  return {
    layer: 'precheck_smoke',
    pass,
    cases,
    gates: { G7_precheck_smoke: pass },
  };
}

module.exports = { runPrecheckSmoke, MOCKHIS, DRG };
