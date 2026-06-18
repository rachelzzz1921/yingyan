#!/usr/bin/env node
'use strict';
/** ECC Evaluate · Gold G1–G6 回归（priority-pathway v2） */
const path = require('path');
const fs = require('fs');

const APP = path.join(__dirname, '../prototype/app');
const { enrichFindingsPipeline } = require(path.join(APP, 'engine/priority-enrich'));
const { scoreCase, activeFindings } = require(path.join(APP, 'engine/priority-score'));
const priorityStore = require(path.join(APP, 'engine/priority-store'));

const gold = JSON.parse(fs.readFileSync(path.join(__dirname, '../prototype/data/priority/gold_eval.json'), 'utf8'));
const baseStore = priorityStore.loadStore();
let failed = 0;

function scenarioStore(sc) {
  if (!sc.store_override) return baseStore;
  return {
    ...baseStore,
    audit_records: [...(baseStore.audit_records || []), ...(sc.store_override.audit_records || [])],
    cases: { ...baseStore.cases, ...(sc.store_override.cases || {}) },
  };
}

function fail(id, msg) {
  failed += 1;
  console.log(`  ✗ ${id}: ${msg}`);
}

function pass(id, msg) {
  console.log(`  ✓ ${id}: ${msg}`);
}

for (const sc of gold.scenarios) {
  const store = scenarioStore(sc);
  const enriched = enrichFindingsPipeline(sc.raw_findings, sc.record, store, store.config);
  const findings = enriched.findings;
  const exp = sc.expect;
  const active = activeFindings(findings);
  const scored = scoreCase({
    findings,
    history: { patient: 0, dept: 0, doctor: 0 },
    peerAmounts: [1000, 2000, 50000, 80000],
    config: store.config,
    risk_tags: enriched.case_fields.risk_tags,
    special_case_review: sc.record.case_meta?.special_case_review,
  });

  let ok = true;
  if (exp.finding_emitted === false && active.length) {
    fail(sc.id, `expected no active findings, got ${active.length}`);
    ok = false;
  }
  if (exp.finding_count != null && active.length !== exp.finding_count) {
    fail(sc.id, `finding_count ${active.length} != ${exp.finding_count}`);
    ok = false;
  }
  const f0 = active[0] || findings[0];
  if (exp.status && f0 && f0.status !== exp.status) {
    fail(sc.id, `status ${f0.status} != ${exp.status}`);
    ok = false;
  }
  if (exp.violation_nature && f0 && f0.violation_nature !== exp.violation_nature) {
    fail(sc.id, `nature ${f0.violation_nature} != ${exp.violation_nature}`);
    ok = false;
  }
  if (exp.violation_type_contains && f0 && !String(f0.violation_type).includes(exp.violation_type_contains)) {
    fail(sc.id, `violation_type ${f0.violation_type}`);
    ok = false;
  }
  if (exp.needs_more_min && (!f0?.needs_more || f0.needs_more.length < exp.needs_more_min)) {
    fail(sc.id, 'needs_more missing');
    ok = false;
  }
  if (exp.amount_null && f0 && f0.amount_involved != null) {
    fail(sc.id, `amount should be null, got ${f0.amount_involved}`);
    ok = false;
  }
  if (exp.tier != null && scored.tier !== exp.tier) {
    fail(sc.id, `tier ${scored.tier} != ${exp.tier}`);
    ok = false;
  }
  if (exp.suspected_count != null && scored.suspected_count !== exp.suspected_count) {
    fail(sc.id, `suspected_count ${scored.suspected_count} != ${exp.suspected_count}`);
    ok = false;
  }
  if (exp.outlier_suppressed && !scored.breakdown?.outlier_suppressed) {
    fail(sc.id, 'outlier not suppressed');
    ok = false;
  }
  if (exp.disposition_contains && f0 && !String(f0.disposition_suggestion).includes(exp.disposition_contains)) {
    fail(sc.id, `disposition ${f0.disposition_suggestion}`);
    ok = false;
  }
  if (exp.nature_upgraded && !f0?.nature_upgraded) {
    fail(sc.id, 'nature not upgraded');
    ok = false;
  }
  if (exp.shadow && !sc.raw_findings[0]?.shadow) {
    fail(sc.id, 'shadow flag missing on raw');
    ok = false;
  }
  if (exp.enters_api_score === false && scored.api_score > 0 && active.length) {
    fail(sc.id, `should not score, api_score=${scored.api_score}`);
    ok = false;
  }
  if (ok) pass(sc.id, sc.description);
}

console.log(failed ? `\nGOLD EVAL FAIL ${failed}` : `\nGOLD EVAL PASS ${gold.scenarios.length}/${gold.scenarios.length}`);
process.exit(failed ? 1 : 0);
