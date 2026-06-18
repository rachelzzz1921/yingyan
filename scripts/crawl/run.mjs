#!/usr/bin/env node
/**
 * KB1 爬虫入口
 * 用法: node run.mjs --phase batch1|batch2 [--dry-run] [--force]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchArticle, crawlList } from './lib/cms-nhsa.mjs';
import { downloadToRaw } from './lib/fetch.mjs';
import { enumerateCodeNhsaSeeds } from './lib/code-nhsa.mjs';
import {
  loadState, saveState, hasSeenUrl, markSeenUrl,
  hasSeenAttachment, markSeenAttachment, recordRun,
} from './lib/state.mjs';
import { mergeIntoKb, countKbStats, updateManifest } from './lib/merge-kb.mjs';
import { parseArticle } from './parsers/article.mjs';
import { parseLiangkuFromFile } from './parsers/xlsx-liangku.mjs';
import { parseProblemFromFile, problemDomainsToPolicies } from './parsers/xlsx-problem.mjs';
import { parseFromFile as parseDrugFromFile } from './parsers/xlsx-jiangsu.mjs';
import { parseHtmlGuide } from './parsers/html-guide.mjs';
import { parseCaseExposure } from './parsers/case-exposure.mjs';
import { parseHtmlJiangsu } from './parsers/html-jiangsu.mjs';
import { parsePdfFromFile } from './parsers/pdf-drug-catalog.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HTML_PARSERS = new Set(['html-guide', 'case-exposure', 'html-jiangsu', 'article', 'article-only']);
const PDF_PARSERS = new Set(['pdf-drug', 'pdf-jiangsu', 'pdf-jiangsu-nursing', 'pdf-code']);

function parseArgs() {
  const args = process.argv.slice(2);
  const phase = args.includes('--phase') ? args[args.indexOf('--phase') + 1] : 'batch1';
  return { phase, dryRun: args.includes('--dry-run'), force: args.includes('--force') };
}

function loadSeeds(phase) {
  const p = path.join(__dirname, `seeds.${phase}.json`);
  if (!fs.existsSync(p)) throw new Error(`种子文件不存在: ${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function parseArticleByParser(parser, full, seed, meta) {
  const mergedSeed = { ...seed, ...meta };
  if (parser === 'html-guide') return parseHtmlGuide(full, mergedSeed);
  if (parser === 'case-exposure') return parseCaseExposure(full, mergedSeed);
  if (parser === 'html-jiangsu') return parseHtmlJiangsu(full, mergedSeed);
  if (parser === 'article' || parser === 'article-only') return parseArticle(full, mergedSeed);
  return { policies: [], problemDomains: [], stats: {} };
}

async function parseAttachmentFile(dl, parser, meta) {
  const ext = (dl.ext || '').toLowerCase();
  if (/xlsx|xls/.test(ext)) {
    if (parser === 'xlsx-liangku') return parseLiangkuFromFile(dl.path, meta);
    if (parser === 'xlsx-problem') {
      const parsed = parseProblemFromFile(dl.path, meta);
      const extra = problemDomainsToPolicies(parsed.problemDomains);
      parsed.policies = [...(parsed.policies || []), ...extra];
      return parsed;
    }
    if (parser === 'xlsx-jiangsu' || parser === 'xlsx-drug') return parseDrugFromFile(dl.path, parser, meta);
  }
  if (/pdf/.test(ext) && PDF_PARSERS.has(parser)) {
    return parsePdfFromFile(dl.path, parser, meta);
  }
  return { policies: [], problemDomains: [], stats: { skipped: ext, parse_status: 'pending' } };
}

async function processAttachments(attachments, parser, meta, state, dryRun, opts = {}) {
  const allPolicies = [];
  const allDomains = [];
  const stats = { attachments: 0, skipped: 0, pdfArchived: 0 };

  for (const att of attachments) {
    const isXlsx = /xlsx|xls/i.test(att.ext || att.url || att.label);
    const isPdf = /pdf/i.test(att.ext || att.url || att.label);
    const allowPdf = opts.archivePdf || PDF_PARSERS.has(parser);
    if (!isXlsx && !(isPdf && allowPdf)) {
      stats.skipped++;
      continue;
    }
    if (dryRun) {
      console.log(`  [dry-run] 附件 ${att.label || att.url}`);
      continue;
    }
    const dl = await downloadToRaw(att.url, att.ext || (isPdf ? 'pdf' : 'xlsx'));
    if (hasSeenAttachment(state, dl.hash) && !opts?.force) {
      stats.skipped++;
      continue;
    }
    markSeenAttachment(state, dl.hash, { url: att.url, path: dl.path });
    stats.attachments++;
    if (isPdf) stats.pdfArchived++;

    const parsed = await parseAttachmentFile(dl, parser, { ...meta, attachment: dl.path });
    allPolicies.push(...(parsed.policies || []));
    allDomains.push(...(parsed.problemDomains || []));
    console.log(`  ✓ 附件 ${path.basename(dl.path)} → policies=${parsed.policies?.length || 0} domains=${parsed.problemDomains?.length || 0}`);
  }
  return { policies: allPolicies, problemDomains: allDomains, stats };
}

async function processArticleContent(full, seed, meta, state, opts) {
  const policies = [];
  const problemDomains = [];
  const parser = seed.parser;

  if (HTML_PARSERS.has(parser)) {
    const r = parseArticleByParser(parser, full, seed, meta);
    policies.push(...(r.policies || []));
    console.log(`  ✓ 正文解析 ${r.policies?.length || 0} 条 (${parser})`);
  }

  const xlsxAtt = full.attachments.filter((a) => /xlsx|xls/i.test(a.ext || a.url || a.label));
  if (xlsxAtt.length) {
    const r = await processAttachments(xlsxAtt, parser, meta, state, opts.dryRun, { ...opts, archivePdf: seed.archivePdf });
    policies.push(...r.policies);
    problemDomains.push(...r.problemDomains);
  }

  const pdfAtt = full.attachments.filter((a) => /pdf/i.test(a.ext || a.url || a.label));
  if (pdfAtt.length && (seed.archivePdf || PDF_PARSERS.has(parser))) {
    const pdfParser = PDF_PARSERS.has(parser) ? parser : seed.pdfParser || parser;
    const r = await processAttachments(pdfAtt, pdfParser, meta, state, opts.dryRun, { ...opts, archivePdf: true, force: opts.force });
    policies.push(...r.policies);
    problemDomains.push(...r.problemDomains);
  } else if (pdfAtt.length && parser !== 'article' && !HTML_PARSERS.has(parser)) {
    console.log(`  · ${pdfAtt.length} 个 PDF 附件已跳过（未配置解析器）`);
  }

  return { policies, problemDomains };
}

async function runListSeed(seed, state, opts) {
  const policies = [];
  const problemDomains = [];
  const meta = { sourceUrl: seed.url, articleUrl: seed.url, title: seed.name };
  const articles = await crawlList(seed);
  console.log(`  列表命中 ${articles.length} 篇`);
  const isXlsxList = seed.parser === 'xlsx-liangku' || seed.parser === 'xlsx-problem' || seed.parser === 'xlsx-jiangsu';

  for (const art of articles) {
    if (hasSeenUrl(state, art.url) && !opts.force) {
      console.log(`  · 跳过已抓 ${art.title.slice(0, 40)}…`);
      continue;
    }
    if (opts.dryRun) {
      console.log(`  [dry-run] ${art.url}`);
      continue;
    }
    try {
      const full = await fetchArticle(art.url);
      markSeenUrl(state, art.url, { title: full.title });
      const batchMeta = {
        ...meta,
        title: full.title,
        publishDate: full.publishDate,
        articleUrl: art.url,
        batch: full.title,
      };

      if (isXlsxList) {
        const xlsxAtt = full.attachments.filter((a) => /xlsx|xls/i.test(a.ext || a.url || a.label));
        if (!xlsxAtt.length) {
          if (seed.archivePdf && full.attachments.some((a) => /pdf/i.test(a.ext || a.url))) {
            const r = await processAttachments(full.attachments, seed.parser, batchMeta, state, opts.dryRun, { ...opts, archivePdf: true });
            policies.push(...r.policies);
          } else {
            console.log(`  · 无 xlsx 附件: ${full.title.slice(0, 50)}`);
          }
          continue;
        }
        const r = await processAttachments(xlsxAtt, seed.parser, batchMeta, state, opts.dryRun, opts);
        policies.push(...r.policies);
        problemDomains.push(...r.problemDomains);
      } else {
        const r = await processArticleContent(full, seed, batchMeta, state, opts);
        policies.push(...r.policies);
        problemDomains.push(...r.problemDomains);
      }
    } catch (e) {
      console.error(`  · 跳过 ${art.url}: ${e.message}`);
    }
  }
  return { policies, problemDomains };
}

async function runCodeNhsaSeed(seed, state, opts) {
  const policies = [];
  const meta = { sourceUrl: 'https://code.nhsa.gov.cn/', title: seed.name };
  const items = await enumerateCodeNhsaSeeds(seed.sysflags || []);
  console.log(`  code.nhsa 批次 ${items.length}`);
  for (const item of items) {
    if (!item.url) {
      console.log(`  · sysflag=${item.sysflag} 无 PDF: ${item.error || '未找到'}`);
      continue;
    }
    if (opts.dryRun) {
      console.log(`  [dry-run] ${item.url}`);
      continue;
    }
    const dl = await downloadToRaw(item.url, 'pdf');
    if (hasSeenAttachment(state, dl.hash) && !opts.force) continue;
    markSeenAttachment(state, dl.hash, { url: item.url, path: dl.path });
    const parsed = await parsePdfFromFile(dl.path, seed.parser || 'pdf-code', {
      ...meta,
      title: item.title,
      sysflag: item.sysflag,
      articleUrl: item.pageUrl,
      attachment: dl.path,
    });
    policies.push(...(parsed.policies || []));
    console.log(`  ✓ sysflag=${item.sysflag} → policies=${parsed.policies?.length || 0}`);
  }
  return { policies, problemDomains: [] };
}

async function runSeed(seed, state, opts) {
  console.log(`\n▸ ${seed.name} (${seed.id})`);
  if (seed.type === 'code-nhsa') return runCodeNhsaSeed(seed, state, opts);
  if (seed.type === 'attachment' && seed.attachments?.length) {
    const meta = { sourceUrl: seed.url, articleUrl: seed.url, title: seed.name };
    return processAttachments(seed.attachments, seed.parser, meta, state, opts.dryRun, opts);
  }
  if (seed.type === 'list') return runListSeed(seed, state, opts);
  if (seed.type === 'article') {
    if (opts.dryRun) {
      console.log(`  [dry-run] ${seed.url}`);
      return { policies: [], problemDomains: [] };
    }
    if (hasSeenUrl(state, seed.url) && !opts.force) {
      console.log('  · 已抓过，使用 --force 可重抓');
    }
    const full = await fetchArticle(seed.url);
    markSeenUrl(state, seed.url, { title: full.title });
    const meta = {
      sourceUrl: seed.url,
      articleUrl: seed.url,
      title: full.title,
      publishDate: full.publishDate,
      docNo: full.docNo,
    };
    return processArticleContent(full, seed, meta, state, opts);
  }
  return { policies: [], problemDomains: [] };
}

async function main() {
  const opts = parseArgs();
  const seedsDoc = loadSeeds(opts.phase);
  const state = loadState();
  console.log(`\n鹰眼 KB1 爬虫 · phase=${opts.phase} dryRun=${opts.dryRun}`);

  const allPolicies = [];
  const allDomains = [];

  for (const seed of seedsDoc.seeds) {
    try {
      const r = await runSeed(seed, state, opts);
      allPolicies.push(...r.policies);
      allDomains.push(...r.problemDomains);
    } catch (e) {
      console.error(`  ✗ ${seed.id} 失败: ${e.message}`);
      if (e.code === 'HTTP_403') {
        state.needs_playwright = state.needs_playwright || [];
        if (!state.needs_playwright.includes(seed.id)) state.needs_playwright.push(seed.id);
        console.error('    → 已标记 needs_playwright，可 Phase3 Playwright 降级');
      }
    }
  }

  if (!opts.dryRun) saveState(state);

  if (opts.dryRun) {
    console.log(`\n[dry-run] 将入库 policies≈${allPolicies.length} problemDomains≈${allDomains.length}`);
    return;
  }

  if (!allPolicies.length && !allDomains.length) {
    console.log('\n⚠ 未解析到新条目（可能已抓过或附件为 PDF）');
    recordRun(state, { phase: opts.phase, policies: 0, domains: 0, note: 'empty' });
    saveState(state);
    process.exit(0);
  }

  const mergeStats = mergeIntoKb({ policies: allPolicies, problemDomains: allDomains }, { force: opts.force });
  const kbStats = countKbStats();
  const summary = { phase: opts.phase, crawled_policies: allPolicies.length, crawled_domains: allDomains.length, merge: mergeStats, kb: kbStats };
  recordRun(state, summary);
  saveState(state);
  updateManifest(summary);

  console.log('\n✅ 爬虫完成');
  console.log(`   KB1 policies: ${kbStats.kb1_entries} (+${mergeStats.policies.added} new, ~${mergeStats.policies.updated} updated, ${mergeStats.policies.skipped} protected-skip)`);
  console.log(`   问题清单 items: ${kbStats.problem_items}`);
}

main().catch((e) => {
  console.error('爬虫失败:', e);
  process.exit(1);
});
