#!/usr/bin/env node
/**
 * 第二批两库「手术项目未按规定折价收费」只有 PDF 附件（无 xlsx）。
 * 本脚本从 PDF 抽取 378 条知识点入库，颗粒度与 xlsx-liangku 一致。
 *
 * 用法：node scripts/import-liangku-batch2-pdf.mjs <pdf路径> [--dry-run]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { mergeIntoKb, countKbStats, updateManifest } from './crawl/lib/merge-kb.mjs';
import { refIdLiangkuStable, slugPart } from './crawl/lib/normalize.mjs';
import { isJunkPolicyText } from './crawl/lib/quality.mjs';

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), 'crawl/package.json'));
const pdfParse = require('pdf-parse');

const CATEGORY = '手术项目未按规定折价收费';
const LOGIC = '经同一切口进行的两种及以上不同的手术，第二及以后的手术未按规定折价计收';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const pdfPath = args.find((a) => !a.startsWith('--'));
if (!pdfPath || !fs.existsSync(pdfPath)) {
  console.error('用法: node scripts/import-liangku-batch2-pdf.mjs <pdf路径> [--dry-run]');
  process.exit(1);
}

const data = await pdfParse(fs.readFileSync(pdfPath));
// 去掉换行拼成整体文本，再按「序号+名称+检出逻辑+组别+15位代码」切
const flat = data.text.replace(/\n/g, '');
const re = /(\d{1,3})((?:(?!经同一切口).){2,80}?)经同一切口进行的两种及以上不同的手术，第二及以后的手术未按规定折价计收((?:(?!\d{15}).){2,30}?组)(\d{15})/g;

const policies = [];
let m;
while ((m = re.exec(flat)) !== null) {
  const [, seq, rawName, group, code] = m;
  const name = rawName.replace(/各省依据国家项目代码，配置规则知识点中各省项目代码/g, '').trim();
  if (!name) continue;
  const text = [name, LOGIC, `切口组别:${group.trim()}`, `项目代码: ${code}`].join(' · ');
  if (isJunkPolicyText(text)) continue;
  policies.push({
    doc_id: 'KB1-两库2025',
    ref_id: refIdLiangkuStable(CATEGORY, name, seq),
    layer: '规则',
    authority: '国家医疗保障局',
    doc_no: null,
    doc_name: '国家医保局关于公开发布第二批智能监管“两库”规则和知识点的公告',
    effective_from: '2025-07-22',
    effective_to: null,
    region: '全国',
    unit_type: '知识点',
    locator: CATEGORY,
    text: text.slice(0, 2000),
    violation_tags: [],
    linked_rules: [],
    source_url: 'https://www.nhsa.gov.cn/art/2025/7/22/art_109_17342.html',
    verify_status: '✅爬虫入库(待人工抽检)',
    metadata: {
      crawl_source: 'liangku-col109',
      batch: '第二批',
      rule_category: CATEGORY,
      item_name: name,
      row_seq: Number(seq),
      content_key: `${slugPart(CATEGORY, 20)}|${slugPart(name, 24)}|${seq}`,
      detect_logic: LOGIC,
      payment_basis: `同切口组别:${group.trim()}`,
      drug_codes: [code],
      drug_or_item_code: code,
      attachment: pdfPath,
    },
  });
}

console.log(`解析出 ${policies.length} 条（官方口径 378 条）`);
if (dryRun) {
  console.log('[dry-run] 未写入。样例:');
  console.log(JSON.stringify(policies[0], null, 2)?.slice(0, 600));
  process.exit(0);
}

const stats = mergeIntoKb({ policies });
const kbStats = countKbStats();
updateManifest({ phase: 'liangku-batch2-pdf', crawled_policies: policies.length, merge: stats, kb: kbStats });
console.log(`✅ 入库完成 KB1=${kbStats.kb1_entries} (+${stats.policies.added} ~${stats.policies.updated})`);
