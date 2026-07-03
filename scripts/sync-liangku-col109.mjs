#!/usr/bin/env node
/**
 * 两库 col109 一键同步：自动翻页抓取国家医保局「智能监管两库」公告列表，
 * 下载全部 xlsx 附件并入库。摆脱手写 seeds.batchN + maxArticles 截断。
 *
 * 用法：
 *   node scripts/sync-liangku-col109.mjs [--dry-run] [--force] [--max-pages 15] [--max-articles 80]
 *   node scripts/sync-liangku-col109.mjs --urls <url1> <url2> …   # 直接抓指定公告页（历史批次）
 *   node scripts/sync-liangku-col109.mjs --history                # 抓内置第1-8批历史公告
 *   node scripts/sync-liangku-col109.mjs --full [--force]         # history + 列表最新批次（2025→2026 全补齐）
 *
 * col109 列表页只显示最近批次；第1-8批公告文章页仍在线，用 --history 补齐。
 * 解析颗粒度与 ref_id 与 bulk-import-local 一致（content_key 幂等 upsert）。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { crawlList } from './crawl/lib/cms-nhsa.mjs';
import { fetchArticle } from './crawl/lib/cms-nhsa.mjs';
import { downloadToRaw } from './crawl/lib/fetch.mjs';
import { parseLiangkuFromFile } from './crawl/parsers/xlsx-liangku.mjs';
import { mergeIntoKb, countKbStats, updateManifest } from './crawl/lib/merge-kb.mjs';
import { filterJunkPolicies } from './crawl/lib/quality.mjs';
import {
  loadState, saveState, hasSeenUrl, markSeenUrl,
  hasSeenAttachment, markSeenAttachment, recordRun,
} from './crawl/lib/state.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/** 第1-8批历史公告（col109 列表页已翻不到，文章页仍在线；来源：官网/搜索核实 2026-07-02） */
const HISTORY_URLS = [
  'https://www.nhsa.gov.cn/art/2025/5/23/art_109_16625.html',  // 第一批 性别/儿童 5类 11290条
  'https://www.nhsa.gov.cn/art/2025/7/22/art_109_17342.html',  // 第二批 手术项目折价 378条
  'https://www.nhsa.gov.cn/art/2025/7/30/art_109_17438.html',  // 第三批 工伤/生育 112条
  'https://www.nhsa.gov.cn/art/2025/8/8/art_109_17527.html',   // 第四批 限就医方式 736条
  'https://www.nhsa.gov.cn/art/2025/8/14/art_109_17567.html',  // 第五批 限医疗机构级别 962条
  'https://www.nhsa.gov.cn/art/2025/8/26/art_109_17691.html',  // 第六批 限支付疗程 1147条
  'https://www.nhsa.gov.cn/art/2025/12/12/art_109_19013.html', // 第七批 项目重复收费 900条
  'https://www.nhsa.gov.cn/art/2026/1/6/art_109_19250.html',   // 第八批 项目限频次/年龄等 93条
  'https://www.nhsa.gov.cn/art/2026/1/28/art_109_19496.html',  // 更新公告 8项药品类规则修订版
];

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag, def) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : def;
  };
  const urls = [];
  const ui = args.indexOf('--urls');
  if (ui >= 0) {
    for (let i = ui + 1; i < args.length && !args[i].startsWith('--'); i++) urls.push(args[i]);
  }
  if (args.includes('--history')) urls.push(...HISTORY_URLS);
  const full = args.includes('--full');
  return {
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
    maxPages: Number(get('--max-pages', '15')) || 15,
    maxArticles: Number(get('--max-articles', '80')) || 80,
    urls,
    full,
  };
}

