#!/usr/bin/env node
'use strict';
/**
 * 种子：从 demo 案卷跑稽核 → 写入 priority/store.json（HistoryPrior 演示用）
 * 用法：node scripts/seed-priority-store.js
 */
const path = require('path');
const fs = require('fs');

const APP = path.join(__dirname, '../prototype/app');
const DATA = path.join(__dirname, '../prototype/data');

const { CASE_ID_ALIAS } = require(path.join(APP, 'engine/case-id'));
const { runAudit } = require(path.join(APP, 'engine/audit-engine'));
const { enrichRulesDoc } = require(path.join(APP, 'engine/rule-catalog'));
const { loadJsonKB } = require(path.join(APP, 'kb/retrieval'));
const priorityStore = require(path.join(APP, 'engine/priority-store'));

function loadJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function discoverAllCases(dataDir) {
  const cases = {};
  for (const name of fs.readdirSync(dataDir)) {
    if (!name.startsWith('case_')) continue;
    const full = path.join(dataDir, name);
    try { if (!fs.statSync(full).isDirectory()) continue; } catch { continue; }
    const recPath = path.join(full, 'medical_record.json');
    if (!fs.existsSync(recPath)) continue;
    const folderId = name.replace(/^case_/, '');
    const id = CASE_ID_ALIAS[folderId] || folderId;
    cases[id] = loadJSON(recPath);
  }
  return { cases };
}

const SEED_CASES = ['main', 'pharmacy', 'clean', 'ortho', 'drg'];

const rulesDoc = enrichRulesDoc(loadJSON(path.join(DATA, 'rules/rules.json')));
const maps = loadJsonKB(DATA);
const { cases } = discoverAllCases(DATA);

const store = priorityStore.loadStore();
priorityStore.syncCasesFromDb(store, cases);

for (const id of SEED_CASES) {
  const rec = cases[id];
  if (!rec) continue;
  const report = runAudit(rec, rulesDoc.rules, {
    policyTexts: maps.policyTexts,
    policyVerified: maps.policyVerified,
  });
  priorityStore.createAuditRecord(store, {
    case_id: id,
    auditor_id: 'seed-script',
    findings: report.findings,
    report_meta: report.report_meta,
  });
  console.log(`  ✓ ${id}: 疑点 ${report.report_meta.summary?.suspected_count} 线索 ${report.report_meta.summary?.clue_count}`);
}

console.log(`\n写入 ${priorityStore.STORE_PATH}`);
console.log(`audit_records: ${store.audit_records.length}`);
