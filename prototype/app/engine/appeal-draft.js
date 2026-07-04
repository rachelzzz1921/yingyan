/**
 * 鹰眼 · 申诉副驾（Appeal Copilot）
 * ------------------------------------------------------------
 * 把一条疑点自动落成：① 可申诉性判断 ② 法定举证材料清单 ③ 申诉书草稿 ④ 医理/药理循证依据。
 * 对齐官方真实申诉机制（非"灰色地带"）：法定六环（初审→申诉→复审→再申诉→合议→终审）、
 *   10 个工作日死线；**政策限定类=明确违规、申诉空间小；医理/合理性类=可基于药理/医理申诉**。
 * 诚实边界：本草稿为初筛辅助,循证论证与超说明书法律免责需医师/药师签字背书。
 */
'use strict';

// 一份可被采纳的申诉包通常含的法定/实务材料。
const LEGAL_MATERIALS = [
  { item: '申诉说明正文', always: true, note: '按“事实概述、争议焦点、逐项意见、复核请求”成文' },
  { item: '患者基本信息页', field: 'front_page', note: '姓名/性别/年龄/病历号/住院起止日期，用于锁定案卷' },
  { item: '病案首页、出院小结与病程记录', field: 'progress_notes', note: '证明诊断、治疗经过、病情变化及临床指征' },
  { item: '长期/临时医嘱单及执行记录', field: 'long_term_orders', note: '核对医嘱、执行时间、数量与收费口径是否一致' },
  { item: '每日费用清单或医保结算明细', field: 'fee_list', note: '逐行对应稽核疑点金额、项目、数量与日期' },
  { item: '检验、检查、影像或病理报告', field: 'lab_reports', note: '支撑适应症、禁忌排除、疗效评价或用药必要性' },
  { item: '分子病理/基因检测报告', field: 'gene_test_report', note: '靶向药、限定支付、精准治疗类疑点的关键材料' },
  { item: '处方、药师审核记录及药品说明书', always: true, note: '涉药疑点建议附说明书适应症、用法用量、注意事项原文' },
];

const APPEAL_WRITING_PROMPT = `你是医保基金稽核申诉材料写作助手，代表医疗机构起草复核/申诉说明。
写作目标：专业、克制、证据导向，帮助复核人员快速理解“争议事实、证据位置、政策依据、机构请求”。
硬性要求：
1. 不编造政策条款、临床指南、病情事实或未提供材料；没有证据时写“拟补充/请调阅”，不要写成已证明。
2. 不用营销话术、情绪化措辞、空泛套话；避免“高度重视、充分体现、综上所述无问题”等 LLM 腔。
3. 按正式文书结构输出：复核请求、案情概述、争议焦点、逐项核查意见、拟提交材料、结语。
4. 每个抗辩点必须绑定证据定位或政策引用；确属明确违规时，应建议核对金额、范围或主动整改，不硬辩。
5. 文字要像医保复核会材料：短句、可核查、可复制进 Word。`;

