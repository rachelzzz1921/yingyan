#!/usr/bin/env node
/**
 * 从 KB1 两库规则库框架 PDF 入库文本提取 79 条官方规则目录。
 * 官方编码：GZ*（71）+ ZB*（8，统计指标监测类）。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const KB1 = path.join(ROOT, 'prototype/data/kb/kb1_policies.json');
const OUT = path.join(ROOT, 'prototype/data/kb/official_rules_catalog.json');
const CORPUS_OUT = path.join(ROOT, 'public-data-corpus/kb/official_rules_catalog.json');

const TIER1_BY_PREFIX = {
  '1000010': { id: 'policy', label: '政策类', count: 30 },
  '1000020': { id: 'management', label: '管理类', count: 28 },
  '1000030': { id: 'medical', label: '医疗类', count: 21 },
};

const TIER2_BY_PREFIX = {
  '10000101': { id: 'drug_policy', label: '药品政策限定类', count: 12, tier1: 'policy' },
  '10000102': { id: 'service_policy', label: '医疗服务项目政策限定类', count: 15, tier1: 'policy' },
  '10000103': { id: 'consumable_policy', label: '医用耗材政策限定类', count: 3, tier1: 'policy' },
  '10000201': { id: 'data_supervision', label: '信息数据监管类', count: 8, tier1: 'management' },
  '10000202': { id: 'drug_supervision', label: '药品监管类', count: 4, tier1: 'management' },
  '10000203': { id: 'consumable_supervision', label: '医用耗材监管类', count: 1, tier1: 'management' },
  '10000204': { id: 'actor_supervision', label: '行为主体监管类', count: 7, tier1: 'management' },
  '10000205': { id: 'stats_monitoring', label: '统计指标监测类', count: 8, tier1: 'management' },
  '10000301': { id: 'drug_rational', label: '药品合理使用类', count: 12, tier1: 'medical' },
  '10000302': { id: 'service_rational', label: '医疗服务项目合理使用类', count: 6, tier1: 'medical' },
  '10000303': { id: 'consumable_rational', label: '医用耗材合理使用类', count: 3, tier1: 'medical' },
};

const TIER2_CANON = Object.values(TIER2_BY_PREFIX).map((t) => t.label.replace(/\s/g, ''));

function collapse(s) {
  return String(s || '').replace(/\s+/g, '');
}

function parseChunk(chunk) {
  const m = chunk.match(/^(GZ|ZB)(\d{14})([\s\S]+)/);
  if (!m) return null;
  const official_code = m[1] + m[2];
  const digits = m[2];
  const tier2Key = digits.slice(0, 7);
  const tier1Key = digits.slice(0, 7).slice(0, 7);
  const t1prefix = digits.slice(0, 7);
  const t2prefix = digits.slice(0, 8);
  const tier1Meta = TIER1_BY_PREFIX[t1prefix.slice(0, 7)] || TIER1_BY_PREFIX[digits.slice(0, 7)];
  const tier2Meta = TIER2_BY_PREFIX[t2prefix];
  if (!tier2Meta) return null;

  let body = m[3].trim();
  body = body.replace(/^\d+\s*规则编码[\s\S]*?(?=对)/, '');
  const tier1Label = tier2Meta.tier1 === 'policy' ? '政策类' : tier2Meta.tier1 === 'management' ? '管理类' : '医疗类';
  const tier2Norm = tier2Meta.label;

  const defIdx = body.search(/对《|对最新版|对未按照|对检验检查|对参保人|对《国家基本|对单独|对政策中|对《医保医用/);
  let namePart = defIdx >= 0 ? body.slice(0, defIdx) : body;
  let definition = defIdx >= 0 ? body.slice(defIdx) : '';

  namePart = collapse(namePart)
    .replace(new RegExp(`^${collapse(tier1Label)}`), '')
    .replace(new RegExp(`^${collapse(tier2Norm)}`), '')
    .replace(/^管理要求/, '')
    .replace(/^\d+$/, '');

  definition = definition.replace(/\s+/g, ' ').replace(/\d+\s*$/, '').trim();

  return {
    official_code,
    tier1: tier1Label,
    tier2: tier2Norm,
    tier1_id: tier1Meta?.id || tier2Meta.tier1,
    tier2_id: tier2Meta.id,
    name: namePart || '(待补名称)',
    definition: definition || body.replace(/\s+/g, ' ').slice(0, 500),
  };
}

function buildCatalog(rules) {
  const tier1Map = new Map();
  for (const r of rules) {
    if (!tier1Map.has(r.tier1_id)) {
      tier1Map.set(r.tier1_id, {
        id: r.tier1_id,
        label: r.tier1,
        count: TIER1_BY_PREFIX[Object.keys(TIER1_BY_PREFIX).find((k) => TIER1_BY_PREFIX[k].id === r.tier1_id)]?.count,
        tier2: new Map(),
      });
    }
    const t1 = tier1Map.get(r.tier1_id);
    if (!t1.tier2.has(r.tier2_id)) {
      const t2meta = Object.values(TIER2_BY_PREFIX).find((x) => x.id === r.tier2_id);
      t1.tier2.set(r.tier2_id, { id: r.tier2_id, label: r.tier2, count: t2meta?.count, rules: [] });
    }
    t1.tier2.get(r.tier2_id).rules.push({
      official_code: r.official_code,
      name: r.name,
      definition: r.definition,
    });
  }
  const tier1 = [...tier1Map.values()].map((t1) => ({
    id: t1.id,
    label: t1.label,
    count: t1.count,
    tier2: [...t1.tier2.values()].map((t2) => ({
      id: t2.id,
      label: t2.label,
      count: t2.count,
      rules: t2.rules,
    })),
  }));
  return tier1;
}

function main() {
  const kb = JSON.parse(fs.readFileSync(KB1, 'utf8'));
  const entry = kb.entries.find((e) => e.ref_id && e.ref_id.includes('规则库框架体系'));
  if (!entry?.text) throw new Error('KB1 未找到规则库框架体系条目');

  const parts = entry.text.split(/(?=(?:GZ|ZB)\d{14})/).filter((p) => /^(GZ|ZB)/.test(p));
  const rules = parts.map(parseChunk).filter(Boolean);

  if (rules.length !== 79) {
    console.warn(`⚠ 解析到 ${rules.length} 条，期望 79`);
  }

  const tier2Counts = {};
  for (const r of rules) tier2Counts[r.tier2_id] = (tier2Counts[r.tier2_id] || 0) + 1;
  for (const [k, meta] of Object.entries(TIER2_BY_PREFIX)) {
    const got = tier2Counts[meta.id] || 0;
    if (got !== meta.count) console.warn(`⚠ ${meta.label}: 期望 ${meta.count}，实际 ${got}`);
  }

  const doc = {
    meta: {
      source: '国家医疗保障局·两库规则库框架体系（1.0版）',
      ref_id: entry.ref_id,
      extracted_at: new Date().toISOString().slice(0, 10),
      total: rules.length,
      code_prefixes: { GZ: rules.filter((r) => r.official_code.startsWith('GZ')).length, ZB: rules.filter((r) => r.official_code.startsWith('ZB')).length },
    },
    rules_flat: rules,
    tier1: buildCatalog(rules),
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(doc, null, 2), 'utf8');
  fs.mkdirSync(path.dirname(CORPUS_OUT), { recursive: true });
  fs.writeFileSync(CORPUS_OUT, JSON.stringify(doc, null, 2), 'utf8');
  console.log(`✅ official_rules_catalog.json: ${rules.length} 条 → ${OUT}`);
}

main();
