// 三档定性(赛前迭代 Q4 定案):明确违规 / 可疑 / 干净
// 与国家两库规则二分同构:政策限定类(明确违规,规则运行结果可直接拦截)
//                      / 合理使用类(可疑,需人工合议、听申诉)。
// 干净 = 无 active 命中,是案卷级档位,不出现在 finding 级。
// 该字段是 UI 信息架构的第一层级,专科/规则类型退居第二层级。

const NATURE = {
  HARD: '明确违规',
  SUSPECT: '可疑',
  CLEAN: '干净',
};

const NATURE_RANK = { [NATURE.HARD]: 0, [NATURE.SUSPECT]: 1, [NATURE.CLEAN]: 2 };

const NATURE_BASIS = {
  [NATURE.HARD]: '政策限定类·硬性字段交叉核验,可直接拦截/责令退回',
  [NATURE.SUSPECT]: '合理使用类·需结合临床合理性合议,应听取申诉',
  [NATURE.CLEAN]: '本次核验各维度未见异常',
};

/**
 * finding 级定档:L1确定性规则产出的"疑点"(硬证据交叉比对)= 明确违规;
 * 其余(L2语义疑点、全部线索、shadow 观察)= 可疑。
 * 已有 f.nature 时尊重之(允许上游/人工改判)。
 */
function findingNature(f) {
  if (!f) return null;
  if (f.nature === NATURE.HARD || f.nature === NATURE.SUSPECT) return f.nature;
  if (f.shadow) return NATURE.SUSPECT;
  const layer = f.layer || f.layer_label || '';
  if (f.status === '疑点' && /^L1/.test(layer)) return NATURE.HARD;
  return NATURE.SUSPECT;
}

/** 案卷级定档:有明确违规 → 明确违规;仅可疑 → 可疑;无 active 命中 → 干净 */
function caseNature(findings) {
  const active = (findings || []).filter(f => f && !f.shadow);
  if (!active.length) return NATURE.CLEAN;
  return active.some(f => findingNature(f) === NATURE.HARD) ? NATURE.HARD : NATURE.SUSPECT;
}

function natureCounts(findings) {
  const counts = { [NATURE.HARD]: 0, [NATURE.SUSPECT]: 0 };
  for (const f of (findings || [])) {
    if (!f || f.shadow) continue;
    counts[findingNature(f)] += 1;
  }
  return counts;
}

module.exports = { NATURE, NATURE_RANK, NATURE_BASIS, findingNature, caseNature, natureCounts };
