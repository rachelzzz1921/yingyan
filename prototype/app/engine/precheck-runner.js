'use strict';

/**
 * 开单事前预检编排 — server /api/precheck 与 YHF G7 门禁共用，避免双处逻辑漂移。
 */
const { runAudit } = require('./audit-engine');
const { detectNative, enrichPrecheckHits, precheckToneForRule } = require('./precheck-native');

const ENGINE_PRECHECK_RULES = new Set(['AGE-101']);
const CHECKED_RULES = ['AGE-101 未成年用药', 'F-001 性别互斥', 'T-201 靶向未检', 'B-201 超限定支付'];

function drugLike(n) {
  return /注射液|注射用|片|胶囊|颗粒|散|口服液|软膏|栓|丸|雾化|滴/.test(n);
}

function buildPseudoRecord(patient, items) {
  return {
    case_meta: { case_id: 'PRECHECK-' + Date.now(), settlement_summary: {} },
    front_page: {
      patient_name: '（开单预检）',
      sex: patient.sex || '',
      age: Number(patient.age),
      principal_diagnosis: {
        name: String(patient.diagnosis || '').replace(/[（(].*$/, ''),
        icd10: (String(patient.diagnosis || '').match(/[A-Z]\d{2}[.\d]*/) || [''])[0],
      },
    },
    fee_list: {
      items: items.map((x, i) => ({
        line_no: i + 1,
        fee_date: new Date().toISOString().slice(0, 10),
        category: drugLike(x.name) ? '西药费' : '检查检验费',
        item_name: x.name,
        qty: Number(x.qty) || 1,
        unit: x.unit || '',
        unit_price: 0,
        amount: 0,
      })),
    },
  };
}

function runPrecheck(patient, items, { rules, policyTexts, policyVerified }) {
  const rulesById = Object.fromEntries(rules.map((r) => [r.rule_id, r]));
  const pseudoRecord = buildPseudoRecord(patient, items);
  const rep = runAudit(pseudoRecord, rules, { policyTexts, policyVerified });
  const engineHits = (rep.findings || [])
    .filter((f) => ENGINE_PRECHECK_RULES.has(f.rule_id))
    .map((f) => ({
      rule_id: f.rule_id,
      rule_name: f.rule_name,
      nature: f.nature,
      status: f.status,
      violation_type: f.violation_type,
      policy: (f.policy || []).slice(0, 3),
      reasoning: f.reasoning,
      disposal_suggestion: f.disposal_suggestion,
      interaction: precheckToneForRule(rulesById, f.rule_id, f.nature),
    }));
  const nativeHits = enrichPrecheckHits(
    detectNative(patient, items, { policyTexts, policyVerified }),
    rulesById,
  );
  const seen = new Set(engineHits.map((h) => h.rule_id + '|' + (h.evidence?.[0]?.text || '')));
  const hits = [
    ...engineHits,
    ...nativeHits.filter((h) => !seen.has(h.rule_id + '|' + (h.evidence?.[0]?.text || ''))),
  ];
  hits.sort((a, b) => (a.nature === '明确违规' ? 0 : 1) - (b.nature === '明确违规' ? 0 : 1));
  return {
    hits,
    clean: hits.length === 0,
    engine: '确定性规则·事前原生·毫秒级·本地',
    checked_rules: CHECKED_RULES,
    checked_rules_count: CHECKED_RULES.length,
    elapsed_ms: 0,
  };
}

module.exports = { runPrecheck, buildPseudoRecord, ENGINE_PRECHECK_RULES, CHECKED_RULES };
