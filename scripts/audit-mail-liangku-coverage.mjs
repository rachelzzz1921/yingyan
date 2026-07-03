#!/usr/bin/env node
/**
 * 邮件两库附件清单审计：下载覆盖 / KB 引用 / 解析行数 / col109 覆盖
 *
 * 输入：/tmp/liangku_files.json（可选）+ public-data-corpus/raw/mail-liangku/
 * 输出：docs/mail-liangku-coverage.md + eval/results/mail-liangku-coverage.json
 *
 * 用法：node scripts/audit-mail-liangku-coverage.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseLiangkuFromFile } from './crawl/parsers/xlsx-liangku.mjs';
import { parseLiangkuPdf } from './crawl/parsers/pdf-liangku.mjs';
import { filterJunkPolicies } from './crawl/lib/quality.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAIL_DIR = path.join(ROOT, 'public-data-corpus/raw/mail-liangku');
const MANIFEST = '/tmp/liangku_files.json';
const KB_PATH = path.join(ROOT, 'prototype/data/kb/kb1_policies.json');
const OUT_MD = path.join(ROOT, 'docs/mail-liangku-coverage.md');
const OUT_JSON = path.join(ROOT, 'eval/results/mail-liangku-coverage.json');

function basenameNorm(p) {
  return path.basename(String(p || '')).replace(/\s+/g, '');
}

function loadManifest() {
  if (!fs.existsSync(MANIFEST)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    return (Array.isArray(raw) ? raw : raw.files || []).map((x) => (typeof x === 'string' ? x : x.name || x.filename)).filter(Boolean);
  } catch {
    return [];
  }
}

function diskFiles() {
  if (!fs.existsSync(MAIL_DIR)) return [];
  const out = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory() && !ent.name.startsWith('_')) walk(p);
      else if (/\.(xlsx|xls|pdf|zip|txt)$/i.test(ent.name) && !ent.name.endsWith('.crdownload')) out.push(p);
    }
  };
  walk(MAIL_DIR);
  if (fs.existsSync(path.join(MAIL_DIR, '_zip-extract'))) {
    walk(path.join(MAIL_DIR, '_zip-extract'));
  }
  return out;
}

function kbRefs(kb) {
  const byFile = new Map();
  for (const e of kb.entries || []) {
    const att = e.metadata?.attachment;
    if (!att || !/mail-liangku|liangku-book/.test(att)) continue;
    const key = basenameNorm(att);
    byFile.set(key, (byFile.get(key) || 0) + 1);
  }
  return byFile;
}

async function parseCount(filePath) {
  const name = path.basename(filePath);
  try {
    if (/\.(xlsx|xls)$/i.test(filePath)) {
      const { policies } = parseLiangkuFromFile(filePath, { attachment: filePath });
      return filterJunkPolicies(policies || []).kept.length;
    }
    if (/\.pdf$/i.test(filePath) && !/2025年版.*-1/.test(name)) {
      const { policies } = await parseLiangkuPdf(filePath, { attachment: filePath });
      return filterJunkPolicies(policies || []).kept.length;
    }
  } catch { /* skip */ }
  return null;
}

async function main() {
  const manifest = loadManifest();
  const disk = diskFiles();
  const kb = JSON.parse(fs.readFileSync(KB_PATH, 'utf8'));
  const refs = kbRefs(kb);
  const diskNames = new Set(disk.map(basenameNorm));

  const rows = [];
  const allNames = new Set([...manifest.map(basenameNorm), ...diskNames]);
  for (const name of [...allNames].sort()) {
    const onDisk = diskNames.has(name) || disk.some((p) => basenameNorm(p).includes(name.slice(0, 12)));
    const kbCount = refs.get(name) || refs.get(basenameNorm(name)) || 0;
    const filePath = disk.find((p) => basenameNorm(p) === name || basenameNorm(p).includes(name.slice(0, 10)));
    const parsed = filePath ? await parseCount(filePath) : null;
    let state = 'missing_download';
    if (onDisk && kbCount > 0) state = 'kb_referenced';
    else if (onDisk && parsed > 0) state = 'parseable_not_in_kb';
    else if (onDisk && /2025年版.*-1/.test(name)) state = 'book_pdf_separate_import';
    else if (onDisk && /\.zip$/i.test(name)) state = 'zip_bundle';
    else if (onDisk) state = 'on_disk_only';
    rows.push({ name, on_disk: onDisk, kb_refs: kbCount, parse_rows: parsed, state });
  }

  const summary = {
    manifest_count: manifest.length,
    disk_count: disk.length,
    kb_mail_refs: [...refs.values()].reduce((a, b) => a + b, 0),
    kb_files_referenced: refs.size,
    states: rows.reduce((acc, r) => { acc[r.state] = (acc[r.state] || 0) + 1; return acc; }, {}),
  };

  const md = [
    '# 邮件两库附件覆盖审计',
    '',
    `生成时间：${new Date().toISOString()}`,
    '',
    '## 摘要',
    '',
    `| 口径 | 数量 |`,
    `|------|------|`,
    `| 原始清单（liangku_files.json） | ${summary.manifest_count} |`,
    `| 磁盘文件（含 zip 解压） | ${summary.disk_count} |`,
    `| KB 直接引用 mail-liangku 行数 | ${summary.kb_mail_refs} |`,
    `| KB 引用文件数 | ${summary.kb_files_referenced} |`,
    '',
    '## 四态矩阵',
    '',
    '| 文件名 | 已下载 | KB引用 | 解析行 | 状态 |',
    '|--------|--------|--------|--------|------|',
    ...rows.map((r) => `| ${r.name.slice(0, 48)} | ${r.on_disk ? '✓' : '—'} | ${r.kb_refs || '—'} | ${r.parse_rows ?? '—'} | ${r.state} |`),
    '',
    '## 说明',
    '',
    '- `book_pdf_separate_import`：2025 全书 PDF 走 `import-liangku-book-2025.mjs`，metadata.attachment 可能为 book 路径。',
    '- `parseable_not_in_kb`：可解析但可能被 col109 同步覆盖或尚未 force 入库。',
    '- 编码级合计 vs 品种级合计见 `docs/liangku-gap-2025-vs-2026.md`。',
    '',
  ].join('\n');

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_MD, md);
  fs.writeFileSync(OUT_JSON, JSON.stringify({ summary, rows }, null, 2) + '\n');
  console.log(`\n✅ 审计完成 → ${path.relative(ROOT, OUT_MD)}`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
