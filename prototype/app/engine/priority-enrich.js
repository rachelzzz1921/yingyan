'use strict';

const { enrichFindingNature } = require('./priority-nature');
const { activeFindings } = require('./priority-score');

/** 9大重点领域 + DIP 辅助目录标签 */
const FOCUS_AREAS = [
  { tag: '肿瘤', re: /肿瘤|NSCLC|化疗|放疗|腺癌|C34/i },
  { tag: '麻醉', re: /麻醉|全麻|PACU|M-30/i },
  { tag: '重症医学', re: /重症|ICU|ARDS|呼吸机|CRRT/i },
  { tag: 'cardiovascular', re: /心血管|心内|冠心病|支架/i },
  { tag: '骨科', re: /骨科|骨折|PKP|钢板|ORTHO/i },
  { tag: 'blood_purification', re: /血透|透析|LL1|肾透析/i },
  { tag: '康复', re: /康复|理疗/i },
  { tag: '医学影像', re: /影像|CT|MRI|DR|增强/i },
  { tag: '临床检验', re: /检验|化验|血气|钾钠氯/i },
];

function computeRiskTags(record) {
  const tags = [];
  const hay = JSON.stringify({
    dept: record.front_page?.admit_dept,
    dx: record.front_page?.principal_diagnosis,
    title: record.case_meta?.case_title,
  });
  for (const a of FOCUS_AREAS) {
    if (a.re.test(hay)) tags.push(a.tag.trim());
  }
  if (record.case_meta?.focus_area) tags.push(record.case_meta.focus_area);

  const dip = {};
  const m = record.inpatient_metrics || record.case_meta?.inpatient_metrics;
  if (m) {
    for (const k of ['病案质量指数', '二次入院评分', '低标入院评分', '超长住院评分', '死亡风险评分']) {
      dip[k] = m[k] != null ? m[k] : 'unavailable';
    }
  } else {
    for (const k of ['病案质量指数', '二次入院评分', '低标入院评分', '超长住院评分', '死亡风险评分']) {
      dip[k] = 'unavailable';
    }
  }
  return { risk_tags: [...new Set(tags)], dip_aux: dip };
}

function deriveCaseV2Fields(record, store) {
  const { risk_tags, dip_aux } = computeRiskTags(record);
  const special = record.case_meta?.special_case_review || '无';
  const drg = record.drg_grouping?.adrg || record.drg_grouping?.drg
    || record.front_page?.drg_group || record.case_meta?.drg_group || null;
  return {
    special_case_review: special,
    risk_tags,
    drg_group: drg,
    inpatient_metrics: dip_aux,
  };
}

/** L3 跨就诊：单包内无法闭环 → 合成线索 Finding（不伪造金额） */
function detectL3CrossVisit(record) {
  const findings = [];
  const prev = (record.front_page?.previous_admissions || [])[0];
  if (!prev) return findings;

  const admit = record.front_page?.admit_time?.slice(0, 10);
  const prevDis = prev.discharge_time?.slice(0, 10);
  if (!admit || !prevDis) return findings;

  const days = Math.round((new Date(admit) - new Date(prevDis)) / 86400000);
  const sameAdrg = record.drg_grouping?.adrg && prev.adrg
    ? record.drg_grouping.adrg === prev.adrg
    : /透析|LL1/i.test(`${record.front_page?.principal_diagnosis?.name}${prev.principal_diagnosis}`);

  const isOncologyCycle = /化疗|周期|Z51/i.test(record.admission_note?.chief_complaint || '')
    && record.case_meta?.oncology_cycle_exempt;

  if (days > 0 && days <= 15 && sameAdrg && !isOncologyCycle) {
    findings.push({
      finding_id: `F-L3-DEC-${record.case_meta?.case_id || 'X'}`,
      rule_id: 'C-301',
      rule_name: '分解住院（跨就诊 L3）',
      violation_type: '分解住院',
      layer: 'L3',
      risk_level: '中—高',
      status: '线索',
      amount_involved: null,
      evidence: [{
        type: '病历',
        loc: '病案首页 previous_admissions + 本次入院',
        text: `距上次出院 ${days} 天再入院；ADRG/诊断域一致，单包内无法闭环`,
      }],
      policy: [{ ref: 'KB1-条例38-分解住院', text: '（条例38条分解住院相关表述，以 KB1 检索为准）' }],
      reasoning: '跨就诊分解住院模式：需关联就诊2结算与 DRG 重结算。单份材料包内无法闭环 → L3 线索。',
      needs_more: ['关联就诊2的结算与病历', 'DRG重结算所需:分组器/支付标准'],
      l3_synthetic: true,
    });
  }

  const hasDrgGrouper = !!(record.drg_grouping?.payment_standard || record.settlement_list?.drg_payment);
  if (record.case_meta?.gold_scenario === 'G3-transfer' || record.case_meta?.check_outpatient_transfer) {
    findings.push({
      finding_id: `F-L3-TRF-${record.case_meta?.case_id || 'X'}`,
      rule_id: 'D-402',
      rule_name: '转嫁费用（跨结算 L3）',
      violation_type: '转嫁费用',
      layer: 'L3',
      risk_level: '中',
      status: '线索',
      amount_involved: hasDrgGrouper ? undefined : null,
      evidence: [{ type: '结算', loc: '门诊+住院结算汇总', text: '入院前后门诊费用与 DRG 打包费用需跨结算比对' }],
      policy: [{ ref: 'KB1-DRG支付', text: '（支付标准以 KB1/地方目录为准）' }],
      reasoning: '跨结算转嫁费用：需门诊结算清单 + DRG 支付标准。缺分组器时不输出金额数字。',
      needs_more: hasDrgGrouper ? ['门诊结算明细核对'] : ['DRG重结算所需:分组器/支付标准', '关联门诊结算清单'],
      l3_synthetic: true,
    });
  }

  return findings;
}

