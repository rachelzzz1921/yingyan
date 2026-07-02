#!/usr/bin/env node
'use strict';
/**
 * 对指定案卷文件夹重生成 Oracle 金标准 expected_findings.json(引擎实测,零手编)。
 * 用法: node scripts/regen-golds.js case_drg case_pharmacy ...
 * 刻意不跑全量 generate-bench-20.js(它会用 build() 重建 medical_record.json,
 * 覆盖生成后手工调整过的案卷)。
 */
const fs = require('fs');
const path = require('path');
const { runAudit } = require('../prototype/app/engine/audit-engine');
const { loadJsonKB } = require('../prototype/app/kb/retrieval');

const DATA = path.join(__dirname, '../prototype/data');
const maps = loadJsonKB(DATA);
const rules = JSON.parse(fs.readFileSync(path.join(DATA, 'rules/rules.json'), 'utf8')).rules;

const folders = process.argv.slice(2);
if (!folders.length) { console.error('用法: node scripts/regen-golds.js <case_folder> ...'); process.exit(1); }

for (const folder of folders) {
  const recPath = path.join(DATA, folder, 'medical_record.json');
  const record = JSON.parse(fs.readFileSync(recPath, 'utf8'));
  const rep = runAudit(record, rules, { policyTexts: maps.policyTexts, policyVerified: maps.policyVerified });
  const suspected = rep.findings.filter(f => f.status === '疑点' && !f.shadow);
  const clues = rep.findings.filter(f => f.status === '线索');
  const doc = {
    report_meta: {
      case_id: record.case_meta?.case_id || record.case_meta?.internal_id,
      gold_standard: true,
      gold_standard_note: 'Oracle 引擎自动生成，供 YHF/shadow 使用',
      summary: { suspected_count: suspected.length, clue_count: clues.length, total_findings: rep.findings.length },
    },
    findings: rep.findings.filter(f => !f.shadow).map(f => ({
      rule_id: f.rule_id, rule_name: f.rule_name, status: f.status,
      amount_involved: f.amount_involved || 0, violation_type: f.violation_type,
    })),
    correctly_not_flagged: rep.correctly_not_flagged || [],
  };
  fs.writeFileSync(path.join(DATA, folder, 'expected_findings.json'), JSON.stringify(doc, null, 2), 'utf8');
  console.log(folder, '→ 疑点', suspected.length, '线索', clues.length,
    '|', rep.findings.map(f => `${f.rule_id}(${f.status},¥${f.amount_involved})`).join(' '));
}
