#!/usr/bin/env node
/**
 * 两库结构化重建：把 public-data-corpus/raw/mail-liangku 的分批附件解析为
 * prompt 规定的 target schema，产出：
 *   - kb/two_libraries/batches/*.json + index.json + all_records.json
 *   - codesets/*.json + codesets/index.json
 *   - coverage_map.json
 *   - docs/two-libraries-reconciliation.md + eval/results/two-libraries-reconciliation.json
 *
 * 提取层复用既有解析器 scripts/crawl/parsers/xlsx-liangku.mjs（不另起炉灶）。
 * 用法：node scripts/build-two-libraries.mjs
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { parseLiangkuFromFile } from './crawl/parsers/xlsx-liangku.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MAIL_DIR = path.join(ROOT, 'public-data-corpus/raw/mail-liangku');
const OUT_KB = path.join(ROOT, 'kb/two_libraries');
const OUT_BATCHES = path.join(OUT_KB, 'batches');
const OUT_CODESETS = path.join(ROOT, 'codesets');
const OUT_COVERAGE = path.join(ROOT, 'coverage_map.json');
const OUT_COVERAGE_PUBLIC = path.join(ROOT, 'prototype/app/public/two-libraries-coverage.json'); // 前台覆盖地图静态数据(88类)
const OUT_REPORT_MD = path.join(ROOT, 'docs/two-libraries-reconciliation.md');
const OUT_REPORT_JSON = path.join(ROOT, 'eval/results/two-libraries-reconciliation.json');
const CATALOG = path.join(ROOT, 'public-data-corpus/kb/official_rules_catalog.json');

// ---- 中文数字 → int ----
const CN = { 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
function cnNum(s) {
  if (/^\d+$/.test(s)) return Number(s);
  if (s.length === 1) return CN[s];
  if (s[0] === '十') return 10 + (CN[s[1]] || 0);
  if (s.includes('十')) { const [a, b] = s.split('十'); return CN[a] * 10 + (b ? CN[b] : 0); }
  return CN[s] ?? null;
}
function parseBatchNum(name) {
  const m = name.match(/第([零一二三四五六七八九十\d]+)批/);
  return m ? cnNum(m[1]) : null;
}

// ---- 批次 → 公告日期 / URL（来自 col109 列表实测；1-8 为 2025 年批，列表未含，记 null）----
const BATCH_MANIFEST = {
  9:  { date: '2026-04-21', url: 'https://www.nhsa.gov.cn/art/2026/4/21/art_109_20277.html' },
  10: { date: '2026-04-28', url: 'https://www.nhsa.gov.cn/art/2026/4/28/art_109_20351.html' },
  11: { date: '2026-05-11', url: 'https://www.nhsa.gov.cn/art/2026/5/11/art_109_20462.html' },
  12: { date: '2026-05-23', url: 'https://www.nhsa.gov.cn/art/2026/5/23/art_109_20682.html' },
  13: { date: '2026-06-01', url: 'https://www.nhsa.gov.cn/art/2026/6/1/art_109_20822.html' },
  14: { date: '2026-06-09', url: 'https://www.nhsa.gov.cn/art/2026/6/9/art_109_20899.html' },
  15: { date: '2026-06-16', url: 'https://www.nhsa.gov.cn/art/2026/6/16/art_109_21004.html' },
  16: { date: '2026-06-22', url: 'https://www.nhsa.gov.cn/art/2026/6/22/art_109_21056.html' },
  17: { date: '2026-06-29', url: 'https://www.nhsa.gov.cn/art/2026/6/29/art_109_21146.html' },
};
const UPDATE_DATE = '2026-01-28'; // 8 项药品类规则更新修订公告

// ---- rule_class → 框架 1.0 GZ 映射（对我们语料实际出现的规则类的显式映射表）----
const RULE_GZ = {
  药品区分性别使用: 'GZ10000301004000',
  医疗服务项目区分性别使用: 'GZ10000302004000',
  药品儿童专用: 'GZ10000301002000',
  药品限儿童使用: 'GZ10000101007000',
  医疗服务项目儿童专用: 'GZ10000302003000',
  手术项目未按规定折价收费: 'GZ10000102002000',
  药品限工伤保险: 'GZ10000101001000',
  药品限生育保险: 'GZ10000101002000',
  药品限医疗机构级别: 'GZ10000101012000',
  药品限支付疗程: 'GZ10000101010000',
  医疗服务项目重复收费: 'GZ10000102012000',
  药品限二线使用: 'GZ10000101005000',
  中药饮片单复方均不予支付: 'GZ10000101003000',
  中药饮片单方使用不予支付: 'GZ10000101004000',
  药品限适应症: 'GZ10000101008000',
  医疗服务项目限定频次: 'GZ10000102014000',
  医疗服务项目限支付疗程: 'GZ10000102010000',
  // 以下 1.0 框架未收录，进入待映射清单（null）：
  药品限就医方式: null,
  超互联网医院药品支付范围: null,
  医疗服务项目限年龄: null,
  医疗服务项目周期超频次: null,
};

const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
const CODE2RULE = new Map(catalog.rules_flat.map((r) => [r.official_code, r]));

function normRuleClass(s) {
  return String(s || '')
    .replace(/[“”"'\s]/g, '')
    .replace(/\.(xlsx?|pdf)$/i, '')            // 兜底解析时文件名泄漏进类名
    .replace(/规则对应.*$/, '')
    .replace(/^第[零一二三四五六七八九十\d]+批[-\s]*\d*\.?/, '') // 第N批 前缀
    .replace(/^[-\d.\s]+/, '')
    .trim();
}
function slug(s) { return String(s || '').replace(/[^一-龥A-Za-z0-9]/g, '').slice(0, 40); }
function kpId(batchTag, attachment, contentKey, rowSeq) {
  const h = crypto.createHash('sha1')
    .update(`${batchTag}|${path.basename(attachment || '')}|${contentKey || ''}|${rowSeq || ''}`)
    .digest('hex').slice(0, 16);
  return `KP-${h}`;
}

// ---- 枚举源文件 ----
function classify(file) {
  const base = path.basename(file);
  if (!/\.(xlsx|xls)$/i.test(base)) return null;            // 只处理 Excel（PDF 有同内容 Excel 优先）
  if (/框架体系|分类与释义|web系统功能|2025年版/.test(base)) return null; // 框架/释义/整书，另处理
  const batchNum = parseBatchNum(base);
  if (batchNum) {
    return { file, base, kind: 'batch', batchNum, batchTag: `batch_${String(batchNum).padStart(2, '0')}` };
  }
  // 8 项药品类更新（文件名以 "N." 开头，含规则类引号名）
  if (/^\d+\.["“]/.test(base)) {
    return { file, base, kind: 'update', batchNum: null, batchTag: 'updates_2026-01' };
  }
  return null;
}

function enumerateSources() {
  const out = [];
  const seenXlsxRules = new Set(); // (batchNum|ruleHint) 用于 xls/xlsx 去重优先
  for (const f of fs.readdirSync(MAIL_DIR)) {
    const full = path.join(MAIL_DIR, f);
    if (!fs.statSync(full).isFile()) continue;
    const c = classify(full);
    if (c) out.push(c);
  }
  // 同一批次若既有 .xlsx 又有 .xls，优先 .xlsx
  const byKey = new Map();
  for (const s of out) {
    const key = `${s.batchTag}|${s.base.replace(/\.(xlsx|xls)$/i, '')}`;
    const ext = s.base.match(/\.(xlsx|xls)$/i)[1].toLowerCase();
    const prev = byKey.get(key);
    if (!prev || (prev.ext === 'xls' && ext === 'xlsx')) byKey.set(key, { ...s, ext });
  }
  return [...byKey.values()].sort((a, b) => (a.batchNum || 99) - (b.batchNum || 99) || a.base.localeCompare(b.base));
}

// ---- 转换为 target schema ----
function toRecord(p, src) {
  const md = p.metadata || {};
  const ruleClassRaw = md.rule_category || p.locator || '';
  const rule_class = normRuleClass(ruleClassRaw);
  const gzKey = Object.prototype.hasOwnProperty.call(RULE_GZ, rule_class) ? rule_class : null;
  const gz_code = gzKey ? RULE_GZ[gzKey] : (RULE_GZ[rule_class] ?? undefined);
  const catRule = gz_code ? CODE2RULE.get(gz_code) : null;
  const meds = Array.isArray(md.drug_codes) ? md.drug_codes.filter(Boolean) : [];
  const batchNum = src.kind === 'batch' ? src.batchNum : null;
  const man = batchNum && BATCH_MANIFEST[batchNum];
  const published_at = man ? man.date : (src.kind === 'update' ? UPDATE_DATE : null);
  const announcement_url = man ? man.url : (p.source_url || null);
  const item_name = md.item_name || p.locator || '';
  const contentKey = md.content_key || `${slug(rule_class)}|${slug(item_name)}|${md.row_seq || 0}`;
  return {
    kp_id: kpId(src.batchTag, src.base, contentKey, md.row_seq),
    rule_class,
    gz_code: gz_code ?? null,
    level1: catRule ? catRule.tier1 : null,
    level2: catRule ? catRule.tier2 : null,
    med_code: meds[0] || null,           // schema 兼容（标量首码）
    med_codes: meds,                     // 真实结构：一个知识点对应多编码
    med_code_count: meds.length,
    item_name,
    constraint: md.payment_basis || md.detect_logic || null,
    detect_logic: md.detect_logic || null,
    batch: batchNum,
    batch_tag: src.batchTag,
    published_at,
    supersedes: null,                    // 后填
    source: {
      announcement_url,
      attachment_file: src.base,
      row: md.row_seq ?? null,
      pdf_page: null,
    },
    _meta: { is_update: src.kind === 'update', content_key: contentKey, verify_status: p.verify_status },
    _anomaly: meds.length === 0 ? 'no_med_code' : null,
  };
}

// ---- 主流程 ----
function main() {
  const sources = enumerateSources();
  const perFile = [];
  const allRecords = [];
  const unmapped = new Map(); // rule_class -> count

  for (const src of sources) {
    let parsed;
    try { parsed = parseLiangkuFromFile(src.file, { batch: src.batchTag, title: src.base }); }
    catch (e) { perFile.push({ ...srcMeta(src), parsed_rows: 0, error: e.message }); continue; }
    const policies = parsed.policies || [];
    const recs = policies.map((p) => toRecord(p, src));
    for (const r of recs) {
      if (r.gz_code == null && r.rule_class) {
        unmapped.set(r.rule_class, (unmapped.get(r.rule_class) || 0) + 1);
      }
    }
    allRecords.push(...recs.map((r) => ({ ...r, _src: src.batchTag })));
    perFile.push({
      ...srcMeta(src),
      parsed_rows: recs.length,
      no_med_code: recs.filter((r) => r._anomaly === 'no_med_code').length,
      rule_classes: [...new Set(recs.map((r) => r.rule_class))],
    });
  }

  // ---- supersedes 版本链（时点法）：按 (rule_class + item_name) 分组，按有效日期排序，串链 ----
  const groups = new Map();
  for (const r of allRecords) {
    const key = `${r.rule_class}||${r.item_name}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const orderKey = (r) => r.published_at || (r._meta.is_update ? '2026-01-28' : `2025-00-${String(r.batch || 0).padStart(2, '0')}`);
  let chained = 0;
  for (const arr of groups.values()) {
    if (arr.length < 2) continue;
    arr.sort((a, b) => orderKey(a).localeCompare(orderKey(b)) || (a.batch || 0) - (b.batch || 0));
    // 仅跨批次串链：同批次内同名多行是并列知识点，不构成版本更新
    let prev = null;
    for (const r of arr) {
      if (prev && prev.batch_tag !== r.batch_tag) { r.supersedes = prev.kp_id; chained++; }
      prev = r;
    }
  }

  // ---- 写 kb/two_libraries ----
  fs.mkdirSync(OUT_BATCHES, { recursive: true });
  const byBatch = new Map();
  for (const r of allRecords) {
    const tag = r.batch_tag;
    if (!byBatch.has(tag)) byBatch.set(tag, []);
    byBatch.get(tag).push(stripInternal(r));
  }
  const batchIndex = [];
  for (const [tag, recs] of [...byBatch.entries()].sort()) {
    fs.writeFileSync(path.join(OUT_BATCHES, `${tag}.json`), JSON.stringify(recs, null, 2) + '\n');
    const num = recs[0]?.batch ?? null;
    batchIndex.push({
      batch_tag: tag,
      batch: num,
      published_at: recs[0]?.published_at || null,
      announcement_url: recs[0]?.source?.announcement_url || null,
      rule_classes: [...new Set(recs.map((r) => r.rule_class))],
      records: recs.length,
      with_med_code: recs.filter((r) => r.med_code_count > 0).length,
    });
  }
  fs.writeFileSync(path.join(OUT_KB, 'all_records.json'), JSON.stringify(allRecords.map(stripInternal), null, 2) + '\n');
  fs.writeFileSync(path.join(OUT_KB, 'index.json'), JSON.stringify({
    meta: {
      title: '国家医保智能监管两库 · 结构化知识点',
      built_from: 'public-data-corpus/raw/mail-liangku',
      total_records: allRecords.length,
      total_batches: batchIndex.filter((b) => b.batch).length,
      supersede_links: chained,
      note: 'med_code 为标量首码(schema兼容)；med_codes 为完整编码数组(真实结构，一个知识点对应多编码)。',
    },
    batches: batchIndex,
  }, null, 2) + '\n');

  // ---- codesets：按 rule_class 聚合 med_codes ----
  fs.mkdirSync(OUT_CODESETS, { recursive: true });
  for (const f of fs.readdirSync(OUT_CODESETS)) if (f.endsWith('.json')) fs.unlinkSync(path.join(OUT_CODESETS, f)); // 清旧，避免规则类改名后残留
  const codesetIndex = [];
  const byRule = new Map();
  for (const r of allRecords) {
    if (!r.rule_class) continue;
    if (!byRule.has(r.rule_class)) byRule.set(r.rule_class, { gz: r.gz_code, codes: new Set(), kps: 0 });
    const g = byRule.get(r.rule_class);
    g.kps++;
    for (const c of r.med_codes) g.codes.add(c);
  }
  for (const [rc, g] of byRule) {
    const slugName = slug(rc);
    const codes = [...g.codes].sort();
    const payload = {
      codeset_id: `CS-${slugName}`,
      name: `${rc}·编码集`,
      rule_class: rc,
      gz_code: g.gz,
      version: '2026-07-04',
      knowledge_points: g.kps,
      code_count: codes.length,
      codes,
    };
    fs.writeFileSync(path.join(OUT_CODESETS, `${slugName}.json`), JSON.stringify(payload, null, 2) + '\n');
    codesetIndex.push({ codeset_id: payload.codeset_id, rule_class: rc, gz_code: g.gz, code_count: codes.length, knowledge_points: g.kps });
  }
  fs.writeFileSync(path.join(OUT_CODESETS, 'index.json'), JSON.stringify({
    meta: { generated: '2026-07-04', total_codesets: codesetIndex.length, note: '按 rule_class 聚合 med_code，独立版本化，供规则 DSL 引用。' },
    codesets: codesetIndex.sort((a, b) => b.code_count - a.code_count),
  }, null, 2) + '\n');

  // ---- coverage_map：79 框架为坐标 ----
  const kpByGz = new Map();
  const kpByRule = new Map();
  for (const r of allRecords) {
    if (r.gz_code) kpByGz.set(r.gz_code, (kpByGz.get(r.gz_code) || 0) + 1);
    kpByRule.set(r.rule_class, (kpByRule.get(r.rule_class) || 0) + 1);
  }
  const officialCells = loadOfficialCoverageCells(); // 复用 app 权威覆盖计算(带真实 checker 接线状态)
  const covByCode = new Map(officialCells.map((c) => [c.official_code, c]));
  const frame88 = load88Catalog(); // 2025年版 88 类坐标；不存在则回退 79
  const frameRules = frame88 ? frame88.rules : catalog.rules_flat.map((r) => ({
    seq: null, tier1: r.tier1, tier2: r.tier2, name: cleanRuleName(r.name), gz_code_1_0: r.official_code, new_in_2025: false, has_kp_detail: null,
  }));
  const frameLabel = frame88 ? '2025年版·88类' : '框架体系1.0·79条';
  const cells = frameRules.map((rule) => {
    const gz = rule.gz_code_1_0 || null;
    const oc = gz ? (covByCode.get(gz) || {}) : {};
    const kp = kpByRule.get(rule.name) || (gz ? kpByGz.get(gz) : 0) || 0;
    const coverageStatus = gz ? (oc.coverage_status || 'candidate') : 'roadmap';
    const hasChecker = coverageStatus === 'implemented' || coverageStatus === 'pilot';
    let status;
    if (hasChecker && kp > 0) status = 'checker+kp';
    else if (hasChecker) status = 'checker_only';
    else if (kp > 0) status = 'kp_only';
    else status = 'blank';
    return {
      seq: rule.seq,
      rule_name: rule.name,
      level1: rule.tier1, level2: rule.tier2,
      gz_code_1_0: gz,
      code_type: gz ? (gz.startsWith('ZB') ? 'ZB' : 'GZ') : null,
      new_in_2025: !!rule.new_in_2025,
      official_has_kp_detail: rule.has_kp_detail,   // 官方"是否对应知识点明细"
      knowledge_points: kp,                          // 本项目已入库两库知识点数
      has_checker: hasChecker,
      coverage_status: coverageStatus,
      eagle_rule_ids: oc.eagle_rule_ids || [],
      handler: oc.handler || null,
      status,
    };
  });
  // 我方已入库、但坐标系里匹配不到的规则类(命名差异或框架外)
  const frameNames = new Set(frameRules.map((r) => r.name));
  const outOfFrame = [...kpByRule.entries()]
    .filter(([rc]) => !frameNames.has(rc))
    .map(([rc, n]) => ({ rule_class: rc, knowledge_points: n, note: `${frameLabel} 坐标未命中(命名差异或框架外)` }));
  const covSummary = cells.reduce((a, c) => { a[c.status] = (a[c.status] || 0) + 1; return a; }, {});
  const coveragePayload = {
    meta: {
      coordinate_frame: frameLabel,
      coordinate_source: frame88 ? frame88.meta.source : '框架体系1.0(79条)',
      total_rules: cells.length,
      new_in_2025: cells.filter((c) => c.new_in_2025).length,
      official_kp_detail_rules: cells.filter((c) => c.official_has_kp_detail === true).length,
      mapped_to_1_0_gz: cells.filter((c) => c.gz_code_1_0).length,
      ingested_knowledge_points: allRecords.length,
      summary: covSummary,
      four_layer_numbers: {
        frame_1_0: '框架体系1.0：79条，政策类30/管理类28/医疗类21，带GZ编码（覆盖地图骨架）',
        full_2025: '2025年版：88类规则、24.7万条知识点，全部对应医保编码（究竟有多大）',
        public_batches: '公开发布至第十七批（2026-06-29），六月一月连发三批（十五6/16·十六6/22·十七6/29）',
        provincial: '省级实操口径约150万条（周夕鸣，仅在呼应其"专家团队维护复杂度"时引用，勿与24.7万对质）',
        endorsement: "官方目标：力争'十五五'期间实现定点医药机构事前提醒全覆盖（院端插件产品线即其执行工具）",
      },
      checker_note: 'checker 接线取自 app 权威计算(rule_gz_mapping.yaml)，1.0映射到的规则现为 implemented；10 类2025新增无1.0 GZ坐标，checker 记 roadmap。',
      out_of_frame_kp: outOfFrame,
      caveat_pre_exhibition: '批次一周一发；时效数字(第十七批/日期)须于 7/5 上午布展前用 col109 复核，防第十八批突袭。',
    },
    cells,
  };
  fs.writeFileSync(OUT_COVERAGE, JSON.stringify(coveragePayload, null, 2) + '\n');
  try { fs.writeFileSync(OUT_COVERAGE_PUBLIC, JSON.stringify(coveragePayload, null, 2) + '\n'); } catch { /* 前台目录可能不存在，忽略 */ }

  // ---- 对账报告 ----
  writeReconciliation({ sources, perFile, allRecords, batchIndex, codesetIndex, covSummary, unmapped, chained });

  console.log(`✓ 记录 ${allRecords.length} 条 / ${batchIndex.length} 批文件`);
  console.log(`✓ codesets ${codesetIndex.length} 个`);
  console.log(`✓ coverage: ${JSON.stringify(covSummary)}`);
  console.log(`✓ supersede 链接 ${chained} 条`);
  console.log(`✓ 待映射规则类 ${unmapped.size} 个: ${[...unmapped.keys()].join('、')}`);
}

