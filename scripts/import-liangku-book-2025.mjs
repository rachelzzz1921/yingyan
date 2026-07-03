#!/usr/bin/env node
/**
 * 解析《医疗保障基金智能监管规则库、知识库（2025年版）》PDF（全书）。
 * 按「"XXX"规则对应知识点明细」分节（过滤正文内嵌引号造成的假节），抽取知识点入库。
 *
 * 用法：node scripts/import-liangku-book-2025.mjs [--dry-run] [--force]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { mergeIntoKb, countKbStats, updateManifest } from './crawl/lib/merge-kb.mjs';
import { refIdLiangkuStable, slugPart } from './crawl/lib/normalize.mjs';
import { isJunkPolicyText, filterJunkPolicies } from './crawl/lib/quality.mjs';

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), 'crawl/package.json'));
const pdfParse = require('pdf-parse');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOOK = path.join(ROOT, 'public-data-corpus/raw/mail-liangku/医疗保障基金智能监管规则库、知识库（2025年版）-1.pdf');
const SEC_RE = /[\u201c"]([^\u201d"]+)[\u201d"]规则对应知识点明细/g;

const DRUG_TAIL = '(?:片|胶囊|注射液|颗粒|丸|散|膏|栓|滴|液|酶|单抗|索|苷|剂|乳|贴|雾|粉|锭|胶|浓溶液|干混悬剂|缓释片|肠溶片|分散片|软膏|凝胶|乳膏|合剂|口服液|煎膏|疫苗|毒素|法新|单抗注射液)';

function isValidSectionName(name) {
  const n = String(name || '').trim();
  if (!n || n.length > 28 || n.length < 4) return false;
  if (/^\d/.test(n) || /\d{3,}/.test(n)) return false;
  if (/与限定|不符|使用了该药品|参保人|完善创新|合计|序号药品/.test(n)) return false;
  if (/[A-Za-z]{3,}/.test(n)) return false;
  return /^[\u4e00-\u9fa5（）()、·\s]{2,28}$/.test(n);
}

function buildPolicy({ category, name, logic, basis, seq, text, code, meta }) {
  const refId = refIdLiangkuStable(category, name, seq);
  return {
    doc_id: 'KB1-两库2025',
    ref_id: refId,
    layer: '规则',
    authority: '国家医疗保障局',
    doc_name: '医疗保障基金智能监管规则库、知识库（2025年版）',
    effective_from: '2026-02-12',
    region: '全国',
    unit_type: '知识点',
    locator: category,
    text: text.slice(0, 2000),
    violation_tags: [],
    linked_rules: [],
    source_url: meta.sourceUrl || 'book-2025-pdf',
    verify_status: '✅爬虫入库(待人工抽检)',
    metadata: {
      crawl_source: 'liangku-book-2025',
      batch: '2025全书',
      rule_category: category,
      item_name: name,
      row_seq: Number(seq),
      content_key: `${slugPart(category, 20)}|${slugPart(name, 24)}|${seq}`,
      detect_logic: logic || null,
      payment_basis: basis || null,
      drug_codes: code ? [code] : [],
      attachment: BOOK,
    },
  };
}

function parseDrugSection(flat, category, meta) {
  const policies = [];
  const re = new RegExp(
    `(\\d{1,4})` +
    `([\\u4e00-\\u9fa5][\\u4e00-\\u9fa5A-Za-z0-9（）()±+\\-·]{1,48}?${DRUG_TAIL})` +
    `(使用了该药品[^\\d]{8,160}?|参保人[^\\d]{4,80}?|使用药品[^\\d]{4,80}?)` +
    `(限[：:][^\\d]{4,1200}?)` +
    `(?=\\d{1,4}[\\u4e00-\\u9fa5]|合计|序号|$)`,
    'g',
  );
  let m;
  while ((m = re.exec(flat)) !== null) {
    const [, seq, rawName, logicPart, basisPart] = m;
    const name = rawName.replace(/\s+/g, '').trim();
    const logic = (logicPart || '').replace(/\s+/g, '').slice(0, 200);
    const basis = (basisPart || '').replace(/\s+/g, ' ').trim().slice(0, 1500);
    const text = [name, logic, basis].filter((x) => x && x.length > 2).join(' · ');
    if (isJunkPolicyText(text)) continue;
    policies.push(buildPolicy({ category, name, logic, basis, seq, text, meta }));
  }
  return policies;
}

function parseTcmSection(flat, category, meta) {
  const policies = [];
  const re = /(\d{1,4})([\u4e00-\u9fa5]{2,12})(T\d{10,})?([^合计\d]{4,120}?)(单独使用|不得纳入|单复方均不予|单方使用不予)/g;
  let m;
  while ((m = re.exec(flat)) !== null) {
    const [, seq, name, code, logic, flag] = m;
    const text = [name, logic.replace(/逻辑依据.*/, '').trim(), flag, code].filter(Boolean).join(' · ');
    if (isJunkPolicyText(text)) continue;
    policies.push(buildPolicy({ category, name, logic, basis: flag, seq, text, code, meta }));
  }
  return policies;
}

