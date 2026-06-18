#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const { resolveBatchCaseIds } = require('../prototype/app/engine/priority-service');
const { runAudit } = require('../prototype/app/engine/audit-engine');
const { loadJsonKB } = require('../prototype/app/kb/retrieval');

async function main() {
  const DATA = path.resolve(__dirname, '../prototype/data');
  const rules = JSON.parse(fs.readFileSync(path.join(DATA, 'rules/rules.json'), 'utf8')).rules;
  const maps = loadJsonKB(DATA);
  const cases = {};
  for (const name of fs.readdirSync(DATA)) {
    if (!name.startsWith('case_')) continue;
    const full = path.join(DATA, name);
    if (!fs.statSync(full).isDirectory()) continue;
    const folderId = name.replace(/^case_/, '');
    const id = folderId === 'NSCLC' ? 'main' : folderId;
    cases[id] = JSON.parse(fs.readFileSync(path.join(full, 'medical_record.json'), 'utf8'));
  }
  const runAuditFn = (rec) => runAudit(rec, rules, {
    policyTexts: maps.policyTexts,
    policyVerified: maps.policyVerified,
    shadowRules: [],
    retiredRules: [],
  });

  const plain = await resolveBatchCaseIds(cases, runAuditFn, { all: true, skip: ['uploaded'] });
  const ranked = await resolveBatchCaseIds(cases, runAuditFn, { all: true, skip: ['uploaded'], priority: true });

  if (!ranked.priority_ranked || !ranked.rank_meta?.preview?.length) {
    console.error('❌ priority batch 无 rank_meta', ranked);
    process.exit(1);
  }
  if (ranked.caseIds.length < 10) {
    console.error('❌ priority caseIds 过少', ranked.caseIds.length);
    process.exit(1);
  }
  if (plain.caseIds.join(',') === ranked.caseIds.join(',')) {
    console.error('❌ 优先级排序与默认顺序相同，未生效');
    process.exit(1);
  }
  const first = ranked.rank_meta.preview[0]?.case_id;
  if (first && ranked.caseIds[0] !== first) {
    console.error('❌ 队首案卷与 preview 不一致', first, ranked.caseIds[0]);
    process.exit(1);
  }
  console.log(`✅ priority batch PASS — ${ranked.caseIds.length} 案卷 · tier1=${ranked.rank_meta.tier1_count} · 首案=${ranked.caseIds[0]}`);

  const prevY = process.env.YINGYAN_ADMIN_TOKEN;
  const prevS = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.YINGYAN_ADMIN_TOKEN;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc-test-key';
  const { checkAdmin } = require('../prototype/app/engine/admin-auth');
  const okSvc = checkAdmin({ headers: { authorization: 'Bearer svc-test-key' } });
  const bad = checkAdmin({ headers: {} });
  if (prevY) process.env.YINGYAN_ADMIN_TOKEN = prevY;
  if (prevS) process.env.SUPABASE_SERVICE_ROLE_KEY = prevS;
  else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!okSvc.ok || okSvc.mode !== 'supabase_service' || bad.ok) {
    console.error('❌ supabase service auth', okSvc, bad);
    process.exit(1);
  }
  console.log('✅ governance service-role auth PASS');
}

main().catch((e) => {
  console.error('❌ verify-iter30:', e.message);
  process.exit(1);
});
