'use strict';

/** 规则族默认表（rules.yaml meta.rule_families 可覆盖/扩展） */
const DEFAULT_FAMILIES = {
  F: { label: '基础逻辑', layer_hint: 'L1确定性', description: '性别/年龄/时间/频次等底线校验，纯代码可执行', exam_scope: true },
  A: { label: '收费合规', layer_hint: 'L1/L2', description: '重复收费、超标准、分解收费、串换项目等', exam_scope: true },
  B: { label: '诊疗合理', layer_hint: 'L2语义', description: '无指征、过度医疗、出院带药、路径偏离等', exam_scope: true },
  C: { label: '住院行为', layer_hint: 'L2/L3', description: '分解住院、挂床、低标入院、虚假住院等', exam_scope: true },
  D: { label: '支付方式', layer_hint: 'L2语义', description: 'DRG/DIP 高套、特例单议滥用、支付标准偏离', exam_scope: true },
  E: { label: '对抗/资质', layer_hint: 'L3线索', description: '对抗性串换、资质不符、数据造假线索', exam_scope: false },
  T: { label: '肿瘤语义', layer_hint: 'L2语义', description: '靶向/化疗/免疫/路径等肿瘤专项语义规则', exam_scope: true },
  M: { label: '麻醉', layer_hint: 'L2语义', description: '麻醉时长、计费、ASA 分级、复合麻醉等', exam_scope: true },
  ICU: { label: '重症 ICU', layer_hint: 'L2语义', description: '呼吸机、CRRT、重症计费等 ICU 专项', exam_scope: true },
  P: { label: '零售药店', layer_hint: 'L2语义', description: '药店串换、空刷、超量、回流药等', exam_scope: false },
  IMG: { label: '医学影像', layer_hint: 'L2语义', description: '影像无指征、重复检查、超频次等', exam_scope: true },
  CV: { label: '心血管', layer_hint: 'L2语义', description: '心内科/介入/支架等心血管专项', exam_scope: true },
  BP: { label: '慢病管理', layer_hint: 'L2语义', description: '血压/慢病监测、配药节奏等', exam_scope: true },
};

function parseRulePrefix(ruleId) {
  if (!ruleId || typeof ruleId !== 'string') return '';
  const m = ruleId.match(/^([A-Z]+)-\d+$/);
  return m ? m[1] : (ruleId.split('-')[0] || '');
}

function getFamilies(meta) {
  const fromMeta = meta?.rule_families || {};
  const out = {};
  for (const k of new Set([...Object.keys(DEFAULT_FAMILIES), ...Object.keys(fromMeta)])) {
    out[k] = { ...DEFAULT_FAMILIES[k], ...fromMeta[k] };
  }
  return out;
}

function formatDisplayTitle(rule, fam, naming) {
  const tpl = naming?.display_format || '{family_label} · {rule_name}（{rule_id}）';
  return tpl
    .replace(/\{family_label\}/g, fam.label || fam.prefix || '')
    .replace(/\{rule_name\}/g, rule.rule_name || '')
    .replace(/\{rule_id\}/g, rule.rule_id || '');
}

function enrichRule(rule, families, naming) {
  const prefix = parseRulePrefix(rule.rule_id);
  const fam = families[prefix] || {
    label: prefix || '未分类',
    description: '',
    layer_hint: rule.layer || '',
    exam_scope: true,
  };
  const displayTitle = formatDisplayTitle(rule, { ...fam, prefix }, naming);
  return {
    ...rule,
    catalog: {
      prefix,
      family_label: fam.label,
      family_description: fam.description || '',
      layer_hint: fam.layer_hint || rule.layer || '',
      exam_scope: fam.exam_scope !== false,
      display_title: displayTitle,
    },
  };
}

/** 为 rulesDoc 每条规则附加 catalog，并补全 meta.naming_convention / rule_families */
function enrichRulesDoc(doc) {
  if (!doc || !Array.isArray(doc.rules)) return doc;
  const families = getFamilies(doc.meta);
  const naming = {
    pattern: '{前缀}-{三位序号}',
    display_format: '{family_label} · {rule_name}（{rule_id}）',
    prefix_legend: 'F基础逻辑 · A收费合规 · B诊疗合理 · C住院行为 · D支付方式 · E对抗资质 · T肿瘤 · M麻醉 · ICU重症 · P药店 · IMG影像 · CV心血管 · BP慢病',
    layers: {
      'L1确定性': '代码可执行，无歧义',
      'L2语义': '需读病历/医嘱语义',
      'L3线索': '跨病历或需外部数据，默认降级线索',
    },
    ...(doc.meta?.naming_convention || {}),
  };
  const rules = doc.rules.map(r => enrichRule(r, families, naming));
  return {
    ...doc,
    meta: {
      ...doc.meta,
      total_rules: rules.length,
      naming_convention: naming,
      rule_families: families,
      rule_index: rules.map(r => ({
        id: r.rule_id,
        title: r.catalog.display_title,
        prefix: r.catalog.prefix,
        exam_scope: r.catalog.exam_scope,
      })),
    },
    rules,
  };
}

function buildRuleMap(rules) {
  return Object.fromEntries((rules || []).map(r => [r.rule_id, r]));
}

module.exports = {
  DEFAULT_FAMILIES,
  parseRulePrefix,
  getFamilies,
  enrichRule,
  enrichRulesDoc,
  buildRuleMap,
};
