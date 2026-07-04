'use strict';

const crypto = require('crypto');
const { activeFindings } = require('./priority-score');
const priorityStore = require('./priority-store');
const { citationLine } = require('./citation-resolver');

function amountAlgorithmNote(finding) {
  if (finding.amount_involved == null) {
    return 'DRG 专用：缺分组器/支付标准，未输出金额数字（仅线索+needs_more）';
  }
  if (/DRG|高套|D-401|D-402/.test(`${finding.rule_id}${finding.violation_type}`)) {
    return 'DRG：剔除违规因素后重新结算，比较两次基金支付差额（需分组器）';
  }
  return '按项目付费：对应费用行金额合计';
}

function buildPackagePayload({ finding, record, caseRow, auditRecords, maskPii }) {
  const fp = record?.front_page || {};
  const patientName = maskPii
    ? priorityStore.maskPatient({ name: fp.patient_name, pii_token: record?.case_meta?.pii_token }, true).name
    : fp.patient_name;

  const audit = (auditRecords || [])[0] || {};
  return {
    pkg_id: `PKG-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`,
    scope: finding ? 'finding' : 'case',
    case: {
      case_id: caseRow?.case_id,
      case_title: caseRow?.case_title || record?.case_meta?.case_title,
      patient_name: patientName,
      admit_time: fp.admit_time,
      discharge_time: fp.discharge_time,
      dept: fp.admit_dept,
      special_case_review: caseRow?.special_case_review || record?.case_meta?.special_case_review,
    },
    finding: finding ? {
      finding_id: finding.finding_id,
      rule_id: finding.rule_id,
      status: finding.status,
      violation_type: finding.violation_type,
      violation_nature: finding.violation_nature,
      risk_level: finding.risk_level,
      amount_involved: finding.amount_involved,
      amount_algorithm: amountAlgorithmNote(finding),
      disposition_suggestion: finding.disposition_suggestion,
      evidence: finding.evidence,
      policy: finding.policy,
      citation_integrity: finding.citation_integrity,
      reasoning: finding.reasoning,
      needs_more: finding.needs_more,
    } : null,
    audit_chain: {
      cove: audit.cove_result || finding?.cove || finding?._cove,
      defense: audit.defense_result || finding?.debate,
      compliance_gate: audit.compliance_gate_result || finding?.compliance_flags,
      collective_decision: audit.collective_decision,
      timeline: audit.timeline || [],
      appeal_channel: audit.appeal_channel || '医疗机构可在收到认定材料后 10 个工作日内提交申诉与补证材料（演示口径）',
    },
    generated_at: new Date().toISOString(),
  };
}

function renderPackageHtml(payload) {
  const f = payload.finding;
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const ev = (f?.evidence || []).map(e => `<li><strong>${esc(e.type)}</strong> ${esc(e.loc)}<br>${esc(e.text)}</li>`).join('');
  const pol = (f?.policy || []).map(p => {
    const line = citationLine(p.citation || { ref: p.ref, resolved: false });
    const src = p.citation?.source_url ? `<br><span class="meta">出处：${esc(p.citation.source_url)}</span>` : '';
    return `<li><strong>${esc(line || p.ref)}</strong> <code>${esc(p.ref)}</code><br>${esc(p.text)}${src}</li>`;
  }).join('');
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>鹰眼·举证包</title>
<style>body{font-family:"Noto Sans SC",sans-serif;padding:32px;color:#0B2A4A;max-width:820px;margin:0 auto}
h1{font-size:20px}h2{font-size:15px;margin-top:20px;border-bottom:1px solid #dde4ec;padding-bottom:6px}
.meta{font-size:13px;color:#5C7185}.box{background:#f8fafc;border:1px solid #dde4ec;border-radius:10px;padding:12px;margin:10px 0;font-size:13px}
.noprint{margin-bottom:16px}@media print{.noprint{display:none}}</style></head><body>
<div class="noprint"><button onclick="window.print()" style="padding:8px 16px;border-radius:8px;background:#0B2A4A;color:#fff;border:none;font-weight:700;cursor:pointer">🖨 打印 / 另存为 PDF</button></div>
<h1>鹰眼 · 飞检举证包</h1>
<p class="meta">pkg ${esc(payload.pkg_id)} · ${esc(payload.generated_at)} · ${esc(payload.scope)}</p>
<h2>案件标识</h2><div class="box">${esc(payload.case.case_title)} · ${esc(payload.case.dept)} · ${esc(payload.case.admit_time)} ~ ${esc(payload.case.discharge_time)}<br>
违规性质：${esc(f?.violation_nature)} · 处置：${esc(f?.disposition_suggestion)}</div>
<h2>三要素 · 证据定位</h2><ul>${ev || '<li>—</li>'}</ul>
<h2>三要素 · 政策条款原文</h2><ul>${pol || '<li>—</li>'}</ul>
<h2>三要素 · 推理过程</h2><div class="box">${esc(f?.reasoning)}</div>
<h2>违规金额与算法</h2><div class="box">¥${esc(f?.amount_involved)} · ${esc(f?.amount_algorithm)}</div>
<h2>审计链</h2><div class="box">CoVe/控辩裁/合规门禁记录见 JSON 附件；申诉渠道：${esc(payload.audit_chain.appeal_channel)}</div>
<p class="meta">由鹰眼自动生成 · 政策条款取自知识库快照并附条目ID与官方出处 · 引用不可穿透的结论已按规程转人工，未进入本举证包</p>
</body></html>`;
}

function buildEvidencePackage({ store, record, caseId, findingId, maskPii = true }) {
  const caseRow = store.cases[caseId];
  const findings = caseRow?.findings_cache || [];
  const finding = findingId
    ? findings.find(f => f.finding_id === findingId || f.rule_id === findingId)
    : activeFindings(findings)[0];
  if (!finding) return { ok: false, error: '未找到 Finding' };
  const audits = (store.audit_records || []).filter(r => r.case_id === caseId).slice(-1);
  const payload = buildPackagePayload({ finding, record, caseRow, auditRecords: audits, maskPii });
  return {
    ok: true,
    payload,
    html: renderPackageHtml(payload),
    markdown: renderPackageMarkdown(payload),
  };
}

function renderPackageMarkdown(p) {
  const f = p.finding;
  const lines = [
    '# 鹰眼 · 飞检举证包',
    '',
    `- pkg: \`${p.pkg_id}\``,
    `- 案件: ${p.case.case_title}`,
    `- 性质: ${f?.violation_nature} · 处置: ${f?.disposition_suggestion}`,
    '',
    '## 证据',
    ...(f?.evidence || []).map(e => `- [${e.type}] ${e.loc}: ${e.text}`),
    '',
    '## 条款',
    ...(f?.policy || []).map(pol => {
      const line = citationLine(pol.citation || { ref: pol.ref, resolved: false });
      const src = pol.citation?.source_url ? `\n  出处：${pol.citation.source_url}` : '';
      return `- ${line || pol.ref}（${pol.ref}）\n  原文：${pol.text}${src}`;
    }),
    '',
    '## 推理',
    f?.reasoning || '',
    '',
    `金额: ¥${f?.amount_involved ?? '—'} · ${f?.amount_algorithm}`,
  ];
  return lines.join('\n');
}

module.exports = { buildEvidencePackage, buildPackagePayload, renderPackageHtml };