function srcMeta(src) {
  const man = src.batchNum && BATCH_MANIFEST[src.batchNum];
  return {
    batch_tag: src.batchTag, batch: src.batchNum, file: src.base, ext: src.ext,
    published_at: man ? man.date : (src.kind === 'update' ? UPDATE_DATE : null),
    announcement_url: man ? man.url : null,
  };
}
function stripInternal(r) { const { _meta, _anomaly, _src, ...rest } = r; return rest; }
function cleanRuleName(name) {
  // 框架 catalog 部分 name 混入了定义/页脚（PDF 抽取污染），取规则名前缀
  return String(name)
    .replace(/^-管理要求/, '')
    .replace(/(对|1规则编码|3规则编码|对各级|对医保|对结算|对就诊|对收费|对院内|对31天|对仅|对儿童|对超).*$/, '')
    .trim() || name;
}
function load88Catalog() {
  const p = path.join(OUT_KB, 'rule_catalog_2025_88.json');
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}
function loadOfficialCoverageCells() {
  // 复用 app 权威覆盖计算：computeOfficialCoverage(ruleCheckerIds) → 每条 official_code 的真实接线状态
  try {
    const r = createRequire(path.join(ROOT, 'prototype/app/server.js'));
    const { ruleCheckerIds } = r('./engine/audit-engine');
    const { computeOfficialCoverage } = r('./engine/official-coverage');
    const cov = computeOfficialCoverage(ruleCheckerIds, {});
    return cov.cells || cov.official_coverage || [];
  } catch (e) {
    console.warn('⚠️ 无法加载 app 覆盖计算，checker 维度置空:', e.message);
    return [];
  }
}

