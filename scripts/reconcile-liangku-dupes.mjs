#!/usr/bin/env node
/** 移除无 content_key 的旧版两库条目（批次标题 ref_id 时代遗留），保留新颗粒度条目。 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { countKbStats, updateManifest } from './crawl/lib/merge-kb.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KB_PATH = path.join(ROOT, 'prototype/data/kb/kb1_policies.json');
const CORPUS = path.join(ROOT, 'public-data-corpus/kb/kb1_policies.json');
const dryRun = process.argv.includes('--dry-run');

const kb = JSON.parse(fs.readFileSync(KB_PATH, 'utf8'));
const before = kb.entries.length;
const removed = [];
kb.entries = (kb.entries || []).filter((e) => {
  if (e.doc_id !== 'KB1-两库2025') return true;
  if (e.metadata?.content_key) return true;
  removed.push(e.ref_id);
  return false;
});
const after = kb.entries.length;

if (dryRun) {
  console.log(`[dry-run] 将移除 ${removed.length} 条旧版两库条目（${before} → ${after}）`);
  console.log('样例:', removed.slice(0, 5));
  process.exit(0);
}

kb.kb_meta = kb.kb_meta || {};
kb.kb_meta.last_reconcile_at = new Date().toISOString();
fs.writeFileSync(KB_PATH, JSON.stringify(kb, null, 2) + '\n');
fs.mkdirSync(path.dirname(CORPUS), { recursive: true });
fs.copyFileSync(KB_PATH, CORPUS);

const stats = countKbStats();
updateManifest({ phase: 'reconcile-liangku-dupes', removed: removed.length, kb: stats });

const lk = kb.entries.filter((e) => e.doc_id === 'KB1-两库2025');
console.log(`✅ 清理完成：移除 ${removed.length} 条旧版两库（${before} → ${after}），现两库 ${lk.length} 条`);
