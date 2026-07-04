'use strict';

const { resolveCitation } = require('./citation-resolver');

const OVERCLAIM = /明确诈骗|刑事犯罪|确凿无疑|100%违规|必须定罪/;

function applyComplianceGate(findings, ctx = {}) {
  const policyTexts = ctx.policyTexts || {};
  const policyVerified = ctx.policyVerified || {};
  const citationIndex = ctx.citationIndex || null;

  for (const f of findings) {
    f.compliance_flags = f.compliance_flags || [];
    const add = (code, action, detail) => f.compliance_flags.push({ code, action, detail });

    if (f.status === '疑点') {
      const wasSuspected = true;
      const evCount = (f.evidence || []).length;
      if (evCount < 2) {
        f.status = '线索';
        add('C-001', 'downgrade', '疑点证据不足 2 项，降级线索');
      }

      const policies = f.policy || [];
      // C-002 门禁语义：一条疑点常引用「主条款 + 辅助指导原则」多条政策；
      // 只要其中至少有「一条」已核验/在知识库的硬条款支撑，政策要素即成立。
      // 仅当「所有」条款都无效(无 ref / 不在知识库)时才降级线索。
      // 修复历史 bug：曾用 some —— 任一附带的⚠待核验条款就拖垮整条本有硬条款支撑的疑点
      // （导致 T-201/B-201 及麻醉/重症/影像/药店专科疑点被系统性误降为线索）。
      const isBadPolicy = (p) => {
        const ref = p.ref || p.ref_id;
        if (!ref) return true;
        if (!policyTexts[ref]) return true;
        const unverified = !policyVerified[ref] && !String(p.verify_status || '').includes('✅');
        return unverified && !policyTexts[ref];
      };
      const badPolicy = policies.length === 0 || policies.every(isBadPolicy);
      if (badPolicy && f.status === '疑点') {
        f.status = '线索';
        add('C-002', 'downgrade', '政策引用未核验或不在知识库');
      }

      const citationStats = citationIntegrity(policies, policyTexts, citationIndex);
      f.citation_integrity = citationStats;
      if (wasSuspected && citationStats.total > 0 && citationStats.resolved === 0) {
        if (f.status === '疑点') f.status = '线索';
        f.needs_human = true;
        add('C-006', 'downgrade_manual', '引用不出可解析条目ID，按 Q9 同款硬约束降级并转人工复核');
      }

      const reasoning = f.reasoning || '';
      if ((!reasoning || reasoning.length < 20) && f.status === '疑点') {
        f.status = '线索';
        add('C-003', 'downgrade', '推理过程过短');
      }

      if (OVERCLAIM.test(reasoning)) {
        f.reasoning = reasoning.replace(OVERCLAIM, '涉嫌违规');
        if (f.risk_level === '高') f.risk_level = '中—高';
        add('C-004', 'rewrite', '措辞超证据强度，已改写');
      }

      if (f._low_ocr && f.status === '疑点') {
        f._compliance_conf_cap = 75;
        add('C-005', 'cap_confidence', 'OCR 低置信疑点置信上限 75');
      }
    }
  }
  return findings;
}

function citationIntegrity(policies, policyTexts, citationIndex) {
  const list = policies || [];
  const unresolved = [];
  let resolved = 0;
  for (const p of list) {
    const ref = p.ref || p.ref_id;
    if (!ref) {
      unresolved.push('');
      continue;
    }
    const ok = !!resolveCitation(ref, citationIndex) || !!policyTexts[ref] || !!p.citation?.resolved || !!p.citation?.synthetic;
    if (ok) resolved += 1;
    else unresolved.push(ref);
  }
  return {
    total: list.length,
    resolved,
    unresolved_refs: unresolved.filter(Boolean),
  };
}

module.exports = { applyComplianceGate };
