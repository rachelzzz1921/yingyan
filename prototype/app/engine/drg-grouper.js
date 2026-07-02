'use strict';

/**
 * B2 DRG 分组与第35条损失计算(赛前迭代 Q5 定案)
 * ------------------------------------------------------------
 * 分组器双形态:
 *   ① vendor/opendrg 在库 → 走 OpenDRG 开源分组器(JS版,离线全量分组)
 *   ② 未在库 → 演示子集:透明数据表(drg_payment_standards.json)按主诊断ICD前缀
 *      +重症证据分层,只覆盖演示病种;来源与版本随结果返回,界面如实标注
 * 损失计算(两形态共用):实施细则第35条——
 *   基金损失 = 高套组支付标准 − 实际应入组支付标准;支付标准 = 权重 × 基准费率
 */

const fs = require('fs');
const path = require('path');

const STANDARDS_PATH = path.join(__dirname, '../../data/kb/drg_payment_standards.json');
const VENDOR_DIR = path.join(__dirname, '../../../vendor/opendrg');

let _standards;
function loadStandards() {
  if (!_standards) _standards = JSON.parse(fs.readFileSync(STANDARDS_PATH, 'utf8'));
  return _standards;
}

// vendor OpenDRG 探测(到位即自动切换;拿不到不 throw,退演示子集)
let _openDrg;
function openDrg() {
  if (_openDrg === undefined) {
    try { _openDrg = fs.existsSync(VENDOR_DIR) ? require(VENDOR_DIR) : null; } catch (_) { _openDrg = null; }
  }
  return _openDrg;
}

/** 支付标准 = 权重 × 统筹区基准费率 */
function paymentStandard(drgCode) {
  const std = loadStandards();
  const g = std.groups[drgCode];
  if (!g) return null;
  return {
    drg_code: drgCode, drg_name: g.name, weight: g.weight,
    base_rate: std.base_rate,
    standard: Math.round(g.weight * std.base_rate * 100) / 100,
    version: std.version,
  };
}

/**
 * 分组:输入病案要素 → DRG 组
 * @param {object} c { icd10, severe(重症证据成立?), withCC(伴一般并发症?) }
 * @returns {object|null} { drg_code, drg_name, weight, standard, source, version }
 */
function groupCase(c) {
  const vendor = openDrg();
  if (vendor?.group) {
    try {
      const r = vendor.group(c);
      if (r?.drg_code) return { ...r, source: 'opendrg', version: r.version || 'OpenDRG' };
    } catch (_) { /* vendor 分组失败退演示子集 */ }
  }
  const std = loadStandards();
  const icd = String(c.icd10 || '');
  for (const m of std.adrg_demo_mapping) {
    if (!m.icd_prefix.some(p => icd.startsWith(p))) continue;
    const code = c.severe ? m.severe_group : (c.withCC ? m.cc_group : m.plain_group);
    const ps = paymentStandard(code);
    if (ps) return { ...ps, source: 'demo-subset', version: std.version };
  }
  return null;
}

/**
 * 第35条差额:高套组 vs 实际应入组
 * @returns {object|null} { claimed, correct, loss, formula, legal_basis }
 */
function article35Loss(claimedCode, correctCode) {
  const std = loadStandards();
  const claimed = paymentStandard(claimedCode);
  const correct = paymentStandard(correctCode);
  if (!claimed || !correct) return null;
  const loss = Math.round((claimed.standard - correct.standard) * 100) / 100;
  return {
    claimed, correct, loss,
    formula: `(${claimed.weight} − ${correct.weight}) × ${std.base_rate}元/权重 = ${loss}元`,
    legal_basis: std.legal_basis.article35,
    version: std.version,
    grouper_source: openDrg() ? 'opendrg' : 'demo-subset',
  };
}

module.exports = { groupCase, paymentStandard, article35Loss, loadStandards };
