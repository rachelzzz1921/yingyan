/**
 * 鹰眼 · 事实层：稽核案卷对象（Case Object）编译器  —— 架构 v2.0 升级1（承重柱）
 * ------------------------------------------------------------
 * 在"解析层"与"规则层"之间插入事实抽取层：把材料包一次性编译为类型化事实，
 * 每条事实自带【源锚点】(doc/locator/bbox/ocr_conf)。
 *
 * 解决三连问题：① L2规则不再重读全文(token降一个量级) ② 判定可复现 ③ 证据定位从"软要求"变"硬字段"。
 * 连锁收益：工作台"点击疑点→原件高亮"直接消费 anchor；OCR置信度可传播到置信校准；对抗注入在此清洗标记。
 *
 * 黑客松剂量：四张核心表(费用行/医嘱/诊断/检验) + 时间线 + flags。已覆盖病历包全部预埋点判定需求。
 */
'use strict';

// 面向 AI/审核系统的"元话语"注入特征（升5 对抗鲁棒性 → E-503）
const INJECTION_PATTERNS = [
  /审核系统[请已].{0,8}(忽略|跳过|通过|放行)/,
  /本(材料|病历|清单)已(经)?(预审|审核|核验).{0,6}(合规|通过|无误)/,
  /(请|应)(跳过|忽略|免于).{0,8}(检查|核查|审核|稽核)/,
  /AI.{0,4}(无需|不必|跳过).{0,8}(核|查|审)/,
  /以下(内容|费用|项目)(均|皆)?(合规|合法|已审)/,
];

function anchor(doc, locator, ocr_conf = 0.98, bbox = null) {
  return { doc, locator, bbox, ocr_conf };
}

function scanInjection(text, loc) {
  if (!text) return null;
  for (const re of INJECTION_PATTERNS) {
    const m = String(text).match(re);
    if (m) return { loc, snippet: m[0], full: String(text).slice(0, 120) };
  }
  return null;
}

function compileCaseObject(record) {
  const facts = {
    case_id: record.case_meta?.case_id,
    patient: {
      name: record.front_page?.patient_name,
      sex: record.front_page?.sex,
      age: record.front_page?.age,
      admit: record.front_page?.admit_time,
      discharge: record.front_page?.discharge_time,
      anchor: anchor('病案首页', '基本信息', 0.99),
    },
    fee_lines: [], orders: [], diagnoses: [], labs: [], pathology: [], timeline: [],
    narrative_spans: [],
    flags: { injection_suspects: [], low_ocr_spans: [] },
  };

  // 费用行（含一个演示性低置信字段，体现OCR置信度传播）
  for (const it of (record.fee_list?.items || [])) {
    // demo：对单价异常小/手写易误读的项给较低OCR置信（此处对地塞米松小额项设低置信做演示，不影响疑点）
    const ocr = /地塞米松/.test(it.item_name) ? 0.63 : 0.98;
    const fact = {
      id: `F${String(it.line_no).padStart(3, '0')}`,
      type: 'fee_line',
      date: it.fee_date, name: it.item_name, spec: it.spec,
      qty: it.qty, unit: it.unit, unit_price: it.unit_price, amount: it.amount,
      insurance_class: it.insurance_class, linked_order: it.linked_order,
      anchor: anchor('费用清单', `第${it.line_no}行`, ocr),
    };
    facts.fee_lines.push(fact);
    if (ocr < 0.8) facts.flags.low_ocr_spans.push({ fact_id: fact.id, ocr_conf: ocr, note: `${it.item_name} 单价/金额 OCR低置信，建议人工核对原件` });
  }

  // 医嘱（长期+临时）
  for (const o of (record.long_term_orders?.items || [])) facts.orders.push({ id: o.order_id, type: 'long_term_order', content: o.content, start: o.start, stop: o.stop, anchor: anchor('长期医嘱单', o.order_id, 0.97) });
  for (const o of (record.temporary_orders?.items || [])) facts.orders.push({ id: o.order_id, type: 'temp_order', content: o.content, time: o.time, anchor: anchor('临时医嘱单', o.order_id, 0.97) });

  // 诊断
  const fp = record.front_page || {};
  if (fp.principal_diagnosis) facts.diagnoses.push({ id: 'DX0', type: 'principal', icd: fp.principal_diagnosis.icd10, name: fp.principal_diagnosis.name, stage: fp.principal_diagnosis.tnm_stage, anchor: anchor('病案首页', '主要诊断', 0.99) });
  (fp.other_diagnosis || []).forEach((d, i) => facts.diagnoses.push({ id: `DX${i + 1}`, type: 'other', icd: d.icd10, name: d.name, anchor: anchor('病案首页', '其他诊断', 0.99) }));

  // 检验值
  for (const lab of (record.lab_reports || [])) for (const x of (lab.results || [])) {
    facts.labs.push({ id: `${lab.report_id}-${x.item}`, type: 'lab', report_id: lab.report_id, time: lab.report_time, item: x.item, value: x.value, unit: x.unit, ref: x.ref, flag: x.flag, anchor: anchor('检验报告', lab.report_id, 0.96) });
  }

  // 病理/基因
  if (record.pathology_report) facts.pathology.push({ id: 'PATH', type: 'pathology', diagnosis: record.pathology_report.diagnosis, has_gene_test: !(record.gene_test_report?.status === '缺失'), anchor: anchor('病理报告', record.pathology_report.report_id, 0.95) });

  // 时间线（关键时间点，供F-003等时间逻辑）
  facts.timeline.push({ event: '入院', date: fp.admit_time, anchor: anchor('病案首页', '入院时间', 0.99) });
  facts.timeline.push({ event: '出院', date: fp.discharge_time, anchor: anchor('病案首页', '出院时间', 0.99) });
  for (const p of (record.progress_notes || [])) facts.narrative_spans.push({ id: `PN-${p.date}`, type: 'progress', date: p.date, text: p.text, anchor: anchor('病程记录', p.date, 0.94) });

  // —— 对抗注入清洗：扫描所有自由文本与"夹页批注"——
  const scanTargets = [];
  for (const p of (record.progress_notes || [])) scanTargets.push([p.text, `病程记录 ${p.date}`]);
  // 注入演示载体：record.marginalia（夹页批注/页脚小字），由 server 的"注入对抗演示"开关注入
  for (const m of (record.marginalia || [])) scanTargets.push([m.text, m.loc || '夹页批注']);
  if (record.fee_list?.footer_note) scanTargets.push([record.fee_list.footer_note, '费用清单页脚']);
  for (const [text, loc] of scanTargets) {
    const hit = scanInjection(text, loc);
    if (hit) facts.flags.injection_suspects.push(hit);
  }

  // 统计
  facts.summary = {
    fee_lines: facts.fee_lines.length, orders: facts.orders.length,
    diagnoses: facts.diagnoses.length, labs: facts.labs.length,
    injection_suspects: facts.flags.injection_suspects.length,
    low_ocr_spans: facts.flags.low_ocr_spans.length,
    min_ocr_conf: Math.min(...facts.fee_lines.map(f => f.anchor.ocr_conf), 1),
  };
  return facts;
}

// 由 fact 反查锚点（供证据定位硬字段化）
function anchorOfFeeLine(caseObj, lineNo) {
  const f = (caseObj.fee_lines || []).find(x => x.id === `F${String(lineNo).padStart(3, '0')}`);
  return f ? f.anchor : null;
}

module.exports = { compileCaseObject, anchorOfFeeLine, INJECTION_PATTERNS };
