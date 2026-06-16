'use strict';

const DEFAULT_BUDGET = parseInt(process.env.YINGYAN_CONTEXT_BUDGET || '28000', 10);
const CORE_RULES = ['T-201', 'B-201', 'T-207', 'A-109', 'A-105', 'F-003', 'T-205', 'D-401', 'A-101', 'E-503'];

function jsonLen(obj) {
  return JSON.stringify(obj).length;
}

function truncateJson(obj, maxChars, label) {
  const full = JSON.stringify(obj);
  if (full.length <= maxChars) {
    return { value: obj, chars: full.length, truncated: false, label };
  }
  if (Array.isArray(obj)) {
    const out = [];
    let used = 2;
    for (const item of obj) {
      const piece = JSON.stringify(item);
      if (used + piece.length + 1 > maxChars) break;
      out.push(item);
      used += piece.length + 1;
    }
    out.push({ _truncated: true, _note: `${label} 已截断` });
    return { value: out, chars: jsonLen(out), truncated: true, label };
  }
  return {
    value: { _truncated: true, _preview: full.slice(0, maxChars - 80), _note: `${label} 已截断` },
    chars: maxChars,
    truncated: true,
    label,
  };
}

function applyContextBudget({ rules = [], policyKB = {}, record = {}, budget = DEFAULT_BUDGET } = {}) {
  const manifest = { budget, sections: [] };
  let remaining = budget;

  const reserve = (name, chars, truncated = false) => {
    manifest.sections.push({ name, chars, truncated });
    remaining -= chars;
  };

  const slimRules = rules.map(r => ({
    rule_id: r.rule_id, rule_name: r.rule_name, layer: r.layer,
    violation_type: r.violation_type, trigger_logic: r.trigger_logic,
    exclusions: r.exclusions, policy_basis: r.policy_basis,
  }));
  const core = slimRules.filter(r => CORE_RULES.includes(r.rule_id));
  const rulesPack = truncateJson(core.length ? core : slimRules.slice(0, 15), Math.floor(budget * 0.25), 'rules');
  reserve('rules', rulesPack.chars, rulesPack.truncated);

  const verifiedFirst = Object.entries(policyKB).sort((a, b) => {
    const va = (a[1] || '').includes('✅') ? 1 : 0;
    const vb = (b[1] || '').includes('✅') ? 1 : 0;
    return vb - va;
  });
  const kbObj = {};
  let kbChars = 2;
  const kbLimit = Math.floor(budget * 0.35);
  for (const [k, v] of verifiedFirst) {
    const piece = JSON.stringify({ [k]: v });
    if (kbChars + piece.length > kbLimit) break;
    kbObj[k] = v;
    kbChars += piece.length;
  }
  const kbTruncated = Object.keys(kbObj).length < Object.keys(policyKB).length;
  reserve('policy_kb', jsonLen(kbObj), kbTruncated);

  const recLimit = Math.max(remaining - 200, Math.floor(budget * 0.35));
  const recordPack = truncateJson(record, recLimit, 'record');
  reserve('record', recordPack.chars, recordPack.truncated);

  return {
    rules: rulesPack.value,
    policyKB: kbObj,
    record: recordPack.value,
    context_manifest: manifest,
  };
}

module.exports = { applyContextBudget, DEFAULT_BUDGET, CORE_RULES };