function compact(s, n = 160) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}...` : t;
}

function money(v) {
  if (v == null || v === '') return '待核定';
  const n = Number(v);
  return Number.isFinite(n) ? `¥${n.toLocaleString('zh-CN')}` : String(v);
}

function evidenceLabel(e) {
  if (!e) return '';
  const loc = e.loc || e.anchor || e.type || '证据定位';
  const text = compact(e.text || e.quote || e.summary || '', 120);
  return text ? `${loc}：${text}` : String(loc);
}

function buildMaterialStatus(m, record) {
  if (m.always) return '待成文/待归档';
  return has(record, m.field) ? '已具备' : '建议补充/调阅';
}

function has(record, field) {
  const v = record && record[field];
  if (!v) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0 && v.status !== '缺失';
  return true;
}

// 可申诉性:政策限定类(明确违规,空间小) vs 医理/合理性类(可循证申诉) vs 证据缺口型(补材料降级)
function judgeAppealability(finding, rule) {
  const vt = finding.violation_type || '';
  const layer = String(finding.layer_label || finding.layer || (rule && rule.layer) || '');
  const isPolicyLimit = /超目录|限定支付|限性别|限年龄|限工伤|限生育|政策限定/.test(vt) || /政策限定/.test(String((rule && rule.category) || ''));
  const isEvidenceGap = /无.*(证据|检测|报告|指征)|缺.*证据|证据缺口|无指征/.test(vt + (finding.reasoning || ''));
  const isClinical = /L2|语义|医理|合理|指征|疗程|适应/.test(layer + vt) || finding.status === '线索';
  if (isEvidenceGap) return { level: '可补材料降级', color: 'amber', reason: '证据缺口型——补交合格证据(如分子病理/基因检测报告、外院已测记载)可降级或撤销,优先补材料而非硬申诉。' };
  if (isPolicyLimit) return { level: '申诉空间小', color: 'red', reason: '政策限定类多为"明确违规",申诉空间有限;重点转向核对限定条件是否确不满足、或主动退回从轻。' };
  if (isClinical) return { level: '可申诉', color: 'green', reason: '医理/合理性争议——可基于药理学/医理学循证举证(引诊疗规范+证据分级),复审须充分听取申诉后再定是否支付。' };
  return { level: '需人工研判', color: 'gray', reason: '定性依赖具体材料,建议人工核对后决定申诉方向。' };
}

function buildReviewLines(finding) {
  const evidence = (finding.evidence || []).slice(0, 5);
  if (!evidence.length) {
    return ['当前疑点尚缺少可直接引用的原始证据定位，建议先调阅费用明细、医嘱执行记录及相关病程/报告后再提交正式申诉。'];
  }
  return evidence.map((e, idx) => {
    const prefix = ['一', '二', '三', '四', '五'][idx] || String(idx + 1);
    return `${prefix}、关于${e.type || '证据'}：已定位至${evidenceLabel(e)}。正式提交时建议附原件页码或费用行号，并说明该证据与疑点金额、数量或临床指征之间的对应关系。`;
  });
}

function buildAppealReason({ finding, appeal, materials, clinicalRefs }) {
  const refs = clinicalRefs.map(r => r.ref).filter(Boolean).join('、');
  const missing = materials.filter(m => /建议补充|待成文/.test(m.status)).map(m => m.item).slice(0, 5).join('、');
  if (appeal.level === '可申诉') {
    return [
      '本案建议围绕“诊疗必要性、执行一致性、金额范围”三个层面组织申诉。',
      `第一，结合病程、医嘱及检验检查结果，说明相关诊疗行为与患者诊断、病情阶段及治疗方案之间存在医学关联，避免仅作概括性说明。`,
      `第二，对稽核所涉费用行逐项核对收费日期、项目名称、数量及执行记录；如存在同名项目、组合项目或跨日计费，应列明对应关系。`,
      `第三，政策或知识库依据可引用：${refs || '待补充诊疗规范、药品说明书或医保支付限定原文'}。引用时应保留条款 ID、原文摘录及来源。`,
    ].join('\n');
  }
  if (appeal.level === '可补材料降级') {
    return [
      '本案更适合先按“补证后复核”路径处理，而不是直接作实体抗辩。',
      `建议优先补充或调阅：${missing || '相关缺失证据'}。`,
      '补证说明应明确材料形成时间、与本次住院诊疗的关联、是否能够覆盖稽核指出的缺口；如补证后仍不能满足政策限定，应如实调整申诉请求。',
    ].join('\n');
  }
  if (appeal.level === '申诉空间小') {
    return [
      '该疑点属于政策限定或明确规则命中类型，正式材料不宜作无证据的实体抗辩。',
      '建议重点核查限定条件、收费范围、金额计算及是否存在同项误归集；若核对无误，可在材料中提出主动整改、金额复核或从轻处理请求。',
      `如需继续申诉，应只围绕已有证据能够支持的具体事项展开：${refs || '政策限定条件、费用行金额或患者实际适用条件'}。`,
    ].join('\n');
  }
  return `建议先由医保办、临床科室、药学/病案人员共同复核材料完整性，再决定是否提交正式申诉。当前判断：${appeal.reason}`;
}

function computeAppealDraft(finding, record, opts = {}) {
  record = record || {};
  const rule = opts.rule || {};
  const appeal = judgeAppealability(finding, rule);

  const materials = LEGAL_MATERIALS.map(m => ({
    item: m.item,
    status: buildMaterialStatus(m, record),
    note: m.note,
  }));

  const clinicalRefs = (finding.policy || []).map(p => ({ ref: p.ref, text: compact(p.text, 180), verify_status: p.verify_status || '' }));

  const pt = record.front_page || {};
  const caseTitle = record.case_meta?.case_title || `${pt.patient_name || '患者'}本次住院案卷`;
  const amt = money(finding.amount_involved);
  const reviewLines = buildReviewLines(finding);
  const disputeFocus = `本案争议焦点在于：${finding.rule_name || finding.violation_type || finding.rule_id}是否已由现有材料充分证明，以及所涉金额${amt}的范围和计算口径是否准确。`;
  const appealReason = buildAppealReason({ finding, appeal, materials, clinicalRefs });
  const draft = {
    title: `关于「${finding.rule_name || finding.rule_id}」疑点的申诉说明`,
    patient: `${pt.patient_name || '（患者姓名）'} ${pt.sex || ''} ${pt.age != null ? pt.age + '岁' : ''} · 病历号 ${pt.mrn || pt.medical_record_no || '待补充'} · ${pt.admit_time || '入院日期待补充'}至${pt.discharge_time || '出院日期待补充'}`,
    request: appeal.level === '申诉空间小'
      ? '请求对疑点定性、费用范围及金额计算进行复核；经核对确属违规的，本机构愿依法依规整改并配合后续处理。'
      : '请求对该疑点作进一步复核；如补充材料能够证明诊疗必要性或金额口径有误，请依法调整疑点等级、金额范围或处理意见。',
    problem_statement: `稽核系统提示：${finding.rule_name || finding.violation_type || finding.rule_id}（规则 ${finding.rule_id || '—'}），当前状态为${finding.status || '待复核'}，涉及金额${amt}。系统理由摘要：${compact(finding.reasoning, 220) || '待补充稽核理由'}`,
    facts_summary: `${caseTitle}。患者住院期间的诊断、治疗经过、费用明细及执行记录，应以病案首页、出院小结、医嘱执行记录和结算明细为准。本申诉说明仅围绕已定位材料及可补充材料提出复核意见。`,
    dispute_focus: disputeFocus,
    item_review: reviewLines,
    appeal_reason: appealReason,
    conclusion: '综上，恳请复审岗位结合原始病历、费用明细、政策条款及本次补充材料，对该疑点的事实基础、适用规则和金额口径作出复核。对经复核仍成立的部分，本机构将按要求整改；对证据不足或金额范围不准确的部分，恳请予以调整。',
    deadline: '法定时限提示：建议在收到初审/判定结果后 10 个工作日内提交申诉及补证材料；具体期限以当地经办通知为准。',
  };
  draft.full_text = renderAppealText(draft, materials, clinicalRefs);

  return {
    finding_id: finding.finding_id,
    rule_id: finding.rule_id,
    rule_name: finding.rule_name,
    appealability: appeal,
    materials,
    clinical_refs: clinicalRefs,
    draft,
    prompt_contract: APPEAL_WRITING_PROMPT,
    process_note: '官方申诉法定六环:初审 → 机构申诉 → 复审 → 再申诉 → 合议 → 终审。',
    honesty_note: '本草稿为初筛辅助;循证论证质量与超说明书用药的法律免责,最终需医师/药师签字背书。',
  };
}

function renderAppealText(draft, materials = [], clinicalRefs = []) {
  const materialLines = materials.map((m, i) => `${i + 1}. ${m.item}：${m.status}。${m.note}`).join('\n');
  const refLines = clinicalRefs.length
    ? clinicalRefs.map((r, i) => `${i + 1}. ${r.ref}：${r.text}${r.verify_status ? `（${r.verify_status}）` : ''}`).join('\n')
    : '1. 待补充可核验的政策条款、诊疗规范、药品说明书或院内制度原文。';
  return `${draft.title}

