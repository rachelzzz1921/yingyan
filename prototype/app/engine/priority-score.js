'use strict';

/**
 * 综合稽核优先指数（Audit Priority Index, api_score）
 * 对齐《鹰眼-稽核优先通路-构建prompt.md》§3
 */

const { natureSevBoost } = require('./priority-nature');
const { NATURE_RANK, caseNature } = require('./nature');

const DEFAULT_CONFIG = {
  W_CLUE: 0.4,
  AMT_CAP: 100000,
  beta: 0.5,
  gamma: 0.3,
  delta: 0.2,
  R_REF: 5,
  core_mode: 'geometric',
  w1: 0.34,
  w2: 0.33,
  w3: 0.33,
  epsilon: 0.01,
  specialty_weight: 0.15,
  nature_sev_enabled: true,
};

const RISK_SEV = {
  高: 1.0,
  '中—高': 0.75,
  '中-高': 0.75,
  中: 0.5,
  低: 0.25,
};

function clip(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function activeFindings(findings) {
  return (findings || []).filter(f => !f.shadow);
}

function shadowFindings(findings) {
  return (findings || []).filter(f => f.shadow);
}

function tierForActive(active) {
  if (!active.length) return 3;
  if (active.some(f => f.status === '疑点')) return 1;
  return 2;
}

function weightForStatus(status, W_CLUE) {
  return status === '疑点' ? 1.0 : W_CLUE;
}

function sevForRisk(riskLevel) {
  return RISK_SEV[riskLevel] ?? 0.5;
}

function article40Boost(violationType) {
  const t = violationType || '';
  if (/欺诈骗保|虚构医药服务|伪造|变造/.test(t)) return 0.15;
  return 0;
}

function computeEC(active, cfg) {
  if (!active.length) return 0;
  let num = 0;
  let den = 0;
  const eps = cfg.epsilon ?? 0.01;
  for (const f of active) {
    const amt = Math.max(Number(f.amount_involved) || 0, eps);
    const w = weightForStatus(f.status, cfg.W_CLUE);
    num += w * amt;
    den += amt;
  }
  return den > 0 ? num / den : 0;
}

function computeAMT(S, cfg) {
  const cap = cfg.AMT_CAP ?? 100000;
  if (S <= 0) return 0;
  return clip(Math.log(1 + S) / Math.log(1 + cap), 0, 1);
}

function computeSEV(active, cfg) {
  if (!active.length) return 0;
  let maxSev = 0;
  let weighted = 0;
  let totalAmt = 0;
  const eps = 0.01;
  const useNature = cfg.nature_sev_enabled !== false;
  for (const f of active) {
    const base = sevForRisk(f.risk_level);
    let sev = Math.min(1, base + article40Boost(f.violation_type));
    if (useNature) sev = Math.min(1, sev + natureSevBoost(f.violation_nature));
    maxSev = Math.max(maxSev, sev);
    const amt = Math.max(Number(f.amount_involved) || 0, eps);
    weighted += sev * amt;
    totalAmt += amt;
  }
  const avg = totalAmt > 0 ? weighted / totalAmt : 0;
  return 0.6 * maxSev + 0.4 * avg;
}

function computeSpecialtyBoost(riskTags, cfg) {
  if (!riskTags?.length) return 1;
  const w = cfg.specialty_weight ?? 0.15;
  return 1 + w * clip(riskTags.length / 3, 0, 1);
}

function computeCore(ec, amt, sev, cfg) {
  if (cfg.core_mode === 'weighted') {
    const w1 = cfg.w1 ?? 0.34;
    const w2 = cfg.w2 ?? 0.33;
    const w3 = cfg.w3 ?? 0.33;
    return w1 * ec + w2 * amt + w3 * sev;
  }
  const product = ec * amt * sev;
  if (product <= 0) return 0;
  return Math.pow(product, 1 / 3);
}

function distinctRuleIds(active) {
  return new Set(active.map(f => f.rule_id).filter(Boolean));
}

function computeHistoryPrior(H, cfg) {
  const h = clip(H ?? 0, 0, 1);
  return 1 + (cfg.beta ?? 0.5) * h;
}

function computeBreadth(active, cfg) {
  const n = distinctRuleIds(active).size;
  const ref = cfg.R_REF ?? 5;
  const ratio = clip(n / ref, 0, 1);
  return 1 + (cfg.gamma ?? 0.3) * ratio;
}

function isOutlier(S, peerAmounts, cfg) {
  if (!peerAmounts.length || S <= 0) return false;
  const sorted = [...peerAmounts].sort((a, b) => a - b);
  const p95Idx = Math.floor(0.95 * (sorted.length - 1));
  const p95 = sorted[p95Idx] ?? sorted[sorted.length - 1];
  const mean = peerAmounts.reduce((a, b) => a + b, 0) / peerAmounts.length;
  const variance = peerAmounts.reduce((s, v) => s + (v - mean) ** 2, 0) / peerAmounts.length;
  const sigma = Math.sqrt(variance);
  return S > p95 || S > mean + 2 * sigma;
}

function computeOutlier(S, peerAmounts, cfg, specialCaseReview) {
  if (specialCaseReview === '已批准') {
    return { multiplier: 1, suppressed: true };
  }
  const mult = isOutlier(S, peerAmounts, cfg) ? 1 + (cfg.delta ?? 0.2) : 1;
  return { multiplier: mult, suppressed: false };
}

/**
 * @param {object} input
 * @param {object[]} input.findings
 * @param {object} input.history - { patient, dept, doctor } hit rates 0..1
 * @param {number} input.peerAmounts - same dept peer suspected amounts
 * @param {string[]} [input.risk_tags]
 * @param {string} [input.special_case_review]
 */
function scoreCase(input) {
  const cfg = { ...DEFAULT_CONFIG, ...(input.config || {}) };
  const all = input.findings || [];
  const active = activeFindings(all);
  const shadowed = shadowFindings(all);
  const tier = tierForActive(active);

  const S = active.reduce((s, f) => s + (Number(f.amount_involved) || 0), 0);
  const suspected = active.filter(f => f.status === '疑点');
  const clues = active.filter(f => f.status === '线索');

  const nature = caseNature(all); // 三档(Q4):UI 第一层级,排序第一键

  if (!active.length) {
    const outlierResult = computeOutlier(0, input.peerAmounts || [], cfg, input.special_case_review);
    return {
      tier,
      nature,
      api_score: 0,
      breakdown: {
        ec: 0, amt: 0, sev: 0, core: 0,
        hist_prior: 1, breadth: 1, outlier: outlierResult.multiplier,
        outlier_suppressed: outlierResult.suppressed,
        specialty: computeSpecialtyBoost(input.risk_tags, cfg),
        S: 0, active_count: 0,
      },
      suspected_count: 0,
      suspected_amount: 0,
      clue_count: 0,
      shadow_count: shadowed.length,
      shadow_amount: shadowed.reduce((s, f) => s + (Number(f.amount_involved) || 0), 0),
      top_violation: null,
    };
  }

  const ec = computeEC(active, cfg);
  const amt = computeAMT(S, cfg);
  const sev = computeSEV(active, cfg);
  const core = computeCore(ec, amt, sev, cfg);

  const hist = input.history || {};
  const H = Math.max(hist.patient ?? 0, hist.dept ?? 0, hist.doctor ?? 0, hist.drg_group ?? 0);
  const histPrior = computeHistoryPrior(H, cfg);
  const breadth = computeBreadth(active, cfg);
  const outlierResult = computeOutlier(S, input.peerAmounts || [], cfg, input.special_case_review);
  const outlier = outlierResult.multiplier;
  const specialty = computeSpecialtyBoost(input.risk_tags, cfg);

  const apiScore = Math.round(100 * core * histPrior * breadth * outlier * specialty * 10) / 10;

  const top = [...active].sort((a, b) => (b.amount_involved || 0) - (a.amount_involved || 0))[0];

  return {
    tier,
    nature,
    api_score: apiScore,
    breakdown: {
      ec: Math.round(ec * 1000) / 1000,
      amt: Math.round(amt * 1000) / 1000,
      sev: Math.round(sev * 1000) / 1000,
      core: Math.round(core * 1000) / 1000,
      hist_prior: Math.round(histPrior * 1000) / 1000,
      breadth: Math.round(breadth * 1000) / 1000,
      outlier: Math.round(outlier * 1000) / 1000,
      outlier_suppressed: outlierResult.suppressed,
      specialty: Math.round(specialty * 1000) / 1000,
      H: Math.round(H * 1000) / 1000,
      S: Math.round(S * 100) / 100,
      active_count: active.length,
      distinct_rules: distinctRuleIds(active).size,
    },
    suspected_count: suspected.length,
    suspected_amount: Math.round(suspected.reduce((s, f) => s + (Number(f.amount_involved) || 0), 0) * 100) / 100,
    clue_count: clues.length,
    shadow_count: shadowed.length,
    shadow_amount: Math.round(shadowed.reduce((s, f) => s + (Number(f.amount_involved) || 0), 0) * 100) / 100,
    top_violation: top ? {
      rule_id: top.rule_id,
      violation_type: top.violation_type,
      status: top.status,
      amount_involved: top.amount_involved,
    } : null,
    config_snapshot: { ...cfg },
    computed_at: new Date().toISOString(),
  };
}

function sortRanked(items) {
  return [...items].sort((a, b) => {
    const nr = (NATURE_RANK[a.nature] ?? 1) - (NATURE_RANK[b.nature] ?? 1);
    if (nr !== 0) return nr; // 三档第一键:明确违规 > 可疑 > 干净
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (b.api_score !== a.api_score) return b.api_score - a.api_score;
    return (b.breakdown?.S || 0) - (a.breakdown?.S || 0);
  });
}

module.exports = {
  DEFAULT_CONFIG,
  activeFindings,
  shadowFindings,
  scoreCase,
  sortRanked,
  tierForActive,
};
