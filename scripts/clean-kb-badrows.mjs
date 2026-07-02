#!/usr/bin/env node
// 存量 KB 坏行清洗：移除爬虫入库的解析垃圾条目（纯序号/合计/无连续汉字行）。
// 只清洗 verify_status 含「爬虫入库」的条目——人工核实的短条款
// （如 KB1-条例-第40条(三)「虚构医药服务项目。」）不受影响。
// 用法：
//   node scripts/clean-kb-badrows.mjs --dry-run   # 只预览
//   node scripts/clean-kb-badrows.mjs             # 执行清洗并同步 corpus/manifest

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isJunkPolicyText } from './crawl/lib/quality.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KB_PATH = path.join(ROOT, 'prototype/data/kb/kb1_policies.json');
const CORPUS_KB_PATH = path.join(ROOT, 'public-data-corpus/kb/kb1_policies.json');
const MANIFEST_PATH = path.join(ROOT, 'public-data-corpus/manifest.json');
const dryRun = process.argv.includes('--dry-run');

const kb = JSON.parse(fs.readFileSync(KB_PATH, 'utf8'));
const before = kb.entries.length;

const removed = [];
kb.entries = kb.entries.filter((e) => {
  const isCrawler = (e.verify_status || '').includes('爬虫入库');
  if (isCrawler && isJunkPolicyText(e.text)) {
    removed.push(e);
    return false;
  }
  return true;
});

console.log(`扫描 ${before} 条 → 坏行 ${removed.length} 条（仅爬虫入库条目）`);
const byDoc = {};
for (const r of removed) byDoc[r.doc_id] = (byDoc[r.doc_id] || 0) + 1;
console.log('按 doc_id 分布:', JSON.stringify(byDoc));
for (const r of removed.slice(0, 5)) console.log('  样例:', r.ref_id, '→', JSON.stringify((r.text || '').slice(0, 30)));

if (dryRun) {
  console.log('\n--dry-run：未写入任何文件。');
  process.exit(0);
}

if (!removed.length) {
  console.log('无坏行，无需清洗。');
  process.exit(0);
}

kb.kb_meta = kb.kb_meta || {};
kb.kb_meta.last_cleaned_at = new Date().toISOString();
kb.kb_meta.last_clean_removed = removed.length;

fs.writeFileSync(KB_PATH, JSON.stringify(kb, null, 2) + '\n');
console.log(`已写回 ${path.relative(ROOT, KB_PATH)}：${before} → ${kb.entries.length} 条`);

// 同步 public-data-corpus 副本
if (fs.existsSync(path.dirname(CORPUS_KB_PATH))) {
  fs.copyFileSync(KB_PATH, CORPUS_KB_PATH);
  console.log(`已同步 ${path.relative(ROOT, CORPUS_KB_PATH)}`);
}

// 更新 manifest 统计
if (fs.existsSync(MANIFEST_PATH)) {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  manifest.generated_at = new Date().toISOString().slice(0, 10);
  if (manifest.summary) {
    manifest.summary.kb1_policy_entries = kb.entries.length;
    if (typeof manifest.summary.total_grand === 'number') {
      manifest.summary.total_grand = manifest.summary.total_grand - removed.length;
    }
  }
  manifest.crawl_runs = manifest.crawl_runs || [];
  manifest.crawl_runs.push({
    at: new Date().toISOString(),
    phase: 'clean-badrows',
    removed: removed.length,
    kb1_after: kb.entries.length,
    note: '质量门清洗：移除表头错位产出的纯序号/合计/无连续汉字爬虫条目',
  });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`已更新 ${path.relative(ROOT, MANIFEST_PATH)}`);
}
