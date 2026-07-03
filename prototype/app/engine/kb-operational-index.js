'use strict';

/**
 * L3 操作索引加载器（kb_operational_index.json）
 * 供 precheck-native / audit-engine / foundation 共用。
 */
const fs = require('fs');
const path = require('path');

const INDEX_PATH = path.join(__dirname, '../../data/kb/kb_operational_index.json');

let _cache = null;
let _constraintKeys = null;
let _pairIndex = null;

function normName(s) {
  return String(s || '').replace(/\s+/g, '').trim();
}

function loadIndex() {
  if (_cache !== null) return _cache;
  try {
    _cache = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
    _constraintKeys = Object.keys(_cache.constraints || {}).filter(k => k.length >= 3);
    buildPairIndex(_cache);
  } catch {
    _cache = false;
    _constraintKeys = [];
    _pairIndex = null;
  }
  return _cache;
}

function buildPairIndex(idx) {
  _pairIndex = new Map();
  for (const pair of idx.exclusive_pairs || []) {
    for (const side of ['a', 'b']) {
      const key = normName(pair[side]);
      if (!key) continue;
      if (!_pairIndex.has(key)) _pairIndex.set(key, []);
      _pairIndex.get(key).push(pair);
    }
  }
}

/** 医嘱/费用名 → 约束项（precheck 用） */
function lookupConstraints(name) {
  const idx = loadIndex();
  if (!idx) return [];
  const n = normName(name);
  const out = [];
  if (idx.constraints[n]) out.push(...idx.constraints[n].map(r => ({ ...r, matched: n })));
  else {
    for (const k of _constraintKeys) {
      if (k.length >= 4 && n.includes(k)) {
        out.push(...idx.constraints[k].map(r => ({ ...r, matched: k })));
        break;
      }
    }
  }
  return out;
}

/** 费用行名是否匹配两库互斥项名称 */
function feeLineMatches(itemName, pattern) {
  const n = normName(itemName);
  const p = normName(pattern);
  if (!n || !p) return false;
  if (n === p) return true;
  // 源数据截断「重症监护」→ 只匹配监护费本身，不含「重症监护病房床位费」
  if (p === '重症监护') return /重症监护费/.test(n) && !/床位/.test(n);
  if (p.length >= 4 && n.includes(p)) return true;
  // 源数据偶见截断「级护理」→ 仅匹配 *级护理 完整 tier 名
  if (/^级护理$/.test(p)) return /[一二三特]级护理/.test(n);
  if (p.length >= 3 && n.includes(p) && /费$|护理$|床位费$/.test(p)) return true;
  return false;
}

function parseFeeRange(feeDate, parseDateFn) {
  const raw = String(feeDate || '').trim();
  if (!raw) return { start: null, end: null };
  const parts = raw.split('~').map(s => s.trim());
  const start = parseDateFn(parts[0]);
  const end = parseDateFn(parts[parts.length - 1] || parts[0]);
  if (!start || !end) return { start: null, end: null };
  return { start, end: end >= start ? end : start };
}

function rangesOverlap(a, b) {
  if (!a.start || !b.start) return true;
  return a.start <= b.end && b.start <= a.end;
}

/** 单日/同次窗口：两费用行日期区间是否重叠 */
function sameChargeWindow(lineA, lineB, window, parseDateFn) {
  if (!window || window === '单日' || /同次|同时|同一/.test(window)) {
    return rangesOverlap(parseFeeRange(lineA.fee_date, parseDateFn), parseFeeRange(lineB.fee_date, parseDateFn));
  }
  return rangesOverlap(parseFeeRange(lineA.fee_date, parseDateFn), parseFeeRange(lineB.fee_date, parseDateFn));
}

/**
 * 扫描费用清单，返回互斥重复收费命中（A-102 数据驱动）
 * @returns {Array<{pair, lineA, lineB, ref}>}
 */
