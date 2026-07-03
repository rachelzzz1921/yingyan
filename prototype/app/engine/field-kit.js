'use strict';

const { activeFindings } = require('./priority-score');

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function money(v) {
  const n = Number(v);
  return Number.isFinite(n) ? `¥${Math.round(n * 100) / 100}` : '—';
}

function tierForFinding(f) {
  if ((f.needs_more || []).length || f.status === '线索') {
    return { code: 'B', label: '建议补材料后核查' };
  }
  if (f.status === '疑点') return { code: 'A', label: '建议重点核查' };
  return { code: 'C', label: '建议暂缓 / 观察' };
}

function taskForFinding(f) {
  const id = f.rule_id || '';
  if (id === 'T-201') return '调阅分子病理报告 / 基因检测原始报告，核对靶向药医保限定支付条件。';
  if (id === 'TRACE-101') return '核对追溯码首笔结算、退药冲正记录和药品实物流向。';
  if (id === 'AGE-101') return '核对病案首页年龄、药品说明书禁忌和病历特殊获益评估。';
  if (id === 'QTY-901' || id === 'A-109') return '调阅医嘱、执行记录、护理记录或发药记录，核对数量差异。';
  if (/DRG|D-40/.test(`${id}${f.violation_type || ''}`)) return '调阅编码首页、诊断依据和分组器明细，复核支付方式相关差异。';
  return '调阅费用原始凭证、病历锚点和政策适用依据，由现场人员复核。';
}

function buildEvidenceIndex(findings) {
  const rows = [];
  for (const f of findings) {
    for (const e of f.evidence || []) {
      rows.push({
        rule_id: f.rule_id,
        type: e.type,
        loc: e.loc,
        text: e.text,
      });
    }
    for (const p of f.policy || []) {
      rows.push({
        rule_id: f.rule_id,
        type: '政策依据',
        loc: p.ref,
        text: p.text,
      });
    }
  }
  return rows;
}

function buildMissingMaterials(findings) {
  const out = [];
  for (const f of findings) {
    for (const item of f.needs_more || []) out.push({ rule_id: f.rule_id, item });
    if (f.rule_id === 'T-201') out.push({ rule_id: f.rule_id, item: '分子病理报告 / 基因检测报告原件或电子报告详情。' });
  }
  return out;
}

function buildFieldKit({ caseId, record, auditReport, evidencePackage, orgName, period }) {
  const fp = record?.front_page || {};
  const findings = activeFindings(auditReport?.findings || []);
  const suspiciousList = findings.map(f => ({
    rule_id: f.rule_id,
    rule_name: f.rule_name || f.violation_type,
    status: f.status,
    tier: tierForFinding(f),
    amount: f.amount_involved,
    reason: f.reasoning || f.violation_type || '',
    task: taskForFinding(f),
  }));
  const evidenceIndex = buildEvidenceIndex(findings);
  const missingMaterials = buildMissingMaterials(findings);
  return {
    ok: true,
    case_id: caseId,
    org_name: orgName || fp.hospital_name || '演示机构',
    period: period || '演示期间',
    generated_at: new Date().toISOString(),
    case: {
      title: record?.case_meta?.case_title || caseId,
      dept: fp.admit_dept,
      admit_time: fp.admit_time,
      discharge_time: fp.discharge_time,
    },
    summary: auditReport?.report_meta?.summary || {},
    suspicious_list: suspiciousList,
    evidence_index: evidenceIndex,
    field_tasks: suspiciousList.map(x => ({ rule_id: x.rule_id, task: x.task })),
    missing_materials: missingMaterials,
    interview_points: suspiciousList.slice(0, 6).map(x => `围绕 ${x.rule_id} 询问费用发生、医嘱执行、材料留存与院内审核流程。`),
    evidence_package: evidencePackage?.payload || null,
  };
}

function renderFieldKitMarkdown(kit) {
  const lines = [
    '# 鹰眼 · 飞检行装包',
    '',
    `- 案卷: ${kit.case_id} · ${kit.case.title || ''}`,
    `- 机构: ${kit.org_name}`,
    `- 期间: ${kit.period}`,
    `- 生成时间: ${kit.generated_at}`,
    '',
    '## 1. 疑点清单',
    '| 档位 | 规则 | 金额 | 建议动作 |',
    '|---|---|---:|---|',
    ...kit.suspicious_list.map(x => `| ${x.tier.code} ${x.tier.label} | ${x.rule_id} ${x.rule_name || ''} | ${money(x.amount)} | ${x.task} |`),
    '',
    '## 2. 证据索引',
    ...kit.evidence_index.map(x => `- [${x.rule_id}] ${x.type || '证据'} · ${x.loc || '—'}: ${x.text || '—'}`),
    '',
    '## 3. 现场核查任务单',
    ...kit.field_tasks.map(x => `- ${x.rule_id}: ${x.task}`),
    '',
    '## 4. 缺失材料清单',
    ...(kit.missing_materials.length ? kit.missing_materials.map(x => `- ${x.rule_id}: ${x.item}`) : ['- 暂无明确缺失材料，按证据索引现场核验。']),
    '',
    '## 5. 询问笔录要点',
    ...kit.interview_points.map(x => `- ${x}`),
    '',
    '> AI 提供线索支持与材料组织，最终由监管人员裁定。',
  ];
  return lines.join('\n');
}

function renderFieldKitHtml(kit) {
  const md = renderFieldKitMarkdown(kit);
  const lines = md.split('\n');
  const body = [];
  let inTable = false;
  for (const line of lines) {
    if (line.startsWith('|') && line.endsWith('|')) {
      if (line.includes('---')) continue;
      if (!inTable) { body.push('<table>'); inTable = true; }
      const cells = line.split('|').slice(1, -1).map(c => `<td>${esc(c.trim())}</td>`).join('');
      body.push(`<tr>${cells}</tr>`);
      continue;
    }
    if (inTable) { body.push('</table>'); inTable = false; }
    if (line.startsWith('# ')) body.push(`<h1>${esc(line.slice(2))}</h1>`);
    else if (line.startsWith('## ')) body.push(`<h2>${esc(line.slice(3))}</h2>`);
    else if (line.startsWith('- ')) body.push(`<li>${esc(line.slice(2))}</li>`);
    else if (line.startsWith('> ')) body.push(`<p class="note">${esc(line.slice(2))}</p>`);
    else if (line.trim()) body.push(`<p>${esc(line)}</p>`);
  }
  if (inTable) body.push('</table>');
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>鹰眼·飞检行装包</title>
<style>body{font-family:"Noto Sans SC","PingFang SC",sans-serif;color:#0B2A4A;max-width:940px;margin:0 auto;padding:32px;line-height:1.65}
.toolbar{margin-bottom:16px}@media print{.toolbar{display:none}}button{padding:8px 14px;border:0;border-radius:8px;background:#0B2A4A;color:#fff;font-weight:700}
h1{font-size:24px}h2{font-size:17px;margin-top:24px;border-bottom:1px solid #dde4ec;padding-bottom:6px}
table{width:100%;border-collapse:collapse;margin:10px 0}td{border:1px solid #dde4ec;padding:8px;vertical-align:top;font-size:13px}
li{margin:5px 0}.note{background:#f8fafc;border:1px solid #dde4ec;border-radius:10px;padding:12px;color:#5C7185}</style></head><body>
<div class="toolbar"><button onclick="window.print()">打印 / 另存为 PDF</button></div>
${body.join('\n')}
</body></html>`;
}

module.exports = { buildFieldKit, renderFieldKitMarkdown, renderFieldKitHtml };
