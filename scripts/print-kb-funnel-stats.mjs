#!/usr/bin/env node
/**
 * 输出传单/文档所需的 L0–L4 live 数字（JSON + 简短 Markdown）
 * 用法：node scripts/print-kb-funnel-stats.mjs [--json]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function countFiles(dir, extRe) {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory() && ent.name !== 'node_modules' && !ent.name.startsWith('.')) walk(p);
      else if (ent.isFile() && extRe.test(ent.name)) n++;
    }
  };
  walk(dir);
  return n;
}

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

async function main() {
  const kb = loadJson(path.join(ROOT, 'prototype/data/kb/kb1_policies.json'));
  const l3 = loadJson(path.join(ROOT, 'prototype/data/kb/kb_operational_index.json'));
  const rulesDoc = loadJson(path.join(ROOT, 'prototype/data/rules/rules.json'));
  const rules = rulesDoc.rules || rulesDoc || [];
  const caseReg = loadJson(path.join(ROOT, 'prototype/data/case_registry.json'));
  const mailDir = path.join(ROOT, 'public-data-corpus/raw/mail-liangku');

  const auditEngine = fs.readFileSync(path.join(ROOT, 'prototype/app/engine/audit-engine.js'), 'utf8');
  const checkerBlock = auditEngine.match(/const ruleCheckers\s*=\s*\{([\s\S]*?)\n\};/);
  const checkerIds = checkerBlock
    ? [...checkerBlock[1].matchAll(/^\s*['"]([A-Z][\w-]+)['"]\s*:/gm)].map((m) => m[1])
    : [];
  const l3Families = Object.keys(l3.families || {});
  const wiredFamilies = l3Families.filter((id) => {
    const wired = ['mutual_exclusive', 'gender_limited', 'child_limited', 'usage_limit', 'second_line', 'facility_level', 'insurance_type', 'tcm_no_pay', 'indication_limited', 'surgery_discount'];
    return wired.includes(id);
  });

  const lkRows = (kb.entries || []).filter((e) => e.doc_id === 'KB1-两库2025');
  const encSum = lkRows.reduce((s, e) => s + (Number(e.metadata?.encoding_count) || 0), 0);
  const bookRows = lkRows.filter((e) => e.metadata?.crawl_source === 'liangku-book-2025');

  const stats = {
    L0_raw_files: countFiles(mailDir, /\.(xlsx|xls|pdf|zip|txt)$/i),
    L1_kb1_total: (kb.entries || []).length,
    L1_liangku_rows: lkRows.length,
    L1_book_rows: bookRows.length,
    L1_encoding_count_sum: encSum,
    L2_l3_merged: l3.meta?.merged_items || Object.keys(l3.constraints || {}).length,
    L2_l3_raw_rows: l3.meta?.raw_rows || 0,
    L2_exclusive_pairs: (l3.exclusive_pairs || []).length,
    L2_families_total: l3Families.length,
    L2_families_wired: wiredFamilies.length,
    L3_rules_yaml: Array.isArray(rules) ? rules.length : Object.keys(rules).length,
    L3_rule_checkers: checkerIds.length,
    L4_demo_cases: (caseReg.entries || []).length,
    generated_at: new Date().toISOString(),
  };

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  console.log('\n鹰眼 L0–L4 漏斗（live）\n');
  console.log('| 层 | 指标 | 数量 |');
  console.log('|----|------|------|');
  console.log(`| L0 | 邮件/语料 raw 文件 | ${stats.L0_raw_files} |`);
  console.log(`| L1 | KB1 总条目 | ${stats.L1_kb1_total} |`);
  console.log(`| L1 | 两库 2025 行 | ${stats.L1_liangku_rows} |`);
  console.log(`| L1 | 全书 PDF 入库行 | ${stats.L1_book_rows} |`);
  console.log(`| L1 | encoding_count 累加 | ${stats.L1_encoding_count_sum} |`);
  console.log(`| L2 | L3 合并项 | ${stats.L2_l3_merged} |`);
  console.log(`| L2 | L3 原料行 | ${stats.L2_l3_raw_rows} |`);
  console.log(`| L2 | 互斥对 | ${stats.L2_exclusive_pairs} |`);
  console.log(`| L2 | 家族（已接线/总数） | ${stats.L2_families_wired}/${stats.L2_families_total} |`);
  console.log(`| L3 | rules.yaml | ${stats.L3_rules_yaml} |`);
  console.log(`| L3 | ruleCheckers | ${stats.L3_rule_checkers} |`);
  console.log(`| L4 | demo/YHF 案卷 | ${stats.L4_demo_cases} |`);
}

main().catch((e) => { console.error(e); process.exit(1); });
