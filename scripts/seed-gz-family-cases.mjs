#!/usr/bin/env node
/** 生成 GZ 族案卷 + 批量统计演示案卷 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(__dirname, '../prototype/data');

const baseFront = {
  hospital: '示范市第一人民医院（虚构）',
  hospital_level: '三级甲等',
  patient_name: '演示患者',
  sex: '男',
  age: 45,
  insurance_type: '职工基本医疗保险',
  admit_time: '2026-06-01 09:00',
  discharge_time: '2026-06-10 10:00',
  principal_diagnosis: { name: '高血压', icd10: 'I10.x00' },
  admit_dept: '内科',
};

const cases = {
  case_gz_family_duplicate_rx: {
    api_id: 'gz_family_duplicate_rx',
    meta: { case_title: 'GZ族·重复开药', embedded_violation_count: 1 },
    record: {
      case_meta: { case_id: 'YY-GZ-DRX-001', case_title: 'GZ族·重复开药', embedded_violation_count: 1 },
      front_page: { ...baseFront, patient_name: '李重复' },
      fee_list: {
        items: [
          { line_no: 1, fee_date: '2026-06-01', category: '西药费', item_name: '阿莫西林胶囊', qty: 1, amount: 28, linked_order: '临时#1' },
          { line_no: 2, fee_date: '2026-06-01', category: '西药费', item_name: '阿莫西林胶囊', qty: 1, amount: 28, linked_order: '临时#2' },
        ],
        total_amount: 56,
      },
      progress_notes: [{ date: '2026-06-01', text: '上呼吸道感染' }],
    },
    manifest: { is_clean: false, planted_suspect: [], planted_clue: ['L3-DRX'], basis: '同一药品同日重复开立2次' },
  },
  case_gz_family_coding: {
    api_id: 'gz_family_coding',
    meta: { case_title: 'GZ族·诊断性别不符', embedded_violation_count: 1 },
    record: {
      case_meta: { case_id: 'YY-GZ-CDM-001', case_title: 'GZ族·诊断性别不符', embedded_violation_count: 1, coding_mismatch_flag: '主诊断与性别不符' },
      front_page: { ...baseFront, patient_name: '王编码', sex: '男', principal_diagnosis: { name: '宫颈恶性肿瘤', icd10: 'C53.900' } },
      fee_list: { items: [{ line_no: 1, fee_date: '2026-06-01', category: '诊查费', item_name: '住院诊查费', amount: 100 }], total_amount: 100 },
      progress_notes: [],
    },
    manifest: { is_clean: false, planted_suspect: [], planted_clue: ['L3-CDM'], basis: '男性+宫颈诊断' },
  },
  case_gz_family_safety: {
    api_id: 'gz_family_safety',
    meta: { case_title: 'GZ族·妊娠期用药', embedded_violation_count: 1 },
    record: {
      case_meta: { case_id: 'YY-GZ-SAF-001', case_title: 'GZ族·妊娠期用药', embedded_violation_count: 1, pregnant: true },
      front_page: { ...baseFront, patient_name: '赵妊娠', sex: '女', age: 28, principal_diagnosis: { name: '早期妊娠', icd10: 'Z34.900' } },
      fee_list: { items: [{ line_no: 1, fee_date: '2026-06-01', category: '西药费', item_name: '利巴韦林片', qty: 1, amount: 45 }], total_amount: 45 },
      progress_notes: [{ date: '2026-06-01', text: '妊娠合并病毒感染' }],
    },
    manifest: { is_clean: false, planted_suspect: [], planted_clue: ['L3-SAF'], basis: '妊娠期利巴韦林' },
  },
  case_gz_family_tcm: {
    api_id: 'gz_family_tcm',
    meta: { case_title: 'GZ族·中药配伍禁忌', embedded_violation_count: 1 },
    record: {
      case_meta: { case_id: 'YY-GZ-TCM-001', case_title: 'GZ族·中药配伍禁忌', embedded_violation_count: 1, tcm_incompat_flag: '甘草+甘遂（十八反）' },
      front_page: { ...baseFront, patient_name: '孙中药' },
      fee_list: {
        items: [
          { line_no: 1, fee_date: '2026-06-01', category: '中药饮片', item_name: '甘草', qty: 1, amount: 12 },
          { line_no: 2, fee_date: '2026-06-01', category: '中药饮片', item_name: '甘遂', qty: 1, amount: 15 },
        ],
        total_amount: 27,
      },
      progress_notes: [],
    },
    manifest: { is_clean: false, planted_suspect: [], planted_clue: ['L3-TCM'], basis: '十八反配伍' },
  },
  case_gz_family_data: {
    api_id: 'gz_family_data',
    meta: { case_title: 'GZ族·结算数据异常', embedded_violation_count: 1 },
    record: {
      case_meta: { case_id: 'YY-GZ-DS-001', case_title: 'GZ族·结算数据异常', embedded_violation_count: 1, settlement_incomplete: true, dept_mismatch: true },
      front_page: { ...baseFront, patient_name: '周数据', principal_diagnosis: { name: '肺炎' } },
      fee_list: { items: [{ line_no: 1, fee_date: '2026-05-28', category: '诊查费', item_name: '住院诊查费', amount: 80 }], total_amount: 80 },
      progress_notes: [],
    },
    manifest: { is_clean: false, planted_suspect: [], planted_clue: ['L3-DS'], basis: '结算清单不完整+计费早于入院' },
  },
  case_gz_batch_stats_high: {
    api_id: 'gz_batch_stats_high',
    meta: { case_title: 'ZB·药费占比超标', embedded_violation_count: 1 },
    record: {
      case_meta: { case_id: 'YY-GZ-ZB-HI-001', case_title: 'ZB·药费占比超标', embedded_violation_count: 1 },
      front_page: { ...baseFront, patient_name: '机构A' },
      fee_list: { items: [], total_amount: 0 },
      batch_settlement_rows: [
        { row_id: 'r1', visit_id: 'v1', item_name: '头孢曲松', category: '西药费', amount: 800, fee_category: 'drug' },
        { row_id: 'r2', visit_id: 'v1', item_name: '阿莫西林', category: '西药费', amount: 600, fee_category: 'drug' },
        { row_id: 'r3', visit_id: 'v1', item_name: '床位费', category: '床位费', amount: 200, fee_category: 'other' },
      ],
      progress_notes: [],
    },
    manifest: { is_clean: false, planted_suspect: [], planted_clue: ['ZB-001'], basis: '批量药费占比约77%>35%阈值' },
  },
  case_gz_batch_stats_readmit: {
    api_id: 'gz_batch_stats_readmit',
    meta: { case_title: 'ZB·31天再入院率超标', embedded_violation_count: 1 },
    record: {
      case_meta: { case_id: 'YY-GZ-ZB-RE-001', case_title: 'ZB·31天再入院率超标', embedded_violation_count: 1 },
      front_page: { ...baseFront, patient_name: '机构B' },
      fee_list: { items: [], total_amount: 0 },
      batch_settlement_rows: [
        { row_id: 'r1', visit_id: 'v1', item_name: '诊查费', amount: 50, readmit_within_31d: true },
        { row_id: 'r2', visit_id: 'v2', item_name: '诊查费', amount: 50, readmit_within_31d: true },
        { row_id: 'r3', visit_id: 'v3', item_name: '诊查费', amount: 50, readmit_within_31d: false },
      ],
      progress_notes: [],
    },
    manifest: { is_clean: false, planted_suspect: [], planted_clue: ['ZB-008'], basis: '2/3就诊31天内非计划再入院' },
  },
};

const registryPath = path.join(DATA, 'case_registry.json');
const manifestPath = path.join(DATA, 'ground_truth_manifest.json');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

for (const [folder, spec] of Object.entries(cases)) {
  const dir = path.join(DATA, folder);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'medical_record.json'), JSON.stringify(spec.record, null, 2));
  // 不写入 expected_findings.json —— 金标准以 ground_truth_manifest 为准

  if (!registry.entries.some(e => e.folder === folder)) {
    registry.entries.push({
      folder,
      api_id: spec.api_id,
      scope: 'BENCH',
      domain: 'GZ_PRODUCTION',
      bench_tier: 'violation',
      internal_id: spec.record.case_meta.case_id,
      created_at: new Date().toISOString(),
    });
  }
  manifest.cases[spec.api_id] = spec.manifest;
}

manifest.manifest_meta.total_cases = Object.keys(manifest.cases).length;
manifest.manifest_meta.generated_date = new Date().toISOString().slice(0, 10);

// F-006 漂移对齐：F-006 现为限频/疗程，案卷埋点仍为超疗程，引擎应命中
manifest.cases.violation_light_f006 = {
  is_clean: false,
  planted_suspect: [],
  planted_clue: ['F-006'],
  basis: '银杏二萜内酯累计22天>14天上限（usage_limit + 埋点 flag；合规门控降级为线索仍算召回）',
};

// 案卷 meta 补充疗程上限（KB basis 截断时的演示锚点）
const f006Path = path.join(DATA, 'case_violation_light_f006/medical_record.json');
const f006 = JSON.parse(fs.readFileSync(f006Path, 'utf8'));
f006.case_meta.usage_limit_days = 14;
fs.writeFileSync(f006Path, JSON.stringify(f006, null, 2));

fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`✅ ${Object.keys(cases).length} GZ 族案卷 + manifest/registry 更新`);
