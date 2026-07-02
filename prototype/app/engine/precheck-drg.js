'use strict';

/**
 * 角色场景②·编码员 DRG 高套事前校验(接入事前提醒闭环)
 * ------------------------------------------------------------
 * 用户:病案编码员;时点:病案首页编码提交前。
 * 判据只依赖编码时点可见输入:主诊断(名+ICD)+ 是否勾选"病历支持重症依据"。
 * 复用 drg-grouper(groupCase + article35Loss,第35条差额)——把 D-401 高套从"事后翻账"
 * 前移到"编码桌当场提醒"。编码高套须核病历,故定"可疑"(留编码员核实/申诉口子),非硬判。
 */

const { groupCase, article35Loss, loadStandards } = require('./drg-grouper');

// 主诊断名里的"重症/伴严重并发症"编码信号(编码员把普通病编成高权重组的痕迹)
const SEVERE_CODED = /重症|伴严重并发症|伴严重合并症|伴重症|伴 ?MCC|脓毒|呼吸衰竭|感染性休克/;

/**
 * @param {object} input { diagnosis, icd10, has_severe_evidence, coded_severe, procedures }
 *   has_severe_evidence: 病历是否支持重症(编码员勾选);coded_severe: 是否显式按重症编码
 * @returns {object[]} hits(与 /api/precheck 同构)
 */
function detectDrgUpcoding(input = {}) {
  const icd10 = String(input.icd10 || '').trim();
  const name = String(input.diagnosis || '');
  const codedSevere = input.coded_severe === true || SEVERE_CODED.test(name);
  const hasEvidence = input.has_severe_evidence === true;

  // 能分组(演示子集覆盖的病种)且按重症编码、但病历无重症依据 → 高套
  const high = groupCase({ icd10, severe: true });
  const base = groupCase({ icd10, severe: false });
  if (!high || !base || high.drg_code === base.drg_code) return []; // 该病种不在演示分组子集/无高低分层
  if (!codedSevere || hasEvidence) return []; // 没按重症编码,或病历确有重症依据 → 不报

  const loss = article35Loss(high.drg_code, base.drg_code);
  const amount = loss ? loss.loss : 0;
  const std = loadStandards();
  return [{
    rule_id: 'D-401',
    rule_name: 'DRG 高套分组(编码事前校验)',
    nature: '可疑',
    status: '线索',
    violation_type: '高套病种(病组)编码',
    evidence: [
      { type: '主诊断编码', loc: '病案首页', text: `「${name || icd10}」按重症编码 → 入 ${high.drg_code} ${high.drg_name}(权重${high.weight})` },
      { type: '病历依据', loc: '编码工作站', text: '未勾选"病历支持重症依据(呼吸衰竭/机械通气/感染性休克/ICU)"' },
      { type: '分组对照', loc: `${high.version}`, text: `若无重症依据应入 ${base.drg_code} ${base.drg_name}(权重${base.weight})` },
      ...(loss ? [{ type: '损失测算', loc: '实施细则第35条', text: `高套差额 = (${loss.claimed.weight}−${loss.correct.weight})×${std.base_rate}元/权重 = ${amount}元` }] : []),
    ],
    policy: [
      { ref: 'KB1-实施细则-第35条', text: (loss && loss.legal_basis) || '按高套病组与实际应入病组支付标准的差额认定基金损失', verify_status: '✅已核验' },
      { ref: 'KB1-实施细则-第23条', text: '采取高套或低编病种(病组)编码等方式的,可认定属条例第38条第(七)项', verify_status: '⚠待核验' },
    ],
    reasoning: `主诊断「${name || icd10}」按重症编码入高权重组 ${high.drg_code}(权重${high.weight}),但编码工作站未标注病历重症依据。若病历不支持,应入 ${base.drg_code}(权重${base.weight})——构成高套病组编码。依实施细则第35条,基金损失按两组支付标准差额认定 = ${amount}元。请核实病历(呼吸衰竭/机械通气/感染性休克/ICU 记录)后再提交编码。`,
    disposal_suggestion: `编码软提醒:确认病历支持重症再按 ${high.drg_code} 提交;否则按 ${base.drg_code} 编码。`,
    drg: loss ? { claimed: loss.claimed, correct: loss.correct, loss: amount } : null,
    amount_involved: amount,
  }];
}

module.exports = { detectDrgUpcoding, SEVERE_CODED };
