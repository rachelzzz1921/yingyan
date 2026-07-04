'use strict';

const fs = require('fs');
const path = require('path');
const { DEFAULTS, loadGateConfig, REPO_ROOT } = require('../lib/paths');
const { resolveRunOptions } = require('../lib/modes');
const { discoverCases } = require('./l3-engine');

function loadJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function runCitationIntegrityHarness(opts = {}) {
  const cfg = loadGateConfig();
  const dataDir = opts.dataDir || DEFAULTS.prototypeData;
  const minResolvedRate = opts.minResolvedRate ?? cfg.citation_min_resolved_rate ?? 0.9;
  const skipIds = opts.skipIds || cfg.skip_case_ids || ['uploaded'];
  const rulesDoc = loadJSON(path.join(dataDir, 'rules/rules.json'));
  const retrieval = require(path.join(REPO_ROOT, 'prototype/app/kb/retrieval'));
  const maps = retrieval.loadJsonKB(dataDir);
  const { runAudit } = require(DEFAULTS.prototypeEngine);
  const runOptions = resolveRunOptions('oracle');
  const caseMap = discoverCases(dataDir, skipIds);

  const cases = [];
  let refsTotal = 0;
  let refsResolved = 0;
  for (const [id, { record }] of Object.entries(caseMap)) {
    const rep = runAudit(record, rulesDoc.rules, {
      policyTexts: maps.policyTexts,
      policyVerified: maps.policyVerified,
      policyPending: maps.policyPending,
      policyMeta: maps.policyMeta,
      citationIndex: maps.citationIndex,
      ...runOptions,
    });
    const failures = [];
    for (const f of rep.findings || []) {
      for (const p of f.policy || []) {
        if (!p.ref || typeof p.ref !== 'string') failures.push(`${f.rule_id}: empty policy ref`);
      }
      if (f.status !== '疑点') continue;
      const ci = f.citation_integrity || {};
      refsTotal += ci.total || 0;
      refsResolved += ci.resolved || 0;
      if ((ci.resolved || 0) < 1) failures.push(`${f.rule_id}: suspected finding has no resolvable citation`);
    }
    cases.push({ case_id: id, pass: failures.length === 0, failures });
  }
  const resolvedRate = refsTotal ? refsResolved / refsTotal : 1;
  const hardPass = cases.every(c => c.pass);
  return {
    layer: 'citation_integrity',
    pass: hardPass,
    warn: resolvedRate < minResolvedRate,
    min_resolved_rate: minResolvedRate,
    refs_total: refsTotal,
    refs_resolved: refsResolved,
    refs_resolved_rate: Number(resolvedRate.toFixed(4)),
    cases,
    gates: { G8_citation_integrity: hardPass },
  };
}

module.exports = { runCitationIntegrityHarness };
