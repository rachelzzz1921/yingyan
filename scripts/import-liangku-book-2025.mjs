#!/usr/bin/env node
/**
 * 解析《医疗保障基金智能监管规则库、知识库（2025年版）》PDF（全书）。
 * 按「"XXX"规则对应知识点明细」分节，49 大类分族 parser 入库。
 *
 * 用法：node scripts/import-liangku-book-2025.mjs [--dry-run] [--force]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { mergeIntoKb, countKbStats, updateManifest } from './crawl/lib/merge-kb.mjs';
import { filterJunkPolicies } from './crawl/lib/quality.mjs';
import { BOOK, parseBookFlat } from './crawl/parsers/book-liangku/index.mjs';

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), 'crawl/package.json'));
const pdfParse = require('pdf-parse');

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (!fs.existsSync(BOOK)) {
    console.error('全书 PDF 不存在:', BOOK);
    process.exit(1);
  }
  console.log('\n解析 2025 全书 PDF…');
  const data = await pdfParse(fs.readFileSync(BOOK));
  const flat = data.text.replace(/\s+/g, '');
  console.log(`  ${data.numpages} 页 · 文本 ${data.text.length} 字符`);

  const meta = { title: '2025全书', sourceUrl: 'book-2025-pdf' };
  const { sections, policies, byCategory } = parseBookFlat(flat, meta);
  console.log(`  有效规则类 ${sections.length} 个（已去重、过滤目录假节）`);

  const sorted = Object.entries(byCategory).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  for (const [cat, n] of sorted) console.log(`  · ${cat} → ${n}`);

  const { kept, rejected } = filterJunkPolicies(policies);
  const encSum = kept.reduce((s, p) => s + (p.metadata?.encoding_count || 0), 0);
  console.log(`\n合计解析 ${kept.length} 条（质量门拒 ${rejected}）· encoding_count 累加 ${encSum}`);

  if (dryRun) {
    console.log('[dry-run] 未写入');
    return;
  }
  const stats = mergeIntoKb({ policies: kept }, { force: process.argv.includes('--force') });
  const kbStats = countKbStats();
  updateManifest({
    phase: 'import-liangku-book-2025',
    parsed: kept.length,
    encoding_count_sum: encSum,
    merge: stats,
    kb: kbStats,
  });
  console.log(`\n✅ 全书入库完成 KB1=${kbStats.kb1_entries} (+${stats.policies.added} new ~${stats.policies.updated} upd)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
