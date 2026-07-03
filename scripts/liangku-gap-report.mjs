#!/usr/bin/env node
/**
 * 2025 出版物基线 vs 2026 官网分批更新 — 差距报告
 * 用法：node scripts/liangku-gap-report.mjs [--json]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KB_PATH = path.join(ROOT, 'prototype/data/kb/kb1_policies.json');
const OUT_MD = path.join(ROOT, 'docs/liangku-gap-2025-vs-2026.md');

/** 官网公告口径：批次 → { 日期, 主题, 官方条数(编码/知识点展开级) } */
const OFFICIAL_BATCHES = [
  { batch: '第一批', date: '2025-05-23', topic: '性别/儿童 5类', official: 11290, note: '编码级展开' },
  { batch: '第二批', date: '2025-07-22', topic: '手术项目未按规定折价收费', official: 378 },
  { batch: '第三批', date: '2025-07-30', topic: '工伤/生育保险', official: 112 },
  { batch: '第四批', date: '2025-08-08', topic: '药品限就医方式', official: 736 },
  { batch: '第五批', date: '2025-08-14', topic: '药品限医疗机构级别', official: 962 },
  { batch: '第六批', date: '2025-08-26', topic: '药品限支付疗程', official: 1147 },
  { batch: '第七批', date: '2025-12-12', topic: '医疗服务项目重复收费', official: 900 },
  { batch: '第八批', date: '2026-01-06', topic: '项目限频次/年龄/疗程/超频次', official: 93 },
  { batch: '2026更新', date: '2026-01-28', topic: '8项药品类规则修订(2025药目录)', official: null, note: '覆盖修订非新增批次' },
  { batch: '第九批', date: '2026-04-21', topic: '药品限二线使用', official: 601 },
  { batch: '第十批', date: '2026-05-xx', topic: '超互联网医院药品支付范围', official: null },
  { batch: '第十一批', date: '2026-05-xx', topic: '中药饮片单方/单复方', official: null },
  { batch: '第十二批', date: '2026-05-23', topic: '药品限适应症(消化代谢)', official: null, note: '部分知识点' },
  { batch: '第十三批', date: '2026-06-xx', topic: '药品限适应症(部分)', official: null, note: '部分知识点' },
  { batch: '第十四批', date: '2026-06-xx', topic: '药品限适应症(部分)', official: null, note: '部分知识点' },
  { batch: '第十五批', date: '2026-06-xx', topic: '药品限适应症(部分)', official: null, note: '部分知识点' },
  { batch: '第十六批', date: '2026-06-22', topic: '药品限适应症(抗感染等)', official: null, note: '部分知识点' },
  { batch: '第十七批', date: '2026-06-22', topic: '药品限适应症(最新)', official: null, note: '部分知识点' },
];

const BOOK_2025 = {
  title: '《医疗保障基金智能监管规则库、知识库（2025年版）》',
  publish: '2026-02-12',
  rules: 88,
  knowledge_points: 247000,
  note: '全量编码级；购书扫码电子版。邮箱附件 -1.pdf 若未下完则库内无全书条目。',
};

function countInKb(kb) {
  const lk = (kb.entries || []).filter((e) => e.doc_id === 'KB1-两库2025');
  const byBatch = {};
  const byCat = {};
  for (const e of lk) {
    const dn = e.doc_name || '';
    const batchKey = OFFICIAL_BATCHES.find((b) => dn.includes(b.batch.replace('2026更新', '更新')))?.batch
      || (dn.match(/第(\d+|一|二|三|四|五|六|七|八|九|十|十一|十二|十三|十四|十五|十六|十七)批/) || [])[0]
      || '其他';
    byBatch[batchKey] = (byBatch[batchKey] || 0) + 1;
    const c = (e.metadata?.rule_category || '?').replace(/[\u201c\u201d]/g, '');
    byCat[c] = (byCat[c] || 0) + 1;
  }
  return { total: lk.length, byBatch, byCat, framework: (kb.entries || []).filter((e) => e.doc_id === 'KB1-两库框架').length };
}

function mapCategoryToBatch(cat) {
  const m = {
    '药品区分性别使用': '第一批',
    '医疗服务项目区分性别使用': '第一批',
    '药品儿童专用': '第一批',
    '药品限儿童使用': '第一批',
    '医疗服务项目儿童专用': '第一批',
    '手术项目未按规定折价收费': '第二批',
    '药品限工伤保险': '第三批',
    '药品限生育保险': '第三批',
    '药品限就医方式': '第四批',
    '药品限医疗机构级别': '第五批',
    '药品限支付疗程': '第六批',
    '医疗服务项目重复收费': '第七批',
    '医疗服务项目限定频次': '第八批',
    '医疗服务项目限年龄': '第八批',
    '医疗服务项目限支付疗程': '第八批',
    '医疗服务项目周期超频次': '第八批',
    '药品限二线使用': '第九批',
    '超互联网医院药品支付范围': '第十批',
    '中药饮片单方使用不予支付': '第十一批',
    '中药饮片单复方均不予支付': '第十一批',
    '药品限适应症': '第十二~十七批',
  };
  return m[cat] || '—';
}

