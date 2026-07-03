'use strict';

/**
 * ZB 统计指标监测 — 8 条批量聚合规则（药费/检验/耗材/治疗/CT/MRI占比 + 感染率 + 再入院率）
 */
const fs = require('fs');
const path = require('path');

const FEE_CAT_RULES_PATH = path.join(__dirname, '../../data/code_sets/fee_category_rules.json');
const RUNTIME_STATS_PATH = path.join(__dirname, '../../data/rules/runtime_stats.json');

const ZB_RULES = [
  { rule_id: 'ZB-001', official_code: 'ZB10000205001000', name: '药费占比', category: 'drug', type: 'ratio' },
  { rule_id: 'ZB-002', official_code: 'ZB10000205002000', name: '检验检查占比', category: 'lab', type: 'ratio' },
  { rule_id: 'ZB-003', official_code: 'ZB10000205003000', name: '耗材占比', category: 'consumable', type: 'ratio' },
  { rule_id: 'ZB-004', official_code: 'ZB10000205004000', name: '治疗占比', category: 'treatment', type: 'ratio' },
  { rule_id: 'ZB-005', official_code: 'ZB10000205005000', name: 'CT检查占比', category: 'ct', type: 'ratio' },
  { rule_id: 'ZB-006', official_code: 'ZB10000205006000', name: '核磁检查占比', category: 'mri', type: 'ratio' },
  { rule_id: 'ZB-007', official_code: 'ZB10000205007000', name: '院内感染发生率', category: 'infection', type: 'rate' },
  { rule_id: 'ZB-008', official_code: 'ZB10000205008000', name: '非计划再入院率', category: 'readmit', type: 'rate' },
];

let _catRules = null;

function loadCategoryRules() {
  if (_catRules) return _catRules;
  try {
    _catRules = JSON.parse(fs.readFileSync(FEE_CAT_RULES_PATH, 'utf8'));
  } catch {
    _catRules = { patterns: {} };
  }
  return _catRules;
}

function loadRuntimeStats() {
  try { return JSON.parse(fs.readFileSync(RUNTIME_STATS_PATH, 'utf8')); } catch { return {}; }
}

function classifyRow(row) {
  if (row.fee_category) return row.fee_category;
  const name = String(row.item_name || '');
  const cat = String(row.category || '');
  const p = loadCategoryRules().patterns || {};
  if (p.drug?.test(name, cat)) return 'drug';
  if (p.lab?.test(name, cat)) return 'lab';
  if (p.consumable?.test(name, cat)) return 'consumable';
  if (p.treatment?.test(name, cat)) return 'treatment';
  if (p.ct?.test(name, cat)) return 'ct';
  if (p.mri?.test(name, cat)) return 'mri';
  if (/药|西药|中成药|生物/.test(cat) || /片|胶囊|注射液|颗粒/.test(name)) return 'drug';
  if (/检验|化验|检查/.test(cat) || /CT|MRI|核磁|超声|X线/.test(name)) {
    if (/CT|计算机断层/.test(name)) return 'ct';
    if (/MRI|核磁|磁共振/.test(name)) return 'mri';
    return 'lab';
  }
  if (/耗材|材料/.test(cat)) return 'consumable';
  if (/治疗|理疗|康复/.test(cat)) return 'treatment';
  return 'other';
}

function sumByCategory(rows) {
  const sums = { drug: 0, lab: 0, consumable: 0, treatment: 0, ct: 0, mri: 0, other: 0, total: 0 };
  for (const r of rows) {
    const amt = Number(r.amount) || 0;
    sums.total += amt;
    sums[classifyRow(r)] = (sums[classifyRow(r)] || 0) + amt;
  }
  return sums;
}

function thresholdFor(ruleId, rulesMap) {
  const rule = rulesMap?.[ruleId];
  const rt = loadRuntimeStats()[ruleId.replace('ZB-', 'ZB1000020500')];
  if (rule?.params?.ratio_max != null) return rule.params.ratio_max;
  if (rule?.params?.rate_max != null) return rule.params.rate_max;
  const defaults = { 'ZB-001': 0.35, 'ZB-002': 0.40, 'ZB-003': 0.25, 'ZB-004': 0.45, 'ZB-005': 0.08, 'ZB-006': 0.05, 'ZB-007': 0.05, 'ZB-008': 0.08 };
  return defaults[ruleId] ?? 0.5;
}

function computeVisitStats(rows) {
  const visits = new Map();
  for (const r of rows) {
    const vid = r.visit_id || r.patient_id || r.settle_id || 'default';
    if (!visits.has(vid)) visits.set(vid, []);
    visits.get(vid).push(r);
  }
  let infections = 0;
  let readmits = 0;
  let discharges = 0;
  for (const [, vrows] of visits) {
    discharges += 1;
    if (vrows.some(x => x.infection_flag === true)) infections += 1;
    if (vrows.some(x => x.readmit_within_31d === true)) readmits += 1;
  }
  return { visit_count: discharges, infection_rate: discharges ? infections / discharges : 0, readmit_rate: discharges ? readmits / discharges : 0 };
}

function runStatsMonitoring(rowsIn, rulesMap = {}, mkFinding, ctx) {
  const rows = (rowsIn || []).filter(r => r && typeof r === 'object');
  if (!rows.length) return { metrics: [], findings: [] };
  const sums = sumByCategory(rows);
  const visitStats = computeVisitStats(rows);
  const metrics = [];
  const findings = [];

  for (const zb of ZB_RULES) {
    let value = 0;
    let threshold = thresholdFor(zb.rule_id, rulesMap);
    if (zb.type === 'ratio') {
      value = sums.total > 0 ? (sums[zb.category] || 0) / sums.total : 0;
    } else if (zb.rule_id === 'ZB-007') {
      value = visitStats.infection_rate;
    } else if (zb.rule_id === 'ZB-008') {
      value = visitStats.readmit_rate;
    }
    const exceeded = value > threshold;
    metrics.push({
      rule_id: zb.rule_id,
      official_code: zb.official_code,
      name: zb.name,
      value: Math.round(value * 10000) / 10000,
      threshold,
      exceeded,
      visit_count: visitStats.visit_count,
    });
    if (exceeded && mkFinding && ctx) {
      findings.push(mkFinding(ctx, zb.rule_id, {
        status: '线索',
        risk_level: '中',
        amount_involved: zb.type === 'ratio' ? Math.round((value - threshold) * sums.total * 100) / 100 : 0,
        evidence: [
          { type: '批量指标', loc: '机构结算聚合', text: `${zb.name} = ${(value * 100).toFixed(1)}%（阈值 ${(threshold * 100).toFixed(1)}%）` },
          { type: '样本量', loc: '批量筛查', text: `${rows.length} 行 · ${visitStats.visit_count} 就诊` },
        ],
        reasoning: `机构级${zb.name} ${(value * 100).toFixed(1)}% 超过监测阈值 ${(threshold * 100).toFixed(1)}%——统计指标异常，需人工核实（${zb.official_code}）。`,
        disposal: '建议开展专项核查或约谈机构说明原因。',
        official: { gz_codes: [zb.official_code], tier1: '管理类', tier2: '统计指标监测类' },
      }));
    }
  }
  return { metrics, findings, sums, visit_stats: visitStats };
}

module.exports = {
  ZB_RULES,
  classifyRow,
  sumByCategory,
  runStatsMonitoring,
};
