'use strict';

/**
 * 国家 79 条官方规则覆盖地图 — 加载 catalog + mapping，计算矩阵状态与统计。
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const DATA = path.resolve(__dirname, '../../data');
const CATALOG_PATH = path.join(DATA, 'kb/official_rules_catalog.json');
const MAPPING_PATH = path.join(DATA, 'rules/rule_gz_mapping.yaml');
const RUNTIME_STATS_PATH = path.join(DATA, 'rules/runtime_stats.json');

let _cache = null;

function loadCatalog() {
  return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
}

function loadMapping() {
  if (!fs.existsSync(MAPPING_PATH)) return { mappings: [] };
  return yaml.load(fs.readFileSync(MAPPING_PATH, 'utf8')) || { mappings: [] };
}

function loadRuntimeStats() {
  if (!fs.existsSync(RUNTIME_STATS_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(RUNTIME_STATS_PATH, 'utf8')); } catch { return {}; }
}

/** @param {string[]} checkerIds audit-engine 已注册 checker */
function computeOfficialCoverage(checkerIds = [], opts = {}) {
  const catalog = loadCatalog();
  const mappingDoc = loadMapping();
  const byCode = new Map((mappingDoc.mappings || []).map((m) => [m.official_code, m]));
  const checkerSet = new Set(checkerIds);
  const batchEngineReady = opts.batchEngine !== false;
  const runtimeStats = loadRuntimeStats();

  const cells = [];
  const summary = { total: 0, implemented: 0, pilot: 0, candidate: 0, roadmap: 0 };
  const coreRules = new Set();
  const enhancementRules = new Set();

  for (const r of catalog.rules_flat || []) {
    const m = byCode.get(r.official_code) || {};
    let status = m.coverage_status || 'candidate';
    const eagleIds = m.eagle_rule_ids || [];
    if (status === 'implemented' && eagleIds.length) {
      const wired = eagleIds.some((id) => {
        if (id === 'precheck-tcm') return true;
        if (/^ZB-/.test(id)) return batchEngineReady;
        if (id === 'B-201-IND') return checkerSet.has('B-201-IND') || checkerSet.has('B-201');
        return checkerSet.has(id);
      });
      if (!wired && !eagleIds.includes('precheck-tcm')) status = 'pilot';
    }
    summary.total += 1;
    summary[status] = (summary[status] || 0) + 1;
    for (const id of eagleIds) {
      if (m.tier === 'enhancement') enhancementRules.add(id);
      else if (id !== 'precheck-tcm') coreRules.add(id);
    }
    cells.push({
      official_code: r.official_code,
      name: r.name,
      definition: r.definition,
      tier1: r.tier1,
      tier2: r.tier2,
      tier1_id: r.tier1_id,
      tier2_id: r.tier2_id,
      coverage_status: status,
      eagle_rule_ids: eagleIds,
      checker_wired: status === 'implemented',
      handler: m.production?.handler || null,
      tier: m.tier || 'core',
      l3_families: m.l3_families || [],
      notes: m.notes || '',
      production: m.production || null,
      runtime_stats: runtimeStats[r.official_code] || null,
    });
  }

  const productionReady = cells.filter((c) => c.production?.workflow === 'complete' && c.production?.yhf_verified && c.coverage_status === 'implemented').length;

  const yamlRules = new Set((opts.rulesYamlIds || []));
  const registeredCheckers = checkerIds.filter((id) => yamlRules.size === 0 || yamlRules.has(id) || id === 'A-109MAT');
  const familyBreakdown = {
    naming_62: checkerIds.filter((id) => /^(F|A|B|C|D|E|T|M|ICU|P|IMG|CV|BP)-/.test(id)).length,
    embed_4: ['SUR-401', 'TRACE-101', 'NUR-303', 'AGE-101'].filter((id) => checkerSet.has(id)).length,
    l3_5: ['L3-DRX', 'L3-CDM', 'L3-SAF', 'L3-TCM', 'L3-DS'].filter((id) => checkerSet.has(id)).length,
    zb_8: checkerIds.filter((id) => /^ZB-/.test(id)).length,
  };

  const tier1 = (catalog.tier1 || []).map((t1) => ({
    ...t1,
    tier2: (t1.tier2 || []).map((t2) => ({
      ...t2,
      rules: (t2.rules || []).map((rule) => {
        const cell = cells.find((c) => c.official_code === rule.official_code);
        return { ...rule, ...(cell || { coverage_status: 'candidate' }) };
      }),
    })),
  }));

  return {
    meta: { ...catalog.meta, mapping_version: mappingDoc.meta?.version },
    summary,
    official_coverage: {
      implemented: summary.implemented,
      pilot: summary.pilot,
      candidate: summary.candidate,
      roadmap: summary.roadmap,
      production_ready: productionReady,
      production_ready_total: summary.total,
      rule_checker_count: registeredCheckers.length,
      rules_yaml_count: yamlRules.size || null,
      family_breakdown: familyBreakdown,
      core_checker_count: coreRules.size,
      enhancement_checker_count: enhancementRules.size,
      core_checker_ids: [...coreRules].sort(),
      enhancement_checker_ids: [...enhancementRules].sort(),
    },
    cells,
    tier1,
  };
}

function getOfficialRuleByCode(code) {
  const catalog = loadCatalog();
  return (catalog.rules_flat || []).find((r) => r.official_code === code) || null;
}

function getMappingForRuleId(ruleId) {
  const mappingDoc = loadMapping();
  return (mappingDoc.mappings || []).filter((m) => (m.eagle_rule_ids || []).includes(ruleId));
}

function defaultPrecheckTone(tier1) {
  if (tier1 === '医疗类') return 'suggest';
  if (tier1 === '政策类' || tier1 === '管理类') return 'block';
  return 'suggest';
}

module.exports = {
  computeOfficialCoverage,
  getOfficialRuleByCode,
  getMappingForRuleId,
  defaultPrecheckTone,
  loadCatalog,
  loadMapping,
};
