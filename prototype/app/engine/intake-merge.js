'use strict';

const { allocateCaseId } = require('./case-id');

function emptyRecord(title) {
  const reg = allocateCaseId({ scope: 'INT', domain: 'UNK', api_id: 'uploaded', bench_tier: null });
  return {
    case_meta: {
      case_id: reg.internal_id,
      internal_id: reg.internal_id,
      pii_token: reg.pii_token,
      case_title: title || '导入材料包',
      embedded_violation_count: 0,
      intake_source: 'batch_drop',
      generated_at: new Date().toISOString(),
    },
    front_page: {
      patient_name: '', admit_time: '', discharge_time: '',
      principal_diagnosis: { name: '', icd10: '' },
    },
    admission_note: {},
    progress_notes: [],
    long_term_orders: { doc_type: '长期医嘱单', items: [] },
    temporary_orders: { doc_type: '临时医嘱单', items: [] },
    nursing_records: { doc_type: '护理记录单', entries: [] },
    lab_reports: [],
    fee_list: { doc_type: '费用清单', items: [] },
    discharge_summary: {},
    intake_files: [],
  };
}

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function mergeDeep(target, source) {
  if (!isPlainObject(source)) return target;
  for (const [k, v] of Object.entries(source)) {
    if (v == null) continue;
    if (Array.isArray(v)) {
      target[k] = (target[k] || []).concat(v);
    } else if (isPlainObject(v)) {
      target[k] = mergeDeep({ ...(target[k] || {}) }, v);
    } else if (target[k] == null || target[k] === '') {
      target[k] = v;
    }
  }
  return target;
}

function mergeSlotFragment(record, slot, fragment, fileMeta) {
  if (!fragment) return record;
  if (slot === 'full_record') {
    mergeDeep(record, fragment);
    return record;
  }
  if (slot === 'orders') {
    if (fragment.long_term_orders) mergeDeep(record.long_term_orders, fragment.long_term_orders);
    if (fragment.temporary_orders) mergeDeep(record.temporary_orders, fragment.temporary_orders);
    if (fragment.items && !fragment.long_term_orders) {
      record.long_term_orders.items = (record.long_term_orders.items || []).concat(fragment.items);
    }
    return record;
  }
  const keyMap = {
    front_page: 'front_page',
    admission_note: 'admission_note',
    progress_notes: 'progress_notes',
    nursing_records: 'nursing_records',
    lab_reports: 'lab_reports',
    operation_note: 'operation_note',
    imaging_record: 'imaging_record',
    anesthesia_record: 'anesthesia_record',
    icu_record: 'icu_record',
    pharmacy_info: 'pharmacy_info',
    pathology_report: 'pathology_report',
    gene_test_report: 'gene_test_report',
    fee_list: 'fee_list',
    discharge_summary: 'discharge_summary',
    // 稽核优先通路一等槽位（v2 真实场景增强）：此前分类器认识但合并不进案卷
    settlement_list: 'settlement_list',
    drg_grouping: 'drg_grouping',
    trace_code: 'trace_code',
    inpatient_metrics: 'inpatient_metrics',
  };
  const key = keyMap[slot];
  if (!key) return record;

  if (slot === 'progress_notes' || slot === 'lab_reports') {
    const arr = Array.isArray(fragment) ? fragment : fragment[slot] || fragment.items;
    if (Array.isArray(arr)) record[key] = (record[key] || []).concat(arr);
    return record;
  }
  if (slot === 'fee_list') {
    const fl = fragment.fee_list || fragment;
    const items = fl.items || (Array.isArray(fragment) ? fragment : []);
    record.fee_list.items = (record.fee_list.items || []).concat(items);
    if (fl.total_amount != null) record.fee_list.total_amount = fl.total_amount;
    if (fl.settle_date) record.fee_list.settle_date = fl.settle_date;
    return record;
  }
  {
    // 通用槽位合并：emptyRecord 未预置的槽位（麻醉/重症/结算清单/DRG/追溯码等）先初始化再合并
    const payload = fragment[key] !== undefined ? fragment[key] : fragment;
    if (record[key] == null) record[key] = Array.isArray(payload) ? [] : {};
    if (Array.isArray(payload)) {
      record[key] = (Array.isArray(record[key]) ? record[key] : []).concat(payload);
    } else if (isPlainObject(payload)) {
      mergeDeep(record[key], payload);
    }
  }

  if (fileMeta) {
    record.intake_files = record.intake_files || [];
    record.intake_files.push(fileMeta);
  }
  return record;
}

function renumberFeeLines(record) {
  const items = record.fee_list?.items || [];
  items.forEach((it, i) => { it.line_no = i + 1; });
  if (items.length && record.fee_list.total_amount == null) {
    record.fee_list.total_amount = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  }
  return record;
}

function finalizeRecord(record) {
  renumberFeeLines(record);
  const fp = record.front_page || {};
  if (fp.patient_name && !record.case_meta.patient_hint) {
    record.case_meta.patient_hint = fp.patient_name;
  }
  if (fp.principal_diagnosis?.name) {
    record.case_meta.case_title = record.case_meta.case_title === '导入材料包'
      ? `${fp.patient_name || '患者'} · ${fp.principal_diagnosis.name}`
      : record.case_meta.case_title;
  }
  return record;
}

function slotFillStatus(record) {
  const filled = [];
  const check = (id, label, tab, ok) => { if (ok) filled.push({ id, label, tab }); };
  check('front_page', '病案首页', 'front', !!(record.front_page?.patient_name || record.front_page?.principal_diagnosis?.name));
  check('admission_note', '入院记录', 'admission', !!(record.admission_note?.chief_complaint || record.admission_note?.present_illness));
  check('progress_notes', '病程记录', 'progress', (record.progress_notes?.length || 0) > 0);
  check('orders', '医嘱单', 'orders', (record.long_term_orders?.items?.length || record.temporary_orders?.items?.length) > 0);
  check('nursing_records', '护理记录', 'nursing', (record.nursing_records?.entries?.length || 0) > 0);
  check('lab_reports', '检验报告', 'lab', (record.lab_reports?.length || 0) > 0);
  check('fee_list', '费用清单', 'fee', (record.fee_list?.items?.length || 0) > 0);
  check('discharge_summary', '出院小结', 'discharge', !!(record.discharge_summary?.hospital_course || record.discharge_summary?.discharge_diagnosis?.length));
  check('operation_note', '手术记录', 'op', !!(record.operation_note?.operation_name));
  check('anesthesia_record', '麻醉记录', 'anes', !!record.anesthesia_record);
  check('icu_record', '重症记录', 'icu', !!record.icu_record);
  check('pharmacy_info', '药店', 'pharm', !!record.pharmacy_info);
  check('pathology_report', '病理', 'path', !!(record.pathology_report?.diagnosis));
  check('gene_test_report', '基因', 'path', !!(record.gene_test_report && record.gene_test_report.status !== '缺失'));
  check('settlement_list', '医保结算清单', 'fee', !!(record.settlement_list && Object.keys(record.settlement_list).length));
  check('drg_grouping', 'DRG/DIP分组', 'front', !!(record.drg_grouping && Object.keys(record.drg_grouping).length));
  check('trace_code', '药品追溯码', 'pharm', !!(record.trace_code && (Array.isArray(record.trace_code) ? record.trace_code.length : Object.keys(record.trace_code).length)));
  check('inpatient_metrics', '住院运行指标', 'front', !!(record.inpatient_metrics && Object.keys(record.inpatient_metrics).length));
  return filled;
}

module.exports = { emptyRecord, mergeSlotFragment, finalizeRecord, slotFillStatus, mergeDeep };
