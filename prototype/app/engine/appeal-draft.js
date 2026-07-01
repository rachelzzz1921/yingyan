/**
 * 鹰眼 · 申诉副驾（Appeal Copilot）
 * ------------------------------------------------------------
 * 把一条疑点自动落成：① 可申诉性判断 ② 法定举证材料清单 ③ 申诉书草稿 ④ 医理/药理循证依据。
 * 对齐官方真实申诉机制（非"灰色地带"）：法定六环（初审→申诉→复审→再申诉→合议→终审）、
 *   10 个工作日死线；**政策限定类=明确违规、申诉空间小；医理/合理性类=可基于药理/医理申诉**。
 * 诚实边界：本草稿为初筛辅助,循证论证与超说明书法律免责需医师/药师签字背书。
 */
'use strict';

// 一份可被采纳的申诉包通常含的法定/实务材料
const LEGAL_MATERIALS = [
  { item: '申诉书正文', always: true, note: '问题陈述 + 逐条核查说明 + 申诉理由 + 结论' },
  { item: '患者标识', field: 'front_page', note: '姓名 / 病历号 / 就诊日期' },
  { item: '病历与病程记录', field: 'progress_notes', note: '证明诊疗过程与指征' },
  { item: '医嘱单 + 执行/治疗执行单', field: 'long_term_orders', note: '证明医嘱与执行一致' },
  { item: '每日费用清单 / 结算明细', field: 'fee_list', note: '逐行对账' },
  { item: '检验检查报告', field: 'lab_reports', note: '影像 / 病理 / 肌电图等' },
  { item: '分子病理 / 基因检测报告', field: 'gene_test_report', note: '靶向药类疑点关键证据' },
  { item: '药品处方 + 药师审核记录 + 说明书', always: true, note: '涉药疑点必备（药理依据）' },
];

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

function computeAppealDraft(finding, record, opts = {}) {
  record = record || {};
  const rule = opts.rule || {};
  const appeal = judgeAppealability(finding, rule);

  const materials = LEGAL_MATERIALS.map(m => ({
    item: m.item,
    status: m.always ? '待撰写/补齐' : (has(record, m.field) ? '✓ 可提供' : '⚠ 需补 / 待调阅'),
    note: m.note,
  }));

  const clinicalRefs = (finding.policy || []).map(p => ({ ref: p.ref, text: (p.text || '').slice(0, 140), verify_status: p.verify_status || '' }));

  const pt = record.front_page || {};
  const amt = finding.amount_involved || 0;
  const draft = {
    title: `关于「${finding.rule_name || finding.rule_id}」疑点的申诉说明`,
    patient: `${pt.patient_name || '（患者姓名）'} ${pt.sex || ''} ${pt.age != null ? pt.age + '岁' : ''} · 病历号 ${pt.mrn || pt.medical_record_no || finding.rule_id}`,
    problem_statement: `稽核提出疑点:${finding.rule_name}（${finding.rule_id}），涉及金额 ¥${amt}。稽核推理:${(finding.reasoning || '').slice(0, 200)}`,
    item_review: (finding.evidence || []).slice(0, 4).map(e => `· ${e.loc || e.type || ''}：${(e.text || '').slice(0, 60)}`),
    appeal_reason: appeal.level === '可申诉'
      ? `本机构认为该项诊疗具备临床合理性/指征。拟基于以下依据逐条循证申诉:${clinicalRefs.map(r => r.ref).join('、') || '（附诊疗规范/药品说明书原文）'}。【请补充:患者具体病情论证、反向证据、诊疗规范/说明书逐字引用、证据等级】。`
      : appeal.level === '可补材料降级'
        ? `本项属证据缺口型。本机构拟补交:${materials.filter(m => m.status.includes('需补')).map(m => m.item).join('、') || '相关缺失证据'}，以证明诊疗指征成立;若补齐,请予降级/撤销。`
        : `本项${appeal.level}。建议路径:${appeal.reason}`,
    conclusion: `综上,恳请复审岗位/医保专家团队据实核定。相关举证材料见清单。`,
    deadline: '⏰ 法定时限:收到初审/判定结果后 **10 个工作日内**提出申诉,逾期视为认可、直接扣款。',
  };

  return {
    finding_id: finding.finding_id,
    rule_id: finding.rule_id,
    rule_name: finding.rule_name,
    appealability: appeal,
    materials,
    clinical_refs: clinicalRefs,
    draft,
    process_note: '官方申诉法定六环:初审 → 机构申诉 → 复审 → 再申诉 → 合议 → 终审。',
    honesty_note: '本草稿为初筛辅助;循证论证质量与超说明书用药的法律免责,最终需医师/药师签字背书。',
  };
}

module.exports = { computeAppealDraft, judgeAppealability };