function main() {
  const kb = JSON.parse(fs.readFileSync(KB_PATH, 'utf8'));
  const stats = countInKb(kb);
  const mailDir = path.join(ROOT, 'public-data-corpus/raw/mail-liangku');
  const mailFiles = fs.existsSync(mailDir) ? fs.readdirSync(mailDir).filter((f) => !f.endsWith('.crdownload')) : [];
  const bookIncomplete = mailFiles.some((f) => f.includes('2025年版') && f.endsWith('.crdownload'))
    || !mailFiles.some((f) => f.includes('2025年版') && f.endsWith('.pdf') && !f.endsWith('.crdownload'));

  const lines = [];
  lines.push('# 两库 KB 差距报告：2025 出版物 vs 2026 官网更新');
  lines.push('');
  lines.push(`> 生成时间：${new Date().toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push('## 1. 口径说明');
  lines.push('');
  lines.push('| 口径 | 说明 |');
  lines.push('|------|------|');
  lines.push(`| **2025 全书** | ${BOOK_2025.title}，${BOOK_2025.rules} 类规则、约 ${BOOK_2025.knowledge_points.toLocaleString()} 条**编码级**知识点（${BOOK_2025.publish} 出版） |`);
  lines.push('| **官网分批** | 2025-05 起第 1–8 批 + 2026-01 修订 + 第 9–17 批；附件 xlsx/pdf 为**药品/项目级**（编码聚合在 `drug_codes`） |');
  lines.push(`| **库内现况** | 两库 **${stats.total}** 条（${Object.keys(stats.byCat).length} 类），框架摘要 **${stats.framework}** 条 |`);
  lines.push('');
  lines.push('## 2. 2025 → 2026 时间线（官方）');
  lines.push('');
  lines.push('| 阶段 | 内容 |');
  lines.push('|------|------|');
  lines.push(`| 2025-05 ~ 2025-12 | 第 1–7 批公开（累计约 1.5 万条编码级知识点） |`);
  lines.push(`| 2026-01 | 第 8 批 + **1/28 八项药品规则按 2025 药目录修订** |`);
  lines.push(`| 2026-02 | **2025 年版全书出版**（88 类 / 24.7 万条全量快照） |`);
  lines.push(`| 2026-04 ~ 2026-06 | 第 9–17 批继续公开（限二线、互联网医院、中药饮片、限适应症分专题） |`);
  lines.push('');
  lines.push('## 3. 库内按规则类别覆盖（药品/项目级）');
  lines.push('');
  lines.push('| 类别 | 条数 | 对应官网批次 |');
  lines.push('|------|------|--------------|');
  for (const [cat, n] of Object.entries(stats.byCat).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${cat} | ${n} | ${mapCategoryToBatch(cat)} |`);
  }
  lines.push('');
  lines.push('## 4. 2026 增量（相对 2025 全书快照）');
  lines.push('');
  lines.push('以下批次在 **2025 全书定稿后** 或 **同期** 于官网继续发布，需靠 `sync-liangku-col109.mjs` 补齐：');
  lines.push('');
  for (const b of OFFICIAL_BATCHES.slice(8)) {
    const inKb = stats.byBatch[b.batch] || 0;
    const catCount = b.batch === '第九批' ? stats.byCat['药品限二线使用'] : inKb;
    lines.push(`- **${b.batch}**（${b.date}）${b.topic} — 库内相关 **${catCount || inKb}** 条${b.official ? `；官方口径 ${b.official} 条（编码级）` : ''}${b.note ? `；${b.note}` : ''}`);
  }
  lines.push('');
  lines.push('## 5. 仍存在的差距');
  lines.push('');
  if (bookIncomplete) {
    lines.push('- ⚠️ **2025 全书 PDF 未完整落地**（`.crdownload` 或缺失）。全书 24.7 万编码级条目无法从 PDF 抽取入库；建议重新下载后 OCR/分表解析，或继续依赖官网分批 xlsx。');
  }
  lines.push('- **编码级 vs 药品级**：库内一条药品可对应多个医保编码（`metadata.drug_codes[]`），故条数远低于官方 24.7 万属正常。');
  lines.push('- **限适应症**：第 12–17 批按治疗领域**分批部分公开**，库内已合并为「药品限适应症」类；全量需等后续批次或全书电子版。');
  lines.push('- **爬虫补齐命令**：');
  lines.push('  ```bash');
  lines.push('  node scripts/sync-liangku-col109.mjs --force          # 第9–17批最新');
  lines.push('  node scripts/sync-liangku-col109.mjs --history --force  # 第1–8批+2026/1/28修订');
  lines.push('  node scripts/import-mail-liangku-all.mjs --force        # 邮箱附件全量');
  lines.push('  ```');
  lines.push('');
  lines.push('## 6. 邮箱附件目录');
  lines.push('');
  lines.push(`\`${mailDir}\` 共 **${mailFiles.length}** 个文件。`);

  const md = lines.join('\n');
  fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
  fs.writeFileSync(OUT_MD, md + '\n');

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ stats, bookIncomplete, official: OFFICIAL_BATCHES }, null, 2));
  } else {
    console.log(md);
    console.log(`\n已写入 ${OUT_MD}`);
  }
}

main();
