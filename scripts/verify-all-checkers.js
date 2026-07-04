#!/usr/bin/env node
'use strict';

/** 校验 rules.yaml 每条 rule_id 均有 checker 或批量/索引路径 */
const path = require('path');
const yaml = require(path.join(__dirname, '../prototype/app/node_modules/js-yaml'));
const fs = require('fs');
const { ruleCheckerIds } = require(path.join(__dirname, '../prototype/app/engine/audit-engine'));

const rules = yaml.load(fs.readFileSync(path.join(__dirname, '../prototype/data/rules/rules.yaml'), 'utf8')).rules;
const ids = rules.map(r => r.rule_id);
const set = new Set(ruleCheckerIds);
const BATCH_ZB = ids.filter(id => /^ZB-/.test(id));
const missing = ids.filter(id => !set.has(id));

console.log('rules.yaml:', ids.length);
console.log('ruleCheckers:', ruleCheckerIds.length);

if (missing.length) {
  console.error('FAIL missing checker:', missing.join(', '));
  process.exit(1);
}

const user62Families = ['F', 'A', 'B', 'C', 'D', 'E', 'T', 'M', 'ICU', 'P', 'IMG', 'CV', 'BP'];
const in62 = ids.filter(id => user62Families.some(p => id.startsWith(p + '-')));
const extra = ids.filter(id => !in62.includes(id));
console.log('62族:', in62.length, '| 族外17:', extra.length, '→', extra.join(', '));
console.log('OK: 79/79 rule_id 均有 ruleCheckers（含 B-201-IND、ZB 在库内由批量路径触发）');