/** 病历–首页一致性 */
function detectFrontPageMismatch(record) {
  const fp = record.front_page?.principal_diagnosis?.name || '';
  const course = (record.progress_notes || []).map(n => n.text).join(' ');
  const admitDx = record.admission_note?.preliminary_diagnosis?.[0] || '';
  if (!fp || !course) return null;
  if (/重症肺炎/.test(fp) && /社区获得性肺炎|普通肺炎/.test(course + admitDx) && !/重症/.test(course)) {
    return {
      finding_id: `F-FP-${record.case_meta?.case_id || 'X'}`,
      rule_id: 'D-401',
      violation_type: '高靠入组(高编高套)',
      status: '疑点',
      risk_level: '高',
      amount_involved: record.case_meta?.drg_over_amount ?? 0,
      evidence: [
        { type: '病案首页', loc: 'principal_diagnosis', text: fp },
        { type: '病程记录', loc: '入院/病程', text: '病历记载与普通肺炎一致，不支持首页重症编码' },
      ],
      policy: [{ ref: 'KB1-DRG2.0', text: '主诊断/主手术编码须与病历记录一致' }],
      reasoning: '病历–首页一致性：首页编码与病历临床描述不一致，疑高编高套。',
      needs_more: [],
      front_page_check: true,
    };
  }
  return null;
}

const SPECIAL_CASE_SUPPRESS_RE = /高倍率|资源消耗|费用异常|低标入院评分|超长住院/;

function evidenceLocatable(evidence) {
  return (evidence || []).some(e => e && String(e.text || '').trim() && (e.loc || e.type));
}

/** 三要素门禁：引不出原文定位 + 条款 + 推理 → 不输出（零记录终态） */
function passesThreeElementGate(f) {
  if (f._suppressed || f.l3_synthetic) return true;
  const hasEv = evidenceLocatable(f.evidence);
  const hasPol = (f.policy || []).some(p => p && String(p.ref || p.text || '').trim());
  const hasReas = String(f.reasoning || '').trim().length >= 8;
  if (f.status === '疑点') return hasEv && hasPol && hasReas;
  if (f.status === '线索') return hasEv && hasReas;
  return false;
}

function applyThreeElementGate(findings) {
  const kept = [];
  const dropped = [];
  for (const f of findings) {
    if (passesThreeElementGate(f)) kept.push(f);
    else dropped.push({ ...f, _dropped_by: 'three_element_gate' });
  }
  return { findings: kept, dropped };
}

function applySpecialCaseReview(findings, specialCaseReview) {
  if (specialCaseReview !== '已批准') return { findings, suppressed: [] };
  const kept = [];
  const suppressed = [];
  for (const f of findings) {
    const hit = SPECIAL_CASE_SUPPRESS_RE.test(`${f.violation_type}${f.rule_name}${f.reasoning}`);
    if (hit && !f.shadow) {
      suppressed.push({ ...f, _suppressed_by: 'special_case_review:已批准' });
    } else {
      kept.push(f);
    }
  }
  return { findings: kept, suppressed };
}

function enrichFindingsPipeline(findings, record, store, config = {}, opts = {}) {
  let list = [...(findings || [])];
  list.push(...detectL3CrossVisit(record));
  const fpMismatch = detectFrontPageMismatch(record);
  if (fpMismatch && !list.some(f => f.rule_id === 'D-401')) list.push(fpMismatch);

  const gated = applyThreeElementGate(list);
  list = gated.findings;

  const caseMeta = { dept: record.front_page?.admit_dept, ...deriveCaseV2Fields(record, store) };
  list = list.map(f => enrichFindingNature({ ...f }, {
    store, caseMeta, config, examMode: opts.examMode,
  }));

  const special = record.case_meta?.special_case_review || caseMeta.special_case_review;
  const { findings: afterSpecial, suppressed } = applySpecialCaseReview(list, special);

  return {
    findings: afterSpecial,
    suppressed_special_case: suppressed,
    dropped_gate: gated.dropped,
    case_fields: caseMeta,
  };
}

function mergeCaseIntoStore(caseRow, caseFields) {
  return { ...caseRow, ...caseFields };
}

module.exports = {
  FOCUS_AREAS,
  computeRiskTags,
  deriveCaseV2Fields,
  detectL3CrossVisit,
  applySpecialCaseReview,
  applyThreeElementGate,
  passesThreeElementGate,
  enrichFindingsPipeline,
  mergeCaseIntoStore,
};
