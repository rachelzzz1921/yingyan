'use strict';

/** violation_type / rule_id → 默认 violation_nature + 处置建议 */

const SUBJECTIVE_PATTERNS = [
  /虚假住院|挂床|空刷|套刷|伪造|变造|倒卖|无资质开展/,
  /欺诈骗保|虚构医药服务/,
];

const OBJECTIVE_PATTERNS = [
  /重复收费|分解收费|超标准收费|串换(?!.*药品倒卖)|编码错误|高编高套|高套分组/,
  /分解住院|转嫁费用|低标入院|服务不足|推诿/,
  /不属于医保基金支付范围|过度诊疗|超量开药/,
];

const DEFAULT_CONFIG_NATURE = {
  repeat_upgrade_threshold: 3,
  repeat_upgrade_window_cases: 10,
};

function defaultNature(violationType, ruleId) {
  const t = `${violationType || ''} ${ruleId || ''}`;
  if (SUBJECTIVE_PATTERNS.some(p => p.test(t))) return '主观嫌疑';
  if (OBJECTIVE_PATTERNS.some(p => p.test(t))) return '非主观差错';
  if (/C-301|C-302|分解|转嫁|跨就诊/.test(t)) return '待定';
  return '非主观差错';
}

function dispositionFor(nature, { examMode = false } = {}) {
  if (examMode) {
    if (nature === '主观嫌疑') return '自查整改建议·院端重点说明并主动退回';
    if (nature === '非主观差错') return '自查整改建议·飞检前主动退回';
    return '自查整改建议·补全材料后复核';
  }
  if (nature === '主观嫌疑') return '处置建议·建议移交骗保/处罚线索';
  if (nature === '非主观差错') return '处置建议·责令退回+限期整改';
  return '处置建议·调阅材料后重判';
}

function natureSevBoost(nature) {
  if (nature === '主观嫌疑') return 0.12;
  return 0;
}

function shouldUpgradeToSubjective(nature, repeatCount, cfg) {
  if (nature !== '非主观差错') return false;
  const th = cfg.repeat_upgrade_threshold ?? DEFAULT_CONFIG_NATURE.repeat_upgrade_threshold;
  return repeatCount >= th;
}

function countRepeatViolations(store, caseMeta, violationType) {
  if (!store?.audit_records?.length || !violationType) return 0;
  const dept = caseMeta?.dept;
  let n = 0;
  for (const ar of store.audit_records) {
    const c = store.cases[ar.case_id];
    if (dept && c?.dept !== dept) continue;
    for (const f of ar.findings_snapshot || []) {
      if (f.violation_type === violationType && f.status !== '线索') n += 1;
    }
  }
  return n;
}

function enrichFindingNature(finding, ctx = {}) {
  const cfg = { ...DEFAULT_CONFIG_NATURE, ...(ctx.config || {}) };
  let nature = finding.violation_nature || defaultNature(finding.violation_type, finding.rule_id);
  const repeats = countRepeatViolations(ctx.store, ctx.caseMeta, finding.violation_type);
  if (shouldUpgradeToSubjective(nature, repeats, cfg)) {
    nature = '主观嫌疑';
    finding.nature_upgraded = true;
    finding.nature_upgrade_reason = `同科室同类违规历史命中 ${repeats} 次 ≥ 阈值 ${cfg.repeat_upgrade_threshold}`;
  }
  finding.violation_nature = nature;
  finding.disposition_suggestion = finding.disposition_suggestion
    || dispositionFor(nature, { examMode: ctx.examMode });
  return finding;
}

module.exports = {
  DEFAULT_CONFIG_NATURE,
  defaultNature,
  dispositionFor,
  natureSevBoost,
  enrichFindingNature,
  countRepeatViolations,
};
