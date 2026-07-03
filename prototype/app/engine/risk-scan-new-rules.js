'use strict';

/**
 * 新规则（A-102 / B-201-IND / SUR-401）风险扫描 —— 供 YHF 之外快速回归。
 * 用法：node prototype/app/engine/risk-scan-new-rules.js
 */
const fs = require('fs');
const path = require('path');
const { runAudit, parseDate } = require('./audit-engine');
const { loadJsonKB } = require('../kb/retrieval');
const { findMutualExclusiveHits } = require('./kb-operational-index');
const { findSurgeryDiscountViolations } = require('./surgery-discount');
const { evaluateIndicationSync } = require('./indication-semantics');

const DATA = path.join(__dirname, '../../data');

function mkFinding(ctx, ruleId, fields) {
  const rule = ctx.rules[ruleId];
  if (!rule) return null;
  return { rule_id: ruleId, status: fields.status, amount_involved: fields.amount_involved || 0 };
}

function scan() {
  const rules = JSON.parse(fs.readFileSync(path.join(DATA, 'rules/rules.json'), 'utf8')).rules;
  const maps = loadJsonKB(DATA);
  const rulesMap = Object.fromEntries(rules.map(r => [r.rule_id, r]));
  const risks = [];

  for (const folder of fs.readdirSync(DATA).filter(d => d.startsWith('case_') && fs.statSync(path.join(DATA, d)).isDirectory())) {
    const mp = path.join(DATA, folder, 'medical_record.json');
    if (!fs.existsSync(mp)) continue;
    const rec = JSON.parse(fs.readFileSync(mp, 'utf8'));
    const clean = rec.case_meta?.embedded_violation_count === 0;
    const items = rec.fee_list?.items || [];

    const a102Raw = findMutualExclusiveHits(items, parseDate);
    const surRaw = findSurgeryDiscountViolations(items);
    const ctx = { record: rec, rules: rulesMap, caseId: folder, policyTexts: maps.policyTexts, policyVerified: maps.policyVerified, params: {} };
    const indRaw = evaluateIndicationSync(ctx, mkFinding);

    const rep = runAudit(rec, rules, { policyTexts: maps.policyTexts, policyVerified: maps.policyVerified });
    const s = rep.report_meta.summary;

    if (clean && s.suspected_count > 0) {
      risks.push({ level: 'HIGH', folder, issue: 'G0 clean has suspected', count: s.suspected_count, rules: rep.findings.filter(f => f.status === '疑点').map(f => f.rule_id) });
    }
    if (clean && a102Raw.length > 0) {
      risks.push({ level: 'MED', folder, issue: 'A-102 raw hits on clean case', pairs: a102Raw.map(h => `${h.pair.a}×${h.pair.b}`) });
    }
    if (a102Raw.length > 0 && !rep.findings.some(f => f.rule_id === 'A-102')) {
      risks.push({ level: 'INFO', folder, issue: 'A-102 raw>0 but engine 0 (suppressed or reconciled)', raw: a102Raw.length });
    }
    if (indRaw.length > 0) {
      risks.push({ level: 'LOW', folder, issue: 'B-201-IND sync clues', drugs: indRaw.map(f => f.rule_id) });
    }
    if (surRaw.length > 0 && !rep.findings.some(f => f.rule_id === 'SUR-401')) {
      risks.push({ level: 'MED', folder, issue: 'SUR-401 raw but not in report', raw: surRaw.length });
    }
  }
  return risks;
}

if (require.main === module) {
  const risks = scan();
  console.log(JSON.stringify({ scanned_at: new Date().toISOString(), total: risks.length, risks }, null, 2));
  process.exit(risks.some(r => r.level === 'HIGH') ? 1 : 0);
}

module.exports = { scan };