一、复核请求
${draft.request}

二、案情概述
${draft.patient}
${draft.facts_summary}

三、疑点及争议焦点
${draft.problem_statement}
${draft.dispute_focus}

四、逐项核查意见
${(draft.item_review || []).join('\n')}

五、申诉理由
${draft.appeal_reason}

六、拟提交材料
${materialLines || '待补充材料清单。'}

七、政策/医理依据
${refLines}

八、结语
${draft.conclusion}

${draft.deadline}`;
}

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function renderAppealPackageMarkdown({ appealDraft, evidencePackage }) {
  const dr = appealDraft?.draft || {};
  const lines = [
    '# 鹰眼 · 申诉材料与举证包',
    '',
    `- 规则: ${appealDraft?.rule_id || '—'} ${appealDraft?.rule_name || ''}`,
    `- 可申诉性: ${appealDraft?.appealability?.level || '—'}`,
    `- 生成时间: ${new Date().toISOString()}`,
    '',
    '## 一、申诉说明正文',
    '',
    dr.full_text || renderAppealText(dr, appealDraft?.materials || [], appealDraft?.clinical_refs || []),
    '',
    '## 二、举证材料清单',
    '',
    ...(appealDraft?.materials || []).map(m => `- ${m.item}: ${m.status}。${m.note}`),
    '',
    '## 三、监管举证包',
    '',
    evidencePackage?.markdown || '未生成举证包。',
  ];
  return lines.join('\n');
}

function renderAppealPackageHtml({ appealDraft, evidencePackage }) {
  const dr = appealDraft?.draft || {};
  const text = dr.full_text || renderAppealText(dr, appealDraft?.materials || [], appealDraft?.clinical_refs || []);
  const matRows = (appealDraft?.materials || []).map(m => `<tr><td>${escHtml(m.item)}</td><td>${escHtml(m.status)}</td><td>${escHtml(m.note)}</td></tr>`).join('');
  const refs = (appealDraft?.clinical_refs || []).map(r => `<li><strong>${escHtml(r.ref)}</strong><br>${escHtml(r.text)}${r.verify_status ? `<br><span class="muted">${escHtml(r.verify_status)}</span>` : ''}</li>`).join('');
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>鹰眼·申诉材料与举证包</title>
<style>
body{font-family:"Noto Sans SC",system-ui,sans-serif;margin:0;background:#f6f8fb;color:#102a43}
.sheet{max-width:960px;margin:0 auto;background:#fff;min-height:100vh;padding:30px 38px}
h1{font-size:22px;margin:0 0 6px}h2{font-size:16px;margin:28px 0 10px;border-bottom:1px solid #dce5ef;padding-bottom:7px}
.meta,.muted{color:#60758a;font-size:12.5px}.badge{display:inline-block;border:1px solid #b8d8d5;background:#ecfffb;color:#0f766e;border-radius:999px;padding:2px 9px;font-weight:700;font-size:12px}
pre{white-space:pre-wrap;line-height:1.75;font-size:14px;font-family:inherit;background:#fbfdff;border:1px solid #dce5ef;border-radius:10px;padding:16px}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{border-bottom:1px solid #e5edf5;padding:8px 6px;text-align:left;vertical-align:top}th{background:#f3f7fb}
.box{border:1px solid #dce5ef;border-radius:10px;background:#fbfdff;padding:14px;margin:10px 0}.noprint{margin-bottom:16px}
@media print{body{background:#fff}.sheet{padding:0 12px}.noprint{display:none}pre,.box{border-color:#ddd}}
</style></head><body><main class="sheet">
<div class="noprint"><button onclick="window.print()" style="padding:8px 16px;border-radius:8px;background:#0B2A4A;color:#fff;border:none;font-weight:700;cursor:pointer">打印 / 另存为 PDF</button></div>
<h1>鹰眼 · 申诉材料与举证包</h1>
<p class="meta">规则 ${escHtml(appealDraft?.rule_id || '—')} · ${escHtml(appealDraft?.rule_name || '')} · <span class="badge">${escHtml(appealDraft?.appealability?.level || '待研判')}</span> · ${escHtml(new Date().toISOString())}</p>
<h2>一、申诉说明正文</h2><pre>${escHtml(text)}</pre>
<h2>二、举证材料清单</h2><table><thead><tr><th>材料</th><th>状态</th><th>用途说明</th></tr></thead><tbody>${matRows || '<tr><td colspan="3">—</td></tr>'}</tbody></table>
<h2>三、政策/医理依据</h2><ul>${refs || '<li class="muted">待补充可核验依据。</li>'}</ul>
<h2>四、监管举证包</h2><div class="box">${evidencePackage?.html ? evidencePackage.html.replace(/^[\s\S]*<body[^>]*>/i, '').replace(/<\/body>[\s\S]*$/i, '') : '<p class="muted">未生成举证包。</p>'}</div>
<p class="meta">说明：本文件为申诉准备材料，正式提交前应由医保办、临床科室、药学/病案人员复核并签章。</p>
</main></body></html>`;
}

module.exports = {
  computeAppealDraft,
  judgeAppealability,
  renderAppealText,
  renderAppealPackageHtml,
  renderAppealPackageMarkdown,
  APPEAL_WRITING_PROMPT,
};