function findMutualExclusiveHits(items, parseDateFn) {
  const idx = loadIndex();
  if (!idx || !idx.exclusive_pairs?.length || !items?.length) return [];

  const hits = [];
  const seen = new Set();

  // 先按行收集匹配到的 pair 侧
  const lineMatches = items.map(line => {
    const pairs = new Set();
    for (const pair of idx.exclusive_pairs) {
      if (feeLineMatches(line.item_name, pair.a) || feeLineMatches(line.item_name, pair.b)) {
        pairs.add(pair);
      }
    }
    return { line, pairs: [...pairs] };
  }).filter(x => x.pairs.length);

  for (let i = 0; i < lineMatches.length; i++) {
    for (let j = i + 1; j < lineMatches.length; j++) {
      const { line: la, pairs: pa } = lineMatches[i];
      const { line: lb, pairs: pb } = lineMatches[j];
      if (la.line_no === lb.line_no) continue;

      for (const pair of pa) {
        if (!pb.includes(pair)) continue;
        const laIsA = feeLineMatches(la.item_name, pair.a);
        const lbIsB = feeLineMatches(lb.item_name, pair.b);
        const laIsB = feeLineMatches(la.item_name, pair.b);
        const lbIsA = feeLineMatches(lb.item_name, pair.a);
        if (!((laIsA && lbIsB) || (laIsB && lbIsA))) continue;
        if (!sameChargeWindow(la, lb, pair.window, parseDateFn)) continue;

        const key = `${pair.a}|${pair.b}|${la.line_no}|${lb.line_no}`;
        if (seen.has(key)) continue;
        seen.add(key);
        hits.push({ pair, lineA: la, lineB: lb, ref: (pair.refs || [])[0] || '' });
      }
    }
  }
  return hits;
}

function familyCoverage(checkerIds = []) {
  const idx = loadIndex();
  if (!idx) return null;
  const checkerSet = new Set(checkerIds);
  const wired = {
    mutual_exclusive: { rule_id: 'A-102', surface: 'audit-engine', note: `${(idx.exclusive_pairs || []).length} 对互斥索引` },
    gender_limited: { rule_id: 'precheck', surface: 'precheck-native', note: '开单事前硬互斥' },
    child_limited: { rule_id: 'precheck', surface: 'precheck-native', note: '开单事前软提醒' },
    tcm_no_pay: { rule_id: 'precheck', surface: 'precheck-native', note: '饮片不予支付精确匹配' },
    indication_limited: { rule_id: 'B-201-IND', surface: 'indication-semantics', note: '同步线索 + super LLM 可升疑点' },
    surgery_discount: { rule_id: 'SUR-401', surface: 'audit-engine', note: '同台多手术折价索引' },
  };
  const families = Object.entries(idx.families || {}).map(([id, meta]) => {
    const w = wired[id];
    const operationalized = w
      ? (w.rule_id === 'precheck' ? true : checkerSet.has(w.rule_id))
      : false;
    return {
      family_id: id,
      name: meta.name,
      shape: meta.shape,
      items: meta.items,
      wired: !!w,
      operationalized,
      checker: w ? w.rule_id : null,
      surface: w ? w.surface : null,
      note: w ? w.note : '待 LLM/专项 checker',
    };
  }).sort((a, b) => b.items - a.items);

  const merged = idx.meta?.merged_items || 0;
  const opCount = families.filter(f => f.operationalized).reduce((s, f) => s + f.items, 0);

  return {
    index_version: idx.meta?.version,
    built_at: idx.meta?.built_at,
    raw_rows: idx.meta?.raw_rows,
    merged_items: merged,
    exclusive_pairs: (idx.exclusive_pairs || []).length,
    families,
    operationalized_items: opCount,
    operationalized_pct: merged ? Math.round((opCount / merged) * 100) : 0,
  };
}

module.exports = {
  loadIndex,
  lookupConstraints,
  feeLineMatches,
  findMutualExclusiveHits,
  familyCoverage,
  INDEX_PATH,
};