async function main() {
  const opts = parseArgs();
  const state = loadState();
  const seed = {
    url: 'https://www.nhsa.gov.cn/col/col109/index.html',
    filter: '智能监管|两库|规则和知识点|知识点',
    maxPages: opts.maxPages,
    maxArticles: opts.maxArticles,
  };

  console.log(`\n鹰眼 两库 col109 同步 · maxPages=${opts.maxPages} maxArticles=${opts.maxArticles} dryRun=${opts.dryRun}${opts.urls.length ? ` 指定URL=${opts.urls.length}` : ''}`);

  let articles;
  if (opts.full) {
    const seen = new Set();
    articles = [];
    for (const url of HISTORY_URLS) {
      if (!seen.has(url)) { seen.add(url); articles.push({ url, title: url }); }
    }
    const list = await crawlList(seed);
    for (const a of list) {
      if (!seen.has(a.url)) { seen.add(a.url); articles.push(a); }
    }
    console.log(`--full：历史 ${HISTORY_URLS.length} + 列表 ${list.length} → 去重后 ${articles.length} 篇`);
  } else if (opts.urls.length) {
    articles = opts.urls.map((url) => ({ url, title: url }));
    console.log(`指定 ${articles.length} 篇公告页`);
  } else {
    articles = await crawlList(seed);
    console.log(`列表命中 ${articles.length} 篇两库公告`);
  }

  const allPolicies = [];
  let files = 0;

  for (const art of articles) {
    if (hasSeenUrl(state, art.url) && !opts.force) {
      console.log(`  · 跳过已抓 ${art.title.slice(0, 50)}…`);
      continue;
    }
    if (opts.dryRun) {
      console.log(`  [dry-run] ${art.title.slice(0, 60)}`);
      continue;
    }
    try {
      const full = await fetchArticle(art.url);
      markSeenUrl(state, art.url, { title: full.title });
      const xlsxAtt = full.attachments.filter((a) => /xlsx|xls/i.test(a.ext || a.url || a.label));
      if (!xlsxAtt.length) {
        console.log(`  · 无 xlsx: ${full.title.slice(0, 50)}`);
        continue;
      }
      for (const att of xlsxAtt) {
        const dl = await downloadToRaw(att.url, att.ext || 'xlsx');
        if (hasSeenAttachment(state, dl.hash) && !opts.force) continue;
        markSeenAttachment(state, dl.hash, { url: att.url, path: dl.path });
        files++;
        const meta = {
          title: full.title,
          batch: full.title,
          publishDate: full.publishDate,
          sourceUrl: seed.url,
          articleUrl: art.url,
          docNo: full.docNo,
          attachment: dl.path,
        };
        const parsed = parseLiangkuFromFile(dl.path, meta);
        const { kept, rejected } = filterJunkPolicies(parsed.policies || []);
        allPolicies.push(...kept);
        console.log(`  ✓ ${path.basename(dl.path)} ← ${full.title.slice(0, 40)}… policies=${kept.length}${rejected ? ` 拒${rejected}` : ''}`);
      }
    } catch (e) {
      console.error(`  ✗ ${art.url}: ${e.message}`);
    }
  }

  if (opts.dryRun) {
    console.log(`\n[dry-run] 将处理 ${articles.length} 篇公告`);
    return;
  }

  saveState(state);

  if (!allPolicies.length) {
    console.log('\n⚠ 未解析到新条目（可能均已抓过；用 --force 重抓）');
    return;
  }

  const mergeStats = mergeIntoKb({ policies: allPolicies }, { force: opts.force });
  const kbStats = countKbStats();
  const summary = {
    phase: 'sync-liangku-col109',
    articles: articles.length,
    files,
    crawled_policies: allPolicies.length,
    merge: mergeStats,
    kb: kbStats,
  };
  recordRun(state, summary);
  saveState(state);
  updateManifest(summary);

  const lk = (JSON.parse(fs.readFileSync(path.join(ROOT, 'prototype/data/kb/kb1_policies.json'), 'utf8')).entries || [])
    .filter((e) => e.doc_id === 'KB1-两库2025');

  console.log('\n✅ 两库同步完成');
  console.log(`   附件 ${files} 个 · 本次解析 ${allPolicies.length} 条`);
  console.log(`   KB1 总计 ${kbStats.kb1_entries}（两库 ${lk.length}）`);
  console.log(`   merge: +${mergeStats.policies.added} new ~${mergeStats.policies.updated} upd ${mergeStats.policies.deduped || 0} dedup ${mergeStats.policies.skipped} skip`);
}

main().catch((e) => {
  console.error('两库同步失败:', e);
  process.exit(1);
});
