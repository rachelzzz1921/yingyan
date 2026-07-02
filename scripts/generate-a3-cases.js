#!/usr/bin/env node
'use strict';
/**
 * 赛前A3 埋点案卷生成(2026-07-02)
 * ① 新建 case_violation_light_age:16岁肺炎患者——AGE-101(左氧氟沙星18岁以下禁用,答疑亲口例)
 *    + NUR-303(护理计费8日>护理记录5日,仿四川四院曝光案)
 * ② 对受影响案卷(新案卷 + 改动过的 case_pharmacy)重生成 Oracle 金标准 expected_findings.json
 * 刻意不跑全量 generate-bench-20.js,避免覆盖其后手工调整过的案卷。
 */
const fs = require('fs');
const path = require('path');
const { runAudit } = require('../prototype/app/engine/audit-engine');
const { loadJsonKB } = require('../prototype/app/kb/retrieval');
const { registerExisting } = require('../prototype/app/engine/case-id');

const DATA = path.join(__dirname, '../prototype/data');
const maps = loadJsonKB(DATA);
const rules = JSON.parse(fs.readFileSync(path.join(DATA, 'rules/rules.json'), 'utf8')).rules;
const clone = (o) => JSON.parse(JSON.stringify(o));

// ---------- ① case_violation_light_age ----------
const base = JSON.parse(fs.readFileSync(path.join(DATA, 'case_clean/medical_record.json'), 'utf8'));
const r = clone(base);
r.case_meta = {
  case_id: 'YY-BENCH-VIOL-AGE-001',
  internal_id: 'YY-BENCH-VIOL-AGE-001',
  case_title: '轻量违规·未成年用药年龄分层(AGE-101)+护理天数虚记(NUR-303)',
  disclaimer: '虚构数据。赛前A3埋点件:16岁社区获得性肺炎患者使用左氧氟沙星(喹诺酮类18岁以下禁用,两库14/18两档年龄分层)+护理费按8日计费而护理记录仅5日(仿四川省第四人民医院曝光案)。',
  embedded_violation_count: 2,
  distractor_count: 0,
  specialty: '呼吸内科',
  settlement_summary: { total_amount: 711, insurance_paid_amount: 711, currency: 'CNY', settle_type: '住院·按项目付费' },
};
r.front_page = {
  ...r.front_page,
  patient_name: '王小雨', sex: '女', age: 16, birth_date: '2010-03-15',
  insurance_type: '城乡居民基本医疗保险',
  admission_no: 'ZY20260511-0208',
  admit_time: '2026-05-11 10:00', discharge_time: '2026-05-16 10:00',
  actual_inpatient_days: 5,
  admit_dept: '呼吸内科', bed_no: '呼吸内科-12床',
  principal_diagnosis: { name: '社区获得性肺炎', icd10: 'J15.900' },
  other_diagnosis: [],
  previous_admissions: [],
};
r.admission_note = {
  doc_type: '入院记录', record_time: '2026-05-11 11:00',
  chief_complaint: '发热咳嗽5天。',
  present_illness: '患者16岁,5天前受凉后发热(最高38.9℃)伴咳嗽咳痰,门诊胸片示右下肺炎症,收入院。',
  past_history: '无特殊。否认药物过敏史。',
  physical_exam: 'T38.2 P96 R20 BP110/70。右下肺可闻及湿啰音。',
  preliminary_diagnosis: ['社区获得性肺炎'],
  treatment_plan: '抗感染、对症支持治疗。',
};
r.progress_notes = [
  { date: '2026-05-12', text: '患者体温较前下降,咳嗽减轻,继续抗感染治疗。' },
  { date: '2026-05-15', text: '体温正常3天,复查血常规正常,明日出院。' },
];
r.discharge_summary = {
  doc_type: '出院小结', discharge_time: '2026-05-16 10:00',
  admission_diagnosis: '社区获得性肺炎',
  discharge_diagnosis: '社区获得性肺炎(好转)',
  treatment_course: '入院后予左氧氟沙星氯化钠注射液抗感染5天,体温正常,咳嗽好转,准予出院。',
  discharge_order: '院外休息1周,不适随诊。',
};
// 清掉肿瘤相关单据(克隆自 NSCLC 干净件)
r.pathology_report = {};
r.gene_test_report = {};
r.lab_reports = [
  { doc_type: '检验报告', name: '血常规', date: '2026-05-11', summary: 'WBC 12.3×10^9/L,中性粒细胞 82%(感染像)' },
  { doc_type: '检验报告', name: '血常规(复查)', date: '2026-05-15', summary: 'WBC 7.1×10^9/L,正常' },
];
r.long_term_orders = { doc_type: '长期医嘱单', items: [
  { order_id: 'L01', start: '2026-05-11', stop: '2026-05-16', content: '呼吸内科护理常规' },
  { order_id: 'L02', start: '2026-05-11', stop: '2026-05-16', content: '二级护理' },
  { order_id: 'L03', start: '2026-05-11', stop: '2026-05-16', content: '左氧氟沙星氯化钠注射液 0.5g + 0.9%氯化钠100ml ivgtt qd' },
] };
r.temporary_orders = { doc_type: '临时医嘱单', items: [
  { order_id: 'T01', date: '2026-05-11', content: '血常规' },
  { order_id: 'T02', date: '2026-05-15', content: '血常规(复查)' },
] };
r.nursing_records = {
  doc_type: '护理记录单',
  nursing_level_executed: '二级护理(实际记录执行5日:05-11~05-15,巡视2小时/次)',
  days_documented: 5,
  note: '护理记录单逐日记录,共5日——费用清单护理费按8日计费,超出3日(NUR-303埋点)。',
  entries: [
    { date: '2026-05-11', round_interval_h: 2, note: '入院评估,二级护理' },
    { date: '2026-05-13', round_interval_h: 2, note: '体温下降,继续二级护理' },
    { date: '2026-05-15', round_interval_h: 2, note: '体温正常,准备出院' },
  ],
};
r.imaging_record = { doc_type: '影像记录', items: [{ name: '胸部X线片', date: '2026-05-11', finding: '右下肺片状渗出影' }] };
r.icu_record = null;
r.operation_note = null;
r.anesthesia_record = null;
r.fee_list = {
  doc_type: '住院费用清单', settle_date: '2026-05-16',
  items: [
    { line_no: 1, fee_date: '2026-05-11~05-15', category: '床位费', item_name: '床位费（三人间）', qty: 5, unit: '日', unit_price: 50.0, amount: 250.0, insurance_class: '医保甲', linked_order: 'L01' },
    { line_no: 2, fee_date: '2026-05-11~05-16', category: '护理费', item_name: '二级护理', qty: 8, unit: '日', unit_price: 12.0, amount: 96.0, insurance_class: '医保甲', linked_order: 'L02', flag: '★计费8日,护理记录实际执行5日→NUR-303(仿四川四院曝光案)' },
    { line_no: 3, fee_date: '2026-05-11~05-15', category: '西药费', item_name: '左氧氟沙星氯化钠注射液', spec: '0.5g:100ml', qty: 5, unit: '袋', unit_price: 28.0, amount: 140.0, insurance_class: '医保甲', linked_order: 'L03', flag: '★患者16岁,喹诺酮类18岁以下禁用→AGE-101(两库14/18两档,答疑亲口例)' },
    { line_no: 4, fee_date: '2026-05-11', category: '检验费', item_name: '血常规', qty: 2, unit: '次', unit_price: 25.0, amount: 50.0, insurance_class: '医保甲', linked_order: 'T01' },
    { line_no: 5, fee_date: '2026-05-11', category: '检查费', item_name: '胸部X线摄影', qty: 1, unit: '次', unit_price: 175.0, amount: 175.0, insurance_class: '医保乙', linked_order: 'T01' },
  ],
  absent_items_note: '埋点2处:第2行护理天数虚记(NUR-303)、第3行未成年喹诺酮(AGE-101)。其余合规。',
  total_amount: 711.0,
};