function parseGenderDrugSection(flat, category, meta) {
  const policies = [];
  const re = /(\d{1,4})([\u4e00-\u9fa5][\u4e00-\u9fa5A-Za-z0-9（）()·]{1,40}?(?:片|胶囊|颗粒|丸|注射液|栓|滴眼液|软膏|凝胶))([男女])与限定性别不符([^0-9]{0,200})/g;
  let m;
  while ((m = re.exec(flat)) !== null) {
    const [, seq, name, gender, note] = m;
    const logic = `${gender}与限定性别不符`;
    const text = [name, logic, note.trim()].filter(Boolean).join(' · ');
    if (isJunkPolicyText(text)) continue;
    policies.push(buildPolicy({ category, name, logic, basis: note.trim(), seq, text, meta }));
  }
  return policies;
}

function parseSection(chunk, category, meta) {
  if (/中药饮片/.test(category)) return parseTcmSection(chunk, category, meta);
  if (/区分性别|儿童专用|儿童禁用/.test(category) && /与限定性别不符|儿童专用|儿童禁用/.test(chunk)) {
    const gender = parseGenderDrugSection(chunk, category, meta);
    if (gender.length) return gender;
  }
  if (/重复收费|手术项目|医疗服务项目/.test(category) && !/药品/.test(category)) {
    return []; // 项目类以 xlsx 为准，全书 PDF 表格结构差异大
  }
  return parseDrugSection(chunk, category, meta);
}

function extractSections(flat) {
  const hits = [...flat.matchAll(SEC_RE)]
    .map((m) => ({ cat: m[1].trim(), idx: m.index }))
    .filter((h) => isValidSectionName(h.cat));

  const byCat = new Map();
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].idx;
    const end = i + 1 < hits.length ? hits[i + 1].idx : flat.length;
    const len = end - start;
    const prev = byCat.get(hits[i].cat);
    if (!prev || prev.len < len) byCat.set(hits[i].cat, { cat: hits[i].cat, chunk: flat.slice(start, end), len });
  }
  return [...byCat.values()];
}

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

  const sections = extractSections(flat);
  console.log(`  有效规则类 ${sections.length} 个（已去重、过滤假节标题）`);

  const meta = { title: '2025全书', sourceUrl: 'book-2025-pdf' };
  const allPolicies = [];
  for (const { cat, chunk } of sections) {
    const rows = parseSection(chunk, cat, meta);
    if (rows.length) console.log(`  · ${cat} → ${rows.length}`);
    allPolicies.push(...rows);
  }

  const { kept, rejected } = filterJunkPolicies(allPolicies);
  console.log(`\n合计解析 ${kept.length} 条（质量门拒 ${rejected}）`);

  if (dryRun) {
    console.log('[dry-run] 未写入');
    return;
  }
  const stats = mergeIntoKb({ policies: kept }, { force: process.argv.includes('--force') });
  const kbStats = countKbStats();
  updateManifest({ phase: 'import-liangku-book-2025', parsed: kept.length, merge: stats, kb: kbStats });
  console.log(`\n✅ 全书入库完成 KB1=${kbStats.kb1_entries} (+${stats.policies.added} new ~${stats.policies.updated} upd)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
