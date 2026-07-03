#!/usr/bin/env node
/**
 * 一键解析邮箱下载目录 public-data-corpus/raw/mail-liangku：
 * - 全部 xlsx/xls → xlsx-liangku
 * - 第二批手术折价 PDF → import-liangku-batch2-pdf
 * - 其他标准两库 PDF（如第九批限二线）→ pdf-liangku
 * - 框架/释义类 PDF → KB1 框架层条目（非知识点）
 *
 * 用法：node scripts/import-mail-liangku-all.mjs [--force] [--dry-run]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { mergeIntoKb, countKbStats, updateManifest } from './crawl/lib/merge-kb.mjs';
import { parseLiangkuFromFile } from './crawl/parsers/xlsx-liangku.mjs';
import { parseLiangkuPdf } from './crawl/parsers/pdf-liangku.mjs';
import { filterJunkPolicies } from './crawl/lib/quality.mjs';
import { slugPart } from './crawl/lib/normalize.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MAIL_DIR = path.join(ROOT, 'public-data-corpus/raw/mail-liangku');

const require = createRequire(path.join(__dirname, 'crawl/package.json'));
const pdfParse = require('pdf-parse');

const args = process.argv.slice(2);
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');

function isFrameworkPdf(name) {
  return /框架体系|规则分类与释义|知识库框架/.test(name) && !/规则对应知识点/.test(name);
}

function isBatch2Surgery(name) {
  return /第二批.*手术项目未按规定折价/.test(name) && /\.pdf$/i.test(name);
}

async function frameworkPolicies(filePath) {
  const data = await pdfParse(fs.readFileSync(filePath));
  const base = path.basename(filePath, path.extname(filePath));
  const refId = `KB1-两库框架-${slugPart(base, 24)}`;
  return [{
    doc_id: 'KB1-两库框架',
    ref_id: refId,
    layer: '框架',
    authority: '国家医疗保障局',
    doc_name: base,
    region: '全国',
    unit_type: '框架文档',
    locator: base,
    text: data.text.slice(0, 8000),
    verify_status: '✅爬虫入库(待人工抽检)',
    metadata: { crawl_source: 'mail-liangku', attachment: filePath, pages: data.numpages },
  }];
}

async function importBatch2Pdf(filePath) {
  const { execSync } = await import('child_process');
  const flag = dryRun ? '--dry-run' : '';
  const out = execSync(`node "${path.join(__dirname, 'import-liangku-batch2-pdf.mjs')}" "${filePath}" ${flag}`, { encoding: 'utf8' });
  return { stdout: out, policies: [] };
}

async function main() {
  if (!fs.existsSync(MAIL_DIR)) {
    console.error('目录不存在:', MAIL_DIR);
    process.exit(1);
  }
  const files = fs.readdirSync(MAIL_DIR)
    .filter((f) => /\.(xlsx|xls|pdf|txt)$/i.test(f) && !f.endsWith('.crdownload'))
    .map((f) => path.join(MAIL_DIR, f));

  console.log(`\n鹰眼 · 邮箱两库全量解析 · ${files.length} 个文件 force=${force} dryRun=${dryRun}`);

  const allPolicies = [];
  for (const f of files) {
    const name = path.basename(f);
    const meta = { title: name, batch: name.replace(/\.(xlsx|xls|pdf)$/i, ''), attachment: f };
    try {
      if (/\.(xlsx|xls)$/i.test(f)) {
        const parsed = parseLiangkuFromFile(f, meta);
        const { kept, rejected } = filterJunkPolicies(parsed.policies || []);
        allPolicies.push(...kept);
        console.log(`  ✓ [xlsx] ${name.slice(0, 50)} → ${kept.length}${rejected ? ` 拒${rejected}` : ''}`);
      } else if (isBatch2Surgery(name)) {
        if (!dryRun) await importBatch2Pdf(f);
        console.log(`  ✓ [pdf-batch2] ${name.slice(0, 50)} → 专用脚本`);
      } else if (isFrameworkPdf(name)) {
        const fps = await frameworkPolicies(f);
        allPolicies.push(...fps);
        console.log(`  ✓ [pdf-框架] ${name.slice(0, 50)} → 1 条框架摘要`);
      } else if (/2025年版/.test(name)) {
        // 全书 PDF 走 import-liangku-book-2025.mjs
        console.log(`  · [skip] ${name} → 请运行 import-liangku-book-2025.mjs`);
      } else if (/web系统功能/.test(name) && /\.txt$/i.test(f)) {
        const txt = fs.readFileSync(f, 'utf8');
        allPolicies.push({
          doc_id: 'KB1-两库框架',
          ref_id: 'KB1-两库框架-web系统功能说明',
          layer: '框架',
          authority: '国家医疗保障局',
          doc_name: name,
          region: '全国',
          unit_type: '系统说明',
          locator: 'web系统功能',
          text: txt.slice(0, 8000),
          verify_status: '✅爬虫入库(待人工抽检)',
          metadata: { crawl_source: 'mail-liangku', attachment: f },
        });
        console.log(`  ✓ [txt] ${name.slice(0, 50)} → 1 条系统说明`);
      } else if (/\.zip$/i.test(f)) {
        console.log(`  · [skip] ${name} 为打包文件（内含附件已单独入库）`);
      } else if (/\.pdf$/i.test(f)) {
        const parsed = await parseLiangkuPdf(f, meta);
        const { kept, rejected } = filterJunkPolicies(parsed.policies || []);
        allPolicies.push(...kept);
        console.log(`  ✓ [pdf] ${name.slice(0, 50)} → ${kept.length}${parsed.stats?.skipped ? ` (${parsed.stats.skipped})` : ''}`);
      }
    } catch (e) {
      console.error(`  ✗ ${name}: ${e.message}`);
    }
  }

  if (dryRun) {
    console.log(`\n[dry-run] 将入库 policies=${allPolicies.length}`);
    return;
  }
  if (!allPolicies.length) {
    console.log('\n⚠ 无新 xlsx/框架/pdf 条目（第二批已走独立脚本）');
    return;
  }
  const mergeStats = mergeIntoKb({ policies: allPolicies }, { force });
  const kbStats = countKbStats();
  updateManifest({ phase: 'import-mail-liangku-all', merge: mergeStats, kb: kbStats });
  console.log(`\n✅ 完成 KB1=${kbStats.kb1_entries} 两库≈${kbStats.kb1_entries} (+${mergeStats.policies.added} new ~${mergeStats.policies.updated} upd)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