const folder = 'case_violation_light_age';
fs.mkdirSync(path.join(DATA, folder), { recursive: true });
fs.writeFileSync(path.join(DATA, folder, 'medical_record.json'), JSON.stringify(r, null, 2), 'utf8');
registerExisting({
  internal_id: 'YY-BENCH-VIOL-AGE-001',
  folder,
  api_id: 'violation_light_age',
  scope: 'BENCH',
  domain: 'VIOL-AGE',
  bench_tier: 'violation',
});

// ---------- ② 重生成受影响案卷的 Oracle 金标准 ----------
function writeExpected(caseFolder, record, rep) {
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
  fs.writeFileSync(path.join(DATA, caseFolder, 'expected_findings.json'), JSON.stringify(doc, null, 2), 'utf8');
}

for (const cf of [folder, 'case_pharmacy']) {
  const rec = JSON.parse(fs.readFileSync(path.join(DATA, cf, 'medical_record.json'), 'utf8'));
  const rep = runAudit(rec, rules, { policyTexts: maps.policyTexts, policyVerified: maps.policyVerified });
  writeExpected(cf, rec, rep);
  console.log(cf, '→ 疑点', rep.report_meta.summary.suspected_count, '线索', rep.report_meta.summary.clue_count,
    '规则:', rep.findings.map(f => `${f.rule_id}(${f.status},¥${f.amount_involved})`).join(' '));
}
