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
 * @param {object} kb { policyTexts, policyVerified } 取第35/38条真原文与真实核验状态(单一事实源)
 * @returns {object[]} hits(与 /api/precheck 同构)
 */
function detectDrgUpcoding(input = {}, kb = {}) {
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
  const texts = kb.policyTexts || {};
  const verified = kb.policyVerified || {};
  const lb = std.legal_basis || {};
  // 引真实 KB 键、取真原文、按 KB 真实核验状态标注(单一事实源);拿不到 KB 退回数据表摘录
  const polOf = (ref, fallback) => ({ ref, text: (texts[ref] || fallback), verify_status: verified[ref] ? '✅已核验' : '⚠爬虫入库·待人工核' });
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
      ...(loss ? [{ type: '损失测算(鹰眼解读)', loc: `${high.version} · 费率¥${std.base_rate}(虚构演示值)`, text: `按第35条(一)"两病种支付标准差额"落地:(${loss.claimed.weight}−${loss.correct.weight})×${std.base_rate}元/权重 = ${amount}元` }] : []),
    ],
    policy: [
      polOf(lb.article35_ref || 'KB1-实施细则7号令-第35条', (loss && loss.legal_basis) || '实施细则第三十五条·病种付费入组错误损失=两病种支付标准差额'),
      polOf(lb.article38_ref || 'KB1-实施细则7号令-第38条', lb.article38 || '采取高套或低编病种(病组)编码等的,可认定属条例相关情形'),
    ],
    reasoning: `主诊断「${name || icd10}」按重症编码入高权重组 ${high.drg_code}(权重${high.weight}),但编码工作站未标注病历重症依据。若病历不支持,应入 ${base.drg_code}(权重${base.weight})——构成高套病组编码。依实施细则第三十五条(一),损失按"应当编入与实际编入两个病种支付标准的差额"认定 = ${amount}元(鹰眼按演示子集分组方案落地,费率为虚构演示值)。请核实病历(呼吸衰竭/机械通气/感染性休克/ICU 记录)后再提交编码。`,
    disposal_suggestion: `编码软提醒:确认病历支持重症再按 ${high.drg_code} 提交;否则按 ${base.drg_code} 编码。`,
    drg: loss ? { claimed: loss.claimed, correct: loss.correct, loss: amount, version: high.version } : null,
    amount_involved: amount,
  }];
}

module.exports = { detectDrgUpcoding, SEVERE_CODED };
