#!/usr/bin/env node
/**
 * 从《规则库、知识库（2025年版）》全书 PDF 抽出的文本(/tmp/book2025.txt)中
 * 解析"一、智能监管规则列表"——88 类规则(序号/一级分类/二级分类/规则名称/是否对应知识点明细)。
 * 与框架体系 1.0(79 条 GZ)按规则名称交叉映射，标注哪 9 类为 2025 年版新增。
 * 产出：kb/two_libraries/rule_catalog_2025_88.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BOOK_TXT = '/tmp/book2025.txt';
const CATALOG79 = path.join(ROOT, 'public-data-corpus/kb/official_rules_catalog.json');
const OUT = path.join(ROOT, 'kb/two_libraries/rule_catalog_2025_88.json');

const TIER2 = ['药品政策限定类', '医疗服务项目政策限定类', '医用耗材政策限定类',
  '信息数据监管类', '药品监管类', '医用耗材监管类', '行为主体监管类', '统计指标监测类',
  '药品合理使用类', '医疗服务项目合理使用类', '医用耗材合理使用类'];

function cleanName(name) {
  // 框架 catalog 部分名混入定义/页脚(PDF 抽取污染)，取规则名前缀用于匹配
  return String(name).replace(/^-管理要求/, '')
    .replace(/(对各级|对医保|对结算|对就诊|对收费|对院内|对31天|对仅|对儿童|对超|对单位|1规则编码|3规则编码).*$/, '')
    .trim();
}

const text = fs.readFileSync(BOOK_TXT, 'utf8');
const start = text.indexOf('一、智能监管规则列表');
let end = text.indexOf('二、', start + 10);
if (end < 0 || end - start > 20000) end = start + 20000;
// 逐行过滤分页页眉/页脚(书名、"续 表"含全角空格、第一部分标题、纯数字页码、表头行)
const NOISE = [/^医疗保障基金智能监管规则库、知识库（2025年版）$/, /^序号一级分类二级分类规则名称是否对应知识点明细$/,
  /^第一部分/, /续\s*表/, /^\d{1,3}$/, /^一、智能监管规则列表$/];
const sec = text.slice(start, end)
  .split('\n')
  .map((l) => l.replace(/[　\s]/g, ''))
  .filter((l) => l && !NOISE.some((rx) => rx.test(l)))
  .join('');

const tier2Alt = TIER2.join('|');
const re = new RegExp(`(\\d+)(政策类|管理类|医疗类)(${tier2Alt})([\\s\\S]*?)(是|否)(?=\\d+(?:政策类|管理类|医疗类)|$)`, 'g');
const rules = [];
let m;
while ((m = re.exec(sec)) !== null) {
  rules.push({
    seq: Number(m[1]),
    tier1: m[2],
    tier2: m[3],
    name: m[4].trim().replace(/^[-－]*管理要求/, ''),
    has_kp_detail: m[5] === '是',
  });
}

// 与 79 框架按名称映射 GZ
const cat79 = JSON.parse(fs.readFileSync(CATALOG79, 'utf8'));
const name2gz = new Map();
for (const r of cat79.rules_flat) name2gz.set(cleanName(r.name), r.official_code);
let mapped = 0;
const newIn2025 = [];
for (const r of rules) {
  const gz = name2gz.get(r.name) || null;
  r.gz_code_1_0 = gz;
  r.new_in_2025 = !gz;
  if (gz) mapped++; else newIn2025.push(`${r.seq}.${r.name}`);
}

const out = {
  meta: {
    source: '《医疗保障基金智能监管规则库、知识库（2025年版）》· 第一部分 一、智能监管规则列表',
    artifact: 'public-data-corpus/raw/mail-liangku/医疗保障基金智能监管规则库、知识库（2025年版）-1.pdf',
    extracted_at: '2026-07-05',
    total_rules: rules.length,
    tier1_breakdown: rules.reduce((a, r) => { a[r.tier1] = (a[r.tier1] || 0) + 1; return a; }, {}),
    has_kp_detail_count: rules.filter((r) => r.has_kp_detail).length,
    mapped_to_1_0_gz: mapped,
    new_in_2025_count: newIn2025.length,
    new_in_2025: newIn2025,
    note: '88类为2025年版全量口径；gz_code_1_0 为框架体系1.0(79条)按名映射，new_in_2025=true 者为1.0未收录的新增类。',
  },
  rules,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`✓ 解析 ${rules.length} 类规则`);
console.log(`  一级分类:`, JSON.stringify(out.meta.tier1_breakdown));
console.log(`  对应知识点明细(是): ${out.meta.has_kp_detail_count}`);
console.log(`  映射到1.0 GZ: ${mapped} / 新增(2025): ${newIn2025.length}`);
console.log(`  新增类:`, newIn2025.join('、'));
