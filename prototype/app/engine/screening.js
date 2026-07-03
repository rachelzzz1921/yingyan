'use strict';

/**
 * E1 监管侧批量链·行级筛查(全量结算单据智能审核全覆盖的第一漏斗)
 * 输入:结算明细行(不是完整案卷)。输出:漏斗统计+命中明细+top榜。
 * 全部确定性规则,1000 条毫秒级——对应官方剧本"数据比对/违规筛查"环节;
 * 命中行再进优先队列走单案深审(明细审核/调查核实)。
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../../data/screening/settlements_1000.json');

const QUINOLONE_RE = /左氧氟沙星|环丙沙星|莫西沙星|氧氟沙星|诺氟沙星|培氟沙星|洛美沙星|司帕沙星|加替沙星/;
const PEDIATRIC_RE = /^小儿|儿童型/;
const MALE_ONLY_RE = /前列腺|精液|睾酮(?!.*女)/;
const FEMALE_ONLY_RE = /宫颈|子宫|卵巢|阴道|TCT|HPV/;

function screeningParams(opts = {}) {
  const num = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    minor_age: num(opts.minor_age ?? opts.age_limit, 18),
    pediatric_age: num(opts.pediatric_age, 14),
    qty_limit: num(opts.qty_limit ?? opts.max_qty, 30),
  };
}

function screenRows(rowsIn, opts = {}) {
  const params = screeningParams(opts);
  const hasQtyOverride = opts.qty_limit != null || opts.max_qty != null;
  const rows = (rowsIn || []).filter(r => r && typeof r === 'object'); // 防 null/非对象行让整次筛查 500
  const hits = [];
  const hit = (row, rule, nature, reason) => hits.push({
    row_id: row.row_id, rule_id: rule, nature, reason,
    dept: row.dept, doctor: row.doctor, item_name: row.item_name,
    amount: row.amount, settle_date: row.settle_date,
  });

  // 跨行:同一追溯码重复结算
  const byCode = new Map();
  for (const r of rows) {
    const code = String(r.trace_code || '');
    if (!/^[0-9A-Z]{10,}$/i.test(code)) continue;
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(r);
  }
  for (const [code, list] of byCode) {
    if (list.length < 2) continue;
    list.sort((a, b) => String(a.settle_date).localeCompare(String(b.settle_date))); // 首笔=最早结算,其后皆为重复
    for (const r of list.slice(1)) {
      const firstDate = list[0].settle_date ? `,${list[0].settle_date}` : '';
      hit(r, 'TRACE-101', '明确违规', `追溯码 ${code.slice(0, 6)}…${code.slice(-4)} 与首笔 ${list[0].row_id}${firstDate} 重复——一物一码,同一盒药结算 ${list.length} 次`);
    }
  }

  // 行级
  for (const r of rows) {
    const age = Number(r.patient_age);
    if (Number.isFinite(age)) {
      if (age < params.minor_age && QUINOLONE_RE.test(r.item_name)) hit(r, 'AGE-101', '明确违规', `${age}岁使用喹诺酮类(${params.minor_age}岁以下禁用,两库年龄分层${params.minor_age}档)`);
      else if (age >= params.pediatric_age && PEDIATRIC_RE.test(r.item_name)) hit(r, 'AGE-101', '明确违规', `${age}岁使用儿童专用制剂(限${params.pediatric_age}岁以下支付,${params.pediatric_age}档)`);
    }
    if (r.patient_sex === '女' && MALE_ONLY_RE.test(r.item_name)) hit(r, 'F-001', '明确违规', '女性患者收取男性专属项目——性别-项目冲突');
    if (r.patient_sex === '男' && FEMALE_ONLY_RE.test(r.item_name)) hit(r, 'F-001', '明确违规', '男性患者收取女性专属项目——性别-项目冲突');
    if (/静脉输液|注射/.test(r.item_name) && r.qty >= params.qty_limit) {
      const limitText = hasQtyOverride ? `试算上限${params.qty_limit}` : '经验上限';
      hit(r, 'QTY-901', '可疑', `单日「${r.item_name}」×${r.qty} 超常(${limitText}),需调阅医嘱核实`);
    }
  }
  return hits;
}

function runScreening() {
  const t0 = Date.now();
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const rows = data.rows || [];
  const hits = screenRows(rows);
  const agg = aggregateHits(rows, hits, t0);
  const hitRows = new Set(hits.map(h => h.row_id));
  // 真值对账(诚实呈现:检出/漏检/误报——评委可任指一条,仅内置演示数据有 manifest)
  const truthSet = new Set((data.embedded_truth || []).filter(t => !/首笔/.test(t.note)).map(t => t.row_id));
  const detected = [...truthSet].filter(id => hitRows.has(id)).length;
  const falsePos = [...hitRows].filter(id => !truthSet.has(id) && !(data.embedded_truth || []).some(t => t.row_id === id)).length;
  return {
    ...agg,
    ground_truth_check: {
      embedded: truthSet.size, detected,
      missed: truthSet.size - detected, false_positives: falsePos,
      note: '与生成时埋点真值 manifest 对账(评委可任指一条核对);首笔追溯码行不算违规行',
    },
  };
}

// 漏斗聚合(runScreening 与 /api/screening/rows 剪贴板通道共用同一段统计,单一事实源)
function aggregateHits(rows, hits, t0 = Date.now()) {
  const hitRows = new Set(hits.map(h => h.row_id));
  const byNature = { 明确违规: 0, 可疑: 0 };
  const byRule = {};
  let hitAmount = 0;
  for (const h of hits) {
    byNature[h.nature] = (byNature[h.nature] || 0) + 1;
    byRule[h.rule_id] = (byRule[h.rule_id] || 0) + 1;
    hitAmount += h.amount || 0;
  }
  const ms = Date.now() - t0;
  return {
    elapsed_ms: ms,
    funnel: {
      total_rows: rows.length,
      hit_rows: hitRows.size,
      clean_rows: rows.length - hitRows.size,
      by_nature: byNature,
      by_rule: byRule,
      hit_amount: Math.round(hitAmount * 100) / 100,
    },
    top20: hits.slice().sort((a, b) => (b.amount || 0) - (a.amount || 0)).slice(0, 20),
    hits_sample: hits.slice(0, 100),
    statement: `${rows.length} 条结算明细行级筛查 ${ms}ms 完成:命中 ${hitRows.size} 行(明确违规 ${byNature.明确违规} / 可疑 ${byNature.可疑}),涉及 ¥${Math.round(hitAmount)},其余 ${rows.length - hitRows.size} 行放行——这是"1万条/月过3遍"的第一遍,人只接手命中行。`,
  };
}

// 剪贴板/任意行级筛查:接受外部 rows(如 Excel 选区 TSV 解析结果),复用同一引擎与聚合
function screenExternalRows(rowsIn) {
  const t0 = Date.now();
  const rows = (rowsIn || []).filter(r => r && typeof r === 'object');
  const hits = screenRows(rows);
  return aggregateHits(rows, hits, t0);
}

function rowMap(rows) {
  return new Map((rows || []).map(r => [r.row_id, r]));
}

function runThresholdTrial({ rule_id, param_key, param_value } = {}) {
  const ruleId = String(rule_id || '').trim();
  if (!['AGE-101', 'QTY-901'].includes(ruleId)) {
    return { ok: false, error: '仅支持 AGE-101 / QTY-901 演示试算' };
  }
  const value = Number(param_value);
  if (!Number.isFinite(value)) return { ok: false, error: 'param_value 必须是数字' };

  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const rows = data.rows || [];
  const params = {};
  const key = param_key || (ruleId === 'AGE-101' ? 'minor_age' : 'qty_limit');
  if (ruleId === 'AGE-101') {
    if (!['minor_age', 'age_limit', 'pediatric_age'].includes(key)) return { ok: false, error: 'AGE-101 仅支持 minor_age / pediatric_age' };
    params[key === 'age_limit' ? 'minor_age' : key] = value;
  } else {
    if (!['qty_limit', 'max_qty'].includes(key)) return { ok: false, error: 'QTY-901 仅支持 qty_limit' };
    params.qty_limit = value;
  }

  const baseline = screenRows(rows).filter(h => h.rule_id === ruleId);
  const trial = screenRows(rows, params).filter(h => h.rule_id === ruleId);
  const baseIds = new Set(baseline.map(h => h.row_id));
  const trialIds = new Set(trial.map(h => h.row_id));
  const truthIds = new Set((data.embedded_truth || [])
    .filter(t => t.rule === ruleId && !/首笔/.test(t.note || ''))
    .map(t => t.row_id));
  const rowsById = rowMap(rows);
  const added = [...trialIds].filter(id => !baseIds.has(id));
  const removed = [...baseIds].filter(id => !trialIds.has(id));
  const newFalsePositives = added.filter(id => !truthIds.has(id)).length;
  const goldRegressions = removed.filter(id => truthIds.has(id)).length;
  const hitById = new Map([...baseline, ...trial].map(h => [h.row_id, h]));
  const casesChanged = [...added.map(id => ({ id, change: '新增命中' })), ...removed.map(id => ({ id, change: '减少命中' }))]
    .map(x => {
      const row = rowsById.get(x.id) || {};
      const hit = hitById.get(x.id) || {};
      return {
        row_id: x.id,
        change: x.change,
        rule_id: ruleId,
        item_name: row.item_name,
        dept: row.dept,
        doctor: row.doctor,
        amount: row.amount || hit.amount || 0,
        is_truth: truthIds.has(x.id),
        note: truthIds.has(x.id) ? '命中演示真值' : '非真值埋点新增命中，计入疑似误报压力',
      };
    })
    .sort((a, b) => (b.amount || 0) - (a.amount || 0))
    .slice(0, 50);

  return {
    ok: true,
    source: 'settlements_1000.json',
    rule_id: ruleId,
    param_key: key,
    param_value: value,
    baseline_hits: baseIds.size,
    trial_hits: trialIds.size,
    delta: trialIds.size - baseIds.size,
    new_false_positives: newFalsePositives,
    gold_regressions: goldRegressions,
    cases_changed: casesChanged,
    conclusion: `阈值试算: ${ruleId} ${key}=${value} 后,触发量 ${baseIds.size}→${trialIds.size} (${trialIds.size - baseIds.size >= 0 ? '+' : ''}${trialIds.size - baseIds.size}),疑似误报压力 ${newFalsePositives}`,
  };
}

module.exports = { runScreening, screenRows, aggregateHits, screenExternalRows, runThresholdTrial };
