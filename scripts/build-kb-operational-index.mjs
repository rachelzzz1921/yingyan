#!/usr/bin/env node
/**
 * L1 → L2/L3 知识提炼：把两库原料（kb1_policies.json 里 3893 条知识点）
 * 二次整合为鹰眼自己的「模式族 + 操作索引」（docs/鹰眼-知识架构.md）。
 *
 * 做四件事：类名规范化 → 跨来源去重合并 → 限定条件结构化 → 名称倒排索引。
 * 产物：prototype/data/kb/kb_operational_index.json（派生文件，可随时重建）。
 *
 * 用法：node scripts/build-kb-operational-index.mjs [--dry-run]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KB_PATH = path.join(ROOT, 'prototype/data/kb/kb1_policies.json');
const OUT_PATH = path.join(ROOT, 'prototype/data/kb/kb_operational_index.json');
const CORPUS_OUT = path.join(ROOT, 'public-data-corpus/kb/kb_operational_index.json');

/** 类名规范化：去引号、去批次前缀/后缀 */
function canonCategory(raw) {
  return String(raw || '')
    .replace(/[“”"「」]/g, '')
    .replace(/^第[一二三四五六七八九十\d]+批\s*/, '')
    .replace(/规则对应(部分)?知识点明细$/, '')
    .trim();
}

/** 官方规范类 → 鹰眼模式族 */
const FAMILY_OF = [
  [/区分性别使用|与性别不符|手术操作编码与性别不符/, 'gender_limited'],
  [/儿童专用|限儿童使用|儿童禁用|限新生儿/, 'child_limited'],
  [/限适应症|限疾病使用/, 'indication_limited'],
  [/限二线使用/, 'second_line'],
  [/重复收费/, 'mutual_exclusive'],
  [/限医疗机构级别/, 'facility_level'],
  [/限工伤保险|限生育保险/, 'insurance_type'],
  [/中药饮片.*不予支付/, 'tcm_no_pay'],
  [/限支付疗程|限定频次|周期超频次|限年龄|超互联网医院|限就医方式/, 'usage_limit'],
  [/手术项目未按规定折价/, 'surgery_discount'],
  [/重复开药/, 'duplicate_rx'],
  [/诊断编码与手术操作编码不符|诊断与患者性别不符|诊断与患者年龄不符/, 'coding_mismatch'],
  [/中药饮片超量|中药饮片配伍禁忌|中药饮片超大处方/, 'tcm_usage_rule'],
  [/医用耗材/, 'consumable_limited'],
  [/无指征检验|无指征治疗|围手术期抗菌/, 'clinical_indication'],
  [/超说明书|老年人用药|妊娠期|药品相互作用|药品禁忌症/, 'safety_rule'],
];
const FAMILY_META = {
  gender_limited: { name: '性别限定', shape: '项目/药品 × 患者性别 ≠ 限定性别' },
  child_limited: { name: '儿童限定', shape: '药品/项目 × 患者年龄超出儿童限制' },
  indication_limited: { name: '适应症限定', shape: '药品 × 诊断不符合限定支付适应症' },
  second_line: { name: '二线用药', shape: '用药 × 无一线无效/不耐受证据' },
  mutual_exclusive: { name: '互斥重复收费', shape: '项目A × 项目B 同时段收费' },
  facility_level: { name: '机构级别限定', shape: '药品 × 机构级别低于限定级别' },
  insurance_type: { name: '险种限定', shape: '药品 × 险种不符（工伤/生育）' },
  tcm_no_pay: { name: '饮片不予支付', shape: '中药饮片 ∈ 不予支付清单' },
  usage_limit: { name: '用量/频次/渠道限定', shape: '疗程/频次/周期/互联网支付范围' },
  surgery_discount: { name: '手术折价收费', shape: '同台多手术未按规定折价' },
  duplicate_rx: { name: '重复开药', shape: '同组药品分类重复开具' },
  coding_mismatch: { name: '编码/人口学不符', shape: '诊断×手术/性别/年龄编码不一致' },
  tcm_usage_rule: { name: '饮片用法规则', shape: '超量/配伍禁忌/超大处方' },
  consumable_limited: { name: '耗材限疾病', shape: '耗材 × 诊断不符合适应症' },
  clinical_indication: { name: '无指征服务', shape: '检验/治疗/抗菌药缺乏指征' },
  safety_rule: { name: '用药安全', shape: '超说明书/老年/妊娠/相互作用/禁忌' },
};

function familyOf(cat) {
  for (const [re, fam] of FAMILY_OF) if (re.test(cat)) return fam;
  return 'other';
}

/** 名称规范化（索引键）：去空白/括号内容保留主体 */
function normName(s) {
  return String(s || '').replace(/\s+/g, '').trim();
}

/**
 * 互斥对侧名截断治理（与 prototype/app/engine/kb-operational-index.js 对齐）
 * fee_only: 「重症监护」→ 仅匹配 *重症监护费，不含床位费
 * tier_nursing: 「级护理」→ 仅匹配 *级护理
 */
function exclusiveSideMatchHint(side) {
  const s = normName(side);
  if (s === '重症监护') return 'fee_only';
  if (/^级护理$/.test(s)) return 'tier_nursing';
  return null;
}

function canonExclusiveSide(side) {
  const s = normName(side);
  if (s === '重症监护') return '重症监护费';
  return s;
}

/** 从 detect_logic / payment_basis 结构化出可执行条件 */
function structure(fam, cat, e) {
  const logic = String(e.metadata?.detect_logic || '');
  const basis = String(e.metadata?.payment_basis || '');
  const c = {};
  if (fam === 'gender_limited') {
    // 全书 PDF 表格展开后为「{限定性别}与限定性别不符」——「男/女」列即药品限定性别本身
    const m = logic.match(/([男女])与限定性别不符/);
    if (m) c.limit_sex = m[1];
    else {
      // 从功能主治/名称猜限定性别（暖宫/月经→女；前列腺→男）；猜测结果标注来源
      const nm = normName(e.metadata?.item_name);
      if (/前列腺|睾丸|阳痿|遗精|精液|阴茎/.test(basis + nm)) { c.limit_sex = '男'; c.sex_inferred = true; }
      else if (/子宫|月经|暖宫|带下|妊娠|产后|乳腺增生|卵巢|宫颈|阴道|痛经|坐胎|催乳|通乳/.test(basis + nm)) { c.limit_sex = '女'; c.sex_inferred = true; }
    }
  }
  if (fam === 'child_limited') {
    const m = basis.match(/限(\d+)[-–~至](\d+)岁/);
    if (m) { c.age_min = +m[1]; c.age_max = +m[2]; }
    else c.age_max = 14; // 官方检出逻辑「参保人年龄超出儿童年龄限制」默认 14 岁上限
    if (/禁用/.test(cat)) c.mode = 'forbidden';
  }
  if (fam === 'facility_level') {
    const m = basis.match(/限([一二三])级及以上/);
    if (m) c.level_min = { 一: 1, 二: 2, 三: 3 }[m[1]];
  }
  if (fam === 'insurance_type') c.insurance = /工伤/.test(cat) ? '工伤' : '生育';
  if (fam === 'tcm_no_pay') c.tcm_mode = /单复方/.test(cat) ? 'both' : 'single';
  if (fam === 'mutual_exclusive') {
    const parts = String(e.metadata?.item_name || '').split(/[×xX*]/).map(s => s.trim()).filter(Boolean);
    if (parts.length === 2) { c.pair = { a: parts[0], b: parts[1] }; }
    const w = String(e.text || '').match(/时间区间[:：]\s*([^\s·]+)/);
    if (w) c.window = w[1];
  }
  return c;
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const kb = JSON.parse(fs.readFileSync(KB_PATH, 'utf8'));
  const rows = (kb.entries || []).filter(e => e.doc_id === 'KB1-两库2025' && e.metadata?.item_name);

  // —— 去重合并：key = family|canonCategory 主体|normName ——
  const merged = new Map();
  let dupMerged = 0;
  for (const e of rows) {
    const cat = canonCategory(e.metadata.rule_category);
    const fam = familyOf(cat);
    const name = normName(e.metadata.item_name);
    if (!name || name.length < 2) continue;
    const key = `${fam}|${name}`;
    const cond = structure(fam, cat, e);
    const codes = e.metadata.drug_codes || [];
    const basis = String(e.metadata.payment_basis || '');
    const prev = merged.get(key);
    if (prev) {
      dupMerged++;
      prev.codes = [...new Set([...prev.codes, ...codes])];
      if (basis.length > prev.basis.length) prev.basis = basis;
      prev.refs.push(e.ref_id);
      prev.categories.add(cat);
      // 合并条件：默认已有字段优先，但「精确解析」优先于「推断」
      const exactSex = cond.limit_sex && !cond.sex_inferred;
      Object.assign(prev.cond, { ...cond, ...prev.cond });
      if (exactSex) { prev.cond.limit_sex = cond.limit_sex; delete prev.cond.sex_inferred; }
    } else {
      merged.set(key, {
        family: fam, name, cond,
        basis, codes: [...codes],
        detect_logic: String(e.metadata.detect_logic || ''),
        refs: [e.ref_id], categories: new Set([cat]),
        verify: e.verify_status || '',
      });
    }
  }

  // —— 汇编产物 ——
  const constraints = {};       // name → [{family, cond, basis, codes, refs}]
  const pairs = [];             // mutual_exclusive 对
  const tcmNoPay = { single: [], both: [] };
  const famStats = {};
  for (const it of merged.values()) {
    famStats[it.family] = (famStats[it.family] || 0) + 1;
    const rec = {
      family: it.family,
      categories: [...it.categories],
      cond: it.cond,
      basis: it.basis.slice(0, 500),
      codes: it.codes.slice(0, 200),
      refs: it.refs.slice(0, 12),
    };
    if (it.family === 'mutual_exclusive') {
      if (it.cond.pair) {
        const a = canonExclusiveSide(it.cond.pair.a);
        const b = canonExclusiveSide(it.cond.pair.b);
        const a_match = exclusiveSideMatchHint(it.cond.pair.a);
        const b_match = exclusiveSideMatchHint(it.cond.pair.b);
        const row = { a, b, window: it.cond.window || '单日', refs: rec.refs };
        if (a_match) row.a_match = a_match;
        if (b_match) row.b_match = b_match;
        pairs.push(row);
      }
      continue; // 成对项不进名称索引
    }
    if (it.family === 'tcm_no_pay') {
      tcmNoPay[it.cond.tcm_mode === 'both' ? 'both' : 'single'].push(it.name);
    }
    (constraints[it.name] = constraints[it.name] || []).push(rec);
  }

  const out = {
    meta: {
      version: 'v1.0',
      built_at: new Date().toISOString(),
      source: 'kb1_policies.json · doc_id=KB1-两库2025',
      doc: 'docs/鹰眼-知识架构.md',
      raw_rows: rows.length,
      merged_items: merged.size,
      dup_merged: dupMerged,
      family_stats: famStats,
    },
    families: Object.fromEntries(Object.entries(FAMILY_META).map(([id, m]) => [id, { ...m, items: famStats[id] || 0 }])),
    constraints,
    exclusive_pairs: pairs,
    tcm_no_pay: tcmNoPay,
  };

  console.log('\n鹰眼 · L1→L3 知识提炼');
  console.log(`  原料 ${rows.length} 条 → 合并后 ${merged.size} 项（跨来源合并 ${dupMerged} 组）`);
  for (const [fam, n] of Object.entries(famStats).sort((a, b) => b[1] - a[1])) {
    console.log(`  · ${FAMILY_META[fam]?.name || fam} (${fam}) → ${n}`);
  }
  console.log(`  互斥对 ${pairs.length} · 饮片不予支付 单方${tcmNoPay.single.length}/单复方${tcmNoPay.both.length}`);

  if (dryRun) { console.log('\n[dry-run] 未写入'); return; }
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 1) + '\n');
  try { fs.copyFileSync(OUT_PATH, CORPUS_OUT); } catch { /* corpus 目录可选 */ }
  console.log(`\n✅ 写入 ${path.relative(ROOT, OUT_PATH)}`);
}

main();
