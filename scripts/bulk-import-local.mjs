#!/usr/bin/env node
/**
 * KB 本地批量导入：把一个目录（或若干文件）里的 xlsx/pdf 直接批量入库，
 * 不再依赖「文件先挂到 URL + 手写 seeds」的爬虫链路。
 *
 * 用法：
 *   node scripts/bulk-import-local.mjs <目录或文件...> [--parser xlsx-liangku] [--dry-run] [--force]
 *
 * parser 未指定时按文件名启发式路由：
 *   两库/规则/知识点     → xlsx-liangku
 *   问题清单/自查自纠     → xlsx-problem
 *   江苏/药品目录(xlsx)  → xlsx-jiangsu
 *   药品目录(pdf)        → pdf-drug ；江苏(pdf) → pdf-jiangsu ；贯标/编码 → pdf-code
 *
 * 入库走 mergeIntoKb：ref_id upsert、✅已核实条目默认不覆盖、质量门拒绝解析垃圾。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { mergeIntoKb, countKbStats, updateManifest } from './crawl/lib/merge-kb.mjs';
import { parseLiangkuFromFile } from './crawl/parsers/xlsx-liangku.mjs';
import { parseProblemFromFile, problemDomainsToPolicies } from './crawl/parsers/xlsx-problem.mjs';
import { parseFromFile as parseDrugFromFile } from './crawl/parsers/xlsx-jiangsu.mjs';
import { parsePdfFromFile } from './crawl/parsers/pdf-drug-catalog.mjs';
import { filterJunkPolicies } from './crawl/lib/quality.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const args = process.argv.slice(2);
  const inputs = [];
  let parser = null;
  let dryRun = false;
  let force = false;
  let maxPdfMb = 30; // 超大 PDF（如73MB全量目录）pdf-parse 可能跑数分钟，默认跳过并提示
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--parser') { parser = args[++i]; continue; }
    if (args[i] === '--max-pdf-mb') { maxPdfMb = Number(args[++i]) || maxPdfMb; continue; }
    if (args[i] === '--dry-run') { dryRun = true; continue; }
    if (args[i] === '--force') { force = true; continue; }
    inputs.push(args[i]);
  }
  return { inputs, parser, dryRun, force, maxPdfMb };
}

function collectFiles(inputs) {
  const files = [];
  for (const input of inputs) {
    const full = path.resolve(input);
    if (!fs.existsSync(full)) { console.warn(`⚠ 不存在: ${input}`); continue; }
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      for (const name of fs.readdirSync(full)) {
        if (/\.(xlsx|xls|pdf)$/i.test(name)) files.push(path.join(full, name));
      }
    } else if (/\.(xlsx|xls|pdf)$/i.test(full)) {
      files.push(full);
    } else {
      console.warn(`⚠ 跳过不支持的类型: ${input}`);
    }
  }
  return files;
}

/** 文件名启发式 parser 路由 */
function guessParser(filePath) {
  const name = path.basename(filePath);
  const isPdf = /\.pdf$/i.test(name);
  if (/两库|规则库|知识点|智能监管/.test(name)) return 'xlsx-liangku';
  if (/问题清单|自查自纠/.test(name)) return 'xlsx-problem';
  if (isPdf) {
    if (/贯标|编码|code/i.test(name)) return 'pdf-code';
    if (/江苏/.test(name)) return 'pdf-jiangsu';
    return 'pdf-drug';
  }
  if (/江苏/.test(name)) return 'xlsx-jiangsu';
  if (/药品目录|目录/.test(name)) return 'xlsx-drug';
  return 'xlsx-liangku'; // 默认按两库知识点解析（质量门兜底拒垃圾）
}

async function parseOne(filePath, parser, meta) {
  const ext = path.extname(filePath).toLowerCase();
  if (/\.(xlsx|xls)$/.test(ext)) {
    if (parser === 'xlsx-liangku') return parseLiangkuFromFile(filePath, meta);
    if (parser === 'xlsx-problem') {
      const parsed = parseProblemFromFile(filePath, meta);
      const extra = problemDomainsToPolicies(parsed.problemDomains);
      parsed.policies = [...(parsed.policies || []), ...extra];
      return parsed;
    }
    if (parser === 'xlsx-jiangsu' || parser === 'xlsx-drug') return parseDrugFromFile(filePath, parser, meta);
  }
  if (ext === '.pdf') return parsePdfFromFile(filePath, parser, meta);
  return { policies: [], problemDomains: [], stats: { skipped: ext } };
}

async function main() {
  const { inputs, parser: forcedParser, dryRun, force, maxPdfMb } = parseArgs();
  if (!inputs.length) {
    console.log('用法: node scripts/bulk-import-local.mjs <目录或文件...> [--parser xxx] [--max-pdf-mb 30] [--dry-run] [--force]');
    process.exit(1);
  }
  const files = collectFiles(inputs);
  console.log(`\n鹰眼 KB 本地批量导入 · ${files.length} 个文件 dryRun=${dryRun}`);
  if (!files.length) process.exit(0);

  const allPolicies = [];
  const allDomains = [];
  for (const f of files) {
    if (/\.pdf$/i.test(f)) {
      const mb = fs.statSync(f).size / 1024 / 1024;
      if (mb > maxPdfMb) {
        console.log(`  · 跳过超大 PDF ${path.basename(f)}（${mb.toFixed(0)}MB > ${maxPdfMb}MB，可用 --max-pdf-mb 提高上限）`);
        continue;
      }
    }
    const parser = forcedParser || guessParser(f);
    const meta = {
      title: path.basename(f, path.extname(f)),
      batch: path.basename(f, path.extname(f)),
      sourceUrl: `local://${path.basename(f)}`,
      articleUrl: `local://${path.basename(f)}`,
      attachment: f,
    };
    try {
      const parsed = await parseOne(f, parser, meta);
      const { kept, rejected } = filterJunkPolicies(parsed.policies || []);
      allPolicies.push(...kept);
      allDomains.push(...(parsed.problemDomains || []));
      console.log(`  ✓ ${path.basename(f)} [${parser}] → policies=${kept.length}${rejected ? ` (质量门拒${rejected})` : ''} domains=${parsed.problemDomains?.length || 0}`);
    } catch (e) {
      console.error(`  ✗ ${path.basename(f)} 解析失败: ${e.message}`);
    }
  }

  if (dryRun) {
    console.log(`\n[dry-run] 将入库 policies=${allPolicies.length} problemDomains=${allDomains.length}，未写入。`);
    return;
  }
  if (!allPolicies.length && !allDomains.length) {
    console.log('\n⚠ 未解析到可入库条目。');
    return;
  }

  const mergeStats = mergeIntoKb({ policies: allPolicies, problemDomains: allDomains }, { force });
  const kbStats = countKbStats();
  updateManifest({ phase: 'bulk-import-local', crawled_policies: allPolicies.length, crawled_domains: allDomains.length, merge: mergeStats, kb: kbStats });

  console.log('\n✅ 批量导入完成');
  console.log(`   KB1 policies: ${kbStats.kb1_entries} (+${mergeStats.policies.added} new, ~${mergeStats.policies.updated} updated, ${mergeStats.policies.skipped} protected-skip, ${mergeStats.policies.rejected || 0} 质量门拒)`);
  console.log(`   问题清单 items: ${kbStats.problem_items}`);
  console.log('\n后续（可选，接 Live RAG）：');
  console.log('   node scripts/ingest-kb-to-supabase.js && node scripts/embed-kb-chunks.js');
}

main().catch((e) => {
  console.error('批量导入失败:', e);
  process.exit(1);
});
