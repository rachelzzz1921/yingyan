#!/usr/bin/env node
/** 生成 rule_gz_mapping.yaml 初稿（implemented/pilot/roadmap 人工标注 + 其余 candidate） */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(path.join(ROOT, 'prototype/app/package.json'));
const yaml = require('js-yaml');

const CATALOG = path.join(ROOT, 'prototype/data/kb/official_rules_catalog.json');
const OUT = path.join(ROOT, 'prototype/data/rules/rule_gz_mapping.yaml');

const IMPLEMENTED = {
  GZ10000101006000: { eagle_rule_ids: ['F-002'], tier: 'core', l3_families: ['child_limited'] },
  GZ10000101007000: { eagle_rule_ids: ['F-002'], tier: 'core', l3_families: ['child_limited'] },
  GZ10000101003000: { eagle_rule_ids: ['precheck-tcm'], tier: 'core', l3_families: ['tcm_no_pay'] },
  GZ10000101004000: { eagle_rule_ids: ['precheck-tcm'], tier: 'core', l3_families: ['tcm_no_pay'] },
  GZ10000101005000: { eagle_rule_ids: ['B-209'], tier: 'core', l3_families: ['second_line'] },
  GZ10000101008000: { eagle_rule_ids: ['B-201-IND', 'B-201'], tier: 'core', l3_families: ['indication_limited'] },
  GZ10000101009000: { eagle_rule_ids: ['F-006'], tier: 'core', l3_families: ['usage_limit'] },
  GZ10000101010000: { eagle_rule_ids: ['F-006'], tier: 'core', l3_families: ['usage_limit'] },
  GZ10000101001000: { eagle_rule_ids: ['B-211'], tier: 'core', l3_families: ['insurance_type'] },
  GZ10000101002000: { eagle_rule_ids: ['B-211'], tier: 'core', l3_families: ['insurance_type'] },
  GZ10000102011000: { eagle_rule_ids: ['B-210'], tier: 'core', l3_families: ['facility_level'] },
  GZ10000102012000: { eagle_rule_ids: ['A-102'], tier: 'core', l3_families: ['mutual_exclusive'] },
  GZ10000102002000: { eagle_rule_ids: ['SUR-401'], tier: 'core', l3_families: ['surgery_discount'] },
  GZ10000102014000: { eagle_rule_ids: ['F-006'], tier: 'core', l3_families: ['usage_limit'] },
  GZ10000302004000: { eagle_rule_ids: ['F-001'], tier: 'core', l3_families: ['gender_limited'] },
  GZ10000302001000: { eagle_rule_ids: ['A-108', 'IMG-301'], tier: 'core' },
  GZ10000301001000: { eagle_rule_ids: ['B-202', 'T-201'], tier: 'core' },
  GZ10000301002000: { eagle_rule_ids: ['B-201-IND'], tier: 'core', l3_families: ['indication_limited'] },
};

const PILOT = {
  GZ10000102001000: { eagle_rule_ids: ['A-101'], tier: 'core' },
  GZ10000102013000: { eagle_rule_ids: ['A-106'], tier: 'core' },
  GZ10000202003000: { eagle_rule_ids: ['B-202'], tier: 'core' },
};

const ROADMAP = {};
for (const code of [
  'ZB10000205001000', 'ZB10000205002000', 'ZB10000205003000', 'ZB10000205004000',
  'ZB10000205005000', 'ZB10000205006000', 'ZB10000205007000', 'ZB10000205008000',
]) {
  ROADMAP[code] = { eagle_rule_ids: [], tier: 'core', notes: '跨就诊统计指标监测（原 G/H 路线图对位）' };
}

const ENHANCEMENT = {
  'T-201': ['GZ10000301008000'],
  'T-205': ['GZ10000301009000'],
  'M-301': ['GZ10000302002000'],
  'ICU-301': ['GZ10000302005000'],
  'IMG-301': ['GZ10000302001000'],
  'P-301': ['GZ10000202001000'],
  'C-301': ['GZ10000204001000'],
  'D-401': ['GZ10000204002000'],
};

// flip enhancement: code -> rules
const ENH_BY_CODE = {};
for (const [rid, codes] of Object.entries(ENHANCEMENT)) {
  for (const c of codes) {
    ENH_BY_CODE[c] = ENH_BY_CODE[c] || { eagle_rule_ids: [], tier: 'enhancement' };
    ENH_BY_CODE[c].eagle_rule_ids.push(rid);
  }
}

const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
const mappings = catalog.rules_flat.map((r) => {
  const code = r.official_code;
  let coverage_status = 'candidate';
  let extra = {};
  if (IMPLEMENTED[code]) { coverage_status = 'implemented'; extra = IMPLEMENTED[code]; }
  else if (PILOT[code]) { coverage_status = 'pilot'; extra = PILOT[code]; }
  else if (ROADMAP[code]) { coverage_status = 'roadmap'; extra = ROADMAP[code]; }
  else if (ENH_BY_CODE[code]) { coverage_status = 'implemented'; extra = ENH_BY_CODE[code]; }
  return {
    official_code: code,
    name: r.name,
    tier1_id: r.tier1_id,
    tier2_id: r.tier2_id,
    coverage_status,
    eagle_rule_ids: extra.eagle_rule_ids || [],
    tier: extra.tier || 'core',
    l3_families: extra.l3_families || [],
    notes: extra.notes || '',
  };
});

const coreIds = new Set();
const enhIds = new Set();
for (const m of mappings) {
  for (const id of m.eagle_rule_ids) {
    if (m.tier === 'enhancement') enhIds.add(id);
    else coreIds.add(id);
  }
}

const doc = {
  meta: {
    version: 1,
    description: '国家79条官方规则 ↔ 鹰眼 checker 覆盖映射（叠加层，不改 rule_id）',
    core_checker_count: coreIds.size,
    enhancement_checker_count: enhIds.size,
    status_legend: {
      implemented: '已实现',
      pilot: '试运行（只标记不拦）',
      candidate: '已入库待接',
      roadmap: '框架内规划',
    },
  },
  mappings,
};

fs.writeFileSync(OUT, yaml.dump(doc, { lineWidth: 120, noRefs: true }), 'utf8');
const counts = {};
for (const m of mappings) counts[m.coverage_status] = (counts[m.coverage_status] || 0) + 1;
console.log('✅', OUT, counts);
