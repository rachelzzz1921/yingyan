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

/** 互斥对侧名匹配策略（与 scripts/build-kb-operational-index.mjs 对齐） */
const EXCLUSIVE_SIDE_MATCH = {
  fee_only: (n) => /重症监护费/.test(n) && !/床位/.test(n),
  tier_nursing: (n) => /[一二三特]级护理/.test(n),
};

/** 费用行名是否匹配两库互斥项名称 */
function feeLineMatches(itemName, pattern, hint) {
  const n = normName(itemName);
  const p = normName(pattern);
  if (!n || !p) return false;
  if (n === p) return true;
  if (hint && EXCLUSIVE_SIDE_MATCH[hint]) return EXCLUSIVE_SIDE_MATCH[hint](n);
  // 无 hint 时兼容旧索引
  if (p === '重症监护' || p === '重症监护费') return /重症监护费/.test(n) && !/床位/.test(n);
  if (/^级护理$/.test(p)) return /[一二三特]级护理/.test(n);
  if (p.length >= 4 && n.includes(p)) {
    // 防短侧名在长费用名上误命中（如「术」类截断）；括注后缀或长规范名仍允许
    if (n.length <= p.length + 12) return true;
    if (p.length >= 6 && /(?:费|术|护理|检查|测定|监测|治疗|透析|接种|麻醉|监护|诊查|注射|透视|摄片)$/.test(p)) return true;
    return false;
  }
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
      if (feeLineMatches(line.item_name, pair.a, pair.a_match) || feeLineMatches(line.item_name, pair.b, pair.b_match)) {
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
        const laIsA = feeLineMatches(la.item_name, pair.a, pair.a_match);
        const lbIsB = feeLineMatches(lb.item_name, pair.b, pair.b_match);
        const laIsB = feeLineMatches(la.item_name, pair.b, pair.b_match);
        const lbIsA = feeLineMatches(lb.item_name, pair.a, pair.a_match);
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
  const HOOK_RULES = new Set(['B-201-IND']);
  const wired = {
    mutual_exclusive: { rule_id: 'A-102', surface: 'audit-engine', note: `${(idx.exclusive_pairs || []).length} 对互斥索引` },
    gender_limited: { rule_id: 'F-001', surface: 'audit-engine', note: '事后稽核 + 开单事前 precheck' },
    child_limited: { rule_id: 'F-002', surface: 'audit-engine', note: '事后稽核 + 开单事前 precheck' },
    usage_limit: { rule_id: 'F-006', surface: 'audit-engine', note: '限频/疗程/每住院次数' },
    second_line: { rule_id: 'B-209', surface: 'audit-engine', note: '二线用药前置证据检索' },
    facility_level: { rule_id: 'B-210', surface: 'audit-engine', note: '机构级别 vs 两库限定' },
    insurance_type: { rule_id: 'B-211', surface: 'audit-engine', note: '险种限定（工伤/生育）' },
    tcm_no_pay: { rule_id: 'precheck', surface: 'precheck-native', note: '饮片不予支付精确匹配' },
    indication_limited: { rule_id: 'B-201-IND', surface: 'indication-semantics', note: '同步线索 + super LLM 可升疑点' },
    surgery_discount: { rule_id: 'SUR-401', surface: 'audit-engine', note: '同台多手术折价索引' },
  };
  const families = Object.entries(idx.families || {}).map(([id, meta]) => {
    const w = wired[id];
    const operationalized = w
      ? (w.rule_id === 'precheck' ? true : checkerSet.has(w.rule_id) || HOOK_RULES.has(w.rule_id))
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
