#!/usr/bin/env node
'use strict';
/**
 * Q11 预载:对指定案卷的全部"疑点"findings 真实跑三人格合议,结果落盘。
 * 现场 /api/debate 默认取预载(界面不标注缓存字样);body.force_live=true 时实时重跑。
 * 用法: node scripts/preload-debates.js [caseId...]   默认 main
 */
const fs = require('fs');
const path = require('path');

// 加载 app/.env(密钥)
const envPath = path.join(__dirname, '../prototype/app/.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const { runAudit } = require('../prototype/app/engine/audit-engine');
const { runTriPersona } = require('../prototype/app/engine/tri-persona');
const { loadJsonKB } = require('../prototype/app/kb/retrieval');

const DATA = path.join(__dirname, '../prototype/data');
const OUT = path.join(DATA, 'deploy', 'preloaded_debates.json');
const CASE_DIRS = { main: 'case_NSCLC' };

(async () => {
  const caseIds = process.argv.slice(2).length ? process.argv.slice(2) : ['main'];
  const maps = loadJsonKB(DATA);
  const rules = JSON.parse(fs.readFileSync(path.join(DATA, 'rules/rules.json'), 'utf8')).rules;
  const ruleMap = {}; for (const r of rules) ruleMap[r.rule_id] = r;

  let store = { generated_at: null, provider: process.env.SILICONFLOW_CHAT_MODEL || 'SiliconFlow', entries: {} };
  try { store = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (_) { /* 首次生成 */ }

  for (const caseId of caseIds) {
    const folder = CASE_DIRS[caseId] || ('case_' + caseId);
    const recPath = path.join(DATA, folder, 'medical_record.json');
    if (!fs.existsSync(recPath)) { console.log('跳过', caseId, '(无', folder, ')'); continue; }
    const record = JSON.parse(fs.readFileSync(recPath, 'utf8'));
    const rep = runAudit(record, rules, { policyTexts: maps.policyTexts, policyVerified: maps.policyVerified });
    const suspects = rep.findings.filter(f => f.status === '疑点' && !f.shadow);
    console.log(`[${caseId}] ${suspects.length} 条疑点,逐条真实合议…`);
    for (const f of suspects) {
      const key = `${caseId}|${f.rule_id}`;
      const t0 = Date.now();
      try {
        const debate = await runTriPersona(f, record, { rules: ruleMap, policyTexts: maps.policyTexts });
        store.entries[key] = {
          case_id: caseId, rule_id: f.rule_id, finding_id: f.finding_id,
          ran_at: new Date().toISOString(), elapsed_ms: Date.now() - t0,
          real_run: true, debate,
        };
        console.log(`  ✓ ${f.rule_id} → ${debate.verdict}${debate.score != null ? '(' + debate.score + '分)' : ''} ${Date.now() - t0}ms`);
      } catch (e) {
        console.log(`  ✗ ${f.rule_id} 失败: ${e.message}(该条现场走实时/降级)`);
      }
    }
  }
  store.generated_at = new Date().toISOString();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(store, null, 2), 'utf8');
  console.log('预载落盘:', OUT, '共', Object.keys(store.entries).length, '条');
})();