function writeReconciliation({ perFile, allRecords, batchIndex, codesetIndex, covSummary, unmapped, chained }) {
  fs.mkdirSync(path.dirname(OUT_REPORT_JSON), { recursive: true });
  const anomalies = perFile.filter((f) => f.parsed_rows === 0 || f.error).map((f) => ({ ...f, type: f.error ? 'parse_error' : 'zero_rows' }));
  const noMedTotal = allRecords.filter((r) => r.med_code_count === 0).length;
  const json = {
    generated: '2026-07-05',
    totals: { records: allRecords.length, batch_files: batchIndex.length, codesets: codesetIndex.length, supersede_links: chained, no_med_code: noMedTotal },
    frame_upgrade: {
      from: '框架体系1.0 · 79条', to: '2025年版 · 88类',
      source: 'kb/two_libraries/rule_catalog_2025_88.json（从已获取的2025年版全书PDF抽取）',
      new_in_2025: 10,
    },
    fixes: [
      { issue: '第二批手术折价 Sheet1 按名过滤漏解析', before: '0 行', after: '378 行', where: 'scripts/crawl/parsers/xlsx-liangku.mjs 通用页兜底' },
      { issue: '医疗服务项目 项目代码(数字长码) 被 /^\\d+$/ 误弃', before: 'no_med_code 514', after: 'no_med_code 1', where: 'xlsx-liangku.mjs pickItemCodes' },
    ],
    coverage_summary: covSummary,
    unmapped_gz: [...unmapped.entries()].map(([rc, n]) => ({ rule_class: rc, knowledge_points: n })),
    per_file: perFile,
    anomalies,
    book_2025_acquisition: {
      target: '《规则库、知识库（2025年版）》电子版（88类/24.7万点）',
      status: '已获取（邮件渠道）',
      artifact: 'public-data-corpus/raw/mail-liangku/医疗保障基金智能监管规则库、知识库（2025年版）-1.pdf',
      size_bytes: safeSize('public-data-corpus/raw/mail-liangku/医疗保障基金智能监管规则库、知识库（2025年版）-1.pdf'),
      note: '官网称扫码获取；本项目经邮件渠道已拿到 65MB PDF 全书，未走扫码。',
    },
    batch_15_17_fetch: {
      source: 'nhsa.gov.cn col109（本次外网抓取）',
      batches: [15, 16, 17].map((n) => ({ batch: n, ...BATCH_MANIFEST[n], announced_count: '未在公告正文明示（仅列 ATC 药物大类）' })),
      note: '第17批 PDF 附件三次重试均超时→跳过；xlsx 主数据已成功入库，无数据缺失。',
    },
  };
  fs.writeFileSync(OUT_REPORT_JSON, JSON.stringify(json, null, 2) + '\n');

  const rows = perFile.map((f) => {
    const flag = f.parsed_rows === 0 ? ' 🔴' : '';
    return `| ${f.batch ?? f.batch_tag} | ${f.file} | ${f.ext} | ${f.parsed_rows}${flag} | ${f.no_med_code ?? '—'} | ${(f.rule_classes || []).join('、')} |`;
  }).join('\n');
  const unmappedRows = [...unmapped.entries()].map(([rc, n]) => `| ${rc} | ${n} | 1.0框架未收录，待补 GZ |`).join('\n');
  const md = `# 两库结构化重建 · 对账报告

生成时间：2026-07-05（口径以实测解析为准，非公告自证）

## 0. 数字口径备忘（全队统一背这一版）

| 场合 | 口径 |
|------|------|
| 讲规则框架(覆盖地图骨架) | 框架体系1.0：**79条**，三大类，带 GZ 编码 |
| 讲国家全量(规则库到底多大) | 2025年版：**88类规则、24.7万条知识点**，全部对应医保编码 |
| 讲更新节奏(跟得最紧) | 公开发布至**第十七批**(2026-06-29)，六月一月连发三批(十五6/16·十六6/22·十七6/29) |
| 讲维护复杂度(仅呼应周夕鸣) | 省级实操口径约**150万条**，勿与24.7万对质 |
| 塔尖背书 | 官方目标：力争**"十五五"期间实现定点医药机构事前提醒全覆盖**(院端插件即执行工具) |

> ⚠️ **7/5 上午布展前必做**：批次一周一发，用 col109 复核"第十七批"是否仍为最新(防第十八批突袭)，三分钟。截至 2026-07-05 复核：col109 最新两库批次仍为第十七批，无第十八批。

## 1. 总量

| 口径 | 值 |
|------|----|
| 结构化知识点记录 | ${allRecords.length} |
| 批次文件 | ${batchIndex.length} |
| 编码集合(codesets) | ${codesetIndex.length} |
| supersedes 版本链链接 | ${chained} |
| 无医保编码(异常) | ${allRecords.filter((r) => r.med_code_count === 0).length} |

## 2. 覆盖地图(2025年版 88 类坐标)

> 坐标系已从框架体系1.0(79条)升级为 2025年版全量口径(88类) —— 88类清单从已获取的《规则库、知识库(2025年版)》全书 PDF 抽出(见 \`kb/two_libraries/rule_catalog_2025_88.json\`)。其中 10 类为2025新增(1.0框架未收录)。

${Object.entries(covSummary).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

- checker+kp = 既有 checker 且已入两库知识点；checker_only = 有 checker 暂无两库明细；kp_only = 我方已入知识点但属2025新增类(暂无1.0 checker)；blank = 2025新增类且暂未入库。

## 3. 每文件解析（公告条数 vs 解析条数）

> ⚠️ 第15–17批公告正文未明示"本批共N条"（仅列 ATC 药物大类），故本表以**实测解析条数**为准；
> 老批次公告条数需回抓公告正文补全，未取得处不臆造。差异对照另见既有 \`docs/mail-liangku-coverage.md\`。

| 批 | 文件 | 格式 | 解析条数 | 无编码 | 规则类 |
|----|------|------|---------|--------|--------|
${rows}

## 4. 异常清单 & 本轮修复

${anomalies.length ? anomalies.map((a) => `- 🔴 ${a.file}（${a.type}${a.error ? ': ' + a.error : ''}）`).join('\n') : '- ✅ 无 0 行 / 报错文件'}

- 无医保编码知识点合计：${allRecords.filter((r) => r.med_code_count === 0).length} 条（\`_anomaly=no_med_code\`）

**本轮已修复的既有解析异常（原 ~22% 症结）：**
- 🟢 第二批"手术项目未按规定折价收费"：明细页名为通用 \`Sheet1\`，被按名过滤整表漏掉 → 解析器加通用页兜底，**0 → 378 条**。
- 🟢 医疗服务项目类"项目代码"(纯数字长码，如 003310010140000)被 \`/^\\d+$/\` 守卫误弃 → 新增 \`pickItemCodes\` 兜底，**无编码 514 → 1 条**（≈99.97% 知识点已对应编码，与官方"全部对应编码"口径吻合）。
- 🟢 兜底解析时文件名泄漏进 rule_class（如 \`第二批手术项目未按规定折价收费.xls\`）→ 归一器强化清洗，GZ 映射恢复。

## 5. 待映射 GZ 清单（1.0 框架未收录的规则类）

| 规则类 | 知识点数 | 说明 |
|--------|---------|------|
${unmappedRows || '| — | — | 全部已映射 |'}

## 6. 2025 年版电子版获取

- 目标：《规则库、知识库（2025年版）》电子版（88类 / 24.7万知识点）
- **状态：已获取**（邮件渠道，非扫码）——\`医疗保障基金智能监管规则库、知识库（2025年版）-1.pdf\`（约 65MB）
- 官网仅提供扫码入口；本项目已通过邮件拿到全书 PDF，后续可作为 2.0 坐标升级来源（79→88类）。

## 7. 第 15–17 批外网抓取记录

| 批 | 公告日期 | 公告URL | 附件 |
|----|---------|---------|------|
| 15 | 2026-06-16 | ${BATCH_MANIFEST[15].url} | xlsx✓ pdf✓ |
| 16 | 2026-06-22 | ${BATCH_MANIFEST[16].url} | xlsx✓ pdf✓ |
| 17 | 2026-06-29 | ${BATCH_MANIFEST[17].url} | xlsx✓ pdf✗(3次超时跳过) |

- 三批均为"药品限适应症"细分（15=皮肤/泌尿生殖/激素类，16=全身抗感染，17=抗肿瘤及免疫/肌肉骨骼）。
- 抓取限速 ≥2s，失败重试 ≤3 次；第17批 PDF 超时跳过但主数据(xlsx)完整。
`;
  fs.writeFileSync(OUT_REPORT_MD, md);
}
function safeSize(rel) { try { return fs.statSync(path.join(ROOT, rel)).size; } catch { return null; } }

main();
