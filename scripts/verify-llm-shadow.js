#!/usr/bin/env node
'use strict';

/**
 * B07c 验收：LLM/确定性共用 applyPostAuditGovernance（无需真 LLM）
 * 用法：node scripts/verify-llm-shadow.js
 */
const { applyPostAuditGovernance } = require('../prototype/app/engine/audit-engine');

function main() {
  const findings = [{
    rule_id: 'A-105',
    status: '疑点',
    amount_involved: 104,
    evidence: [{ type: 'fee', loc: '费用清单第1行', text: '二级护理' }, { type: 'policy', loc: 'KB1', text: '…' }],
    policy: [{ ref: 'KB1-江苏-护理价格2025', text: '二级护理30元/日' }],
    reasoning: '单价12元低于目录30元/日，差额按天数累计',
    priority_score: 90,
  }];

  const gov = applyPostAuditGovernance(findings, {
    shadowRules: ['A-105'],
    policyTexts: { 'KB1-江苏-护理价格2025': '二级护理30元/日' },
    policyVerified: { 'KB1-江苏-护理价格2025': true },
  });

  const f = gov.findings[0];
  const ok = f.shadow === true
    && gov.summary.shadow_count === 1
    && gov.summary.suspected_count === 0
    && gov.summary.shadow_amount_withheld === 104;

  if (!ok) {
    console.error('❌ shadow 治理未生效', gov.summary, f);
    process.exit(1);
  }
  console.log('✅ B07c applyPostAuditGovernance PASS — A-105 shadow 扣留 ¥104，suspected_count=0');
}

main();
