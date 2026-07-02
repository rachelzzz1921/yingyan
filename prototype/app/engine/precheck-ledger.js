'use strict';

/**
 * F1 事前提醒台账(闭环:设计文档 §六 G4)
 * ------------------------------------------------------------
 * 记录每次开单事前提醒的处置结果,支撑两个闭环:
 *   ① 院端运营看板:今日提醒/遵从率/萌芽拦截额 —— "违规消除在萌芽"可量化
 *   ② 院端→监管联动:医生"已提醒·未遵从"强行提交的开单 → 登记进监管重点审核预警台账
 *      (同一引擎两条产品线复用的具体落地;基于"事前提醒·事中审核·事后监管"三道防线框架的
 *       产品化落地,非政策明文条款——独立预警面板,并入优先队列排序为路线图)
 * 纯演示运行态数据,起于空、演示时实时累积(gitignore);跨北京自然日或重启自动清陈旧。
 */

const fs = require('fs');
const path = require('path');

const LEDGER_PATH = path.join(__dirname, '../../data/precheck_ledger.json');

function load() {
  try { return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8')); } catch (_) { return { schema: '1.0', events: [] }; }
}
function save(store) {
  try { fs.writeFileSync(LEDGER_PATH, JSON.stringify(store, null, 2), 'utf8'); } catch (_) { /* 只读运行态忽略 */ }
}

let _seq = 0;
const clip = (s, n) => String(s ?? '').slice(0, n);       // 字段截断,防畸形 body 撑爆单条
const clampAge = (a) => (Number.isFinite(+a) ? Math.max(0, Math.min(150, Math.round(+a))) : null);

/**
 * 记录一次事前提醒处置。
 * @param {object} e { source, patient:{sex,age,dept,diagnosis}, scenario, hits:[{rule_id,nature,rule_name}], action:'heeded'|'overridden'|'no_hit', reason, at }
 */
function record(e) {
  const store = load();
  _seq += 1;
  const hits = (Array.isArray(e.hits) ? e.hits : []).slice(0, 50); // hits 行数上限(对齐 /api/precheck 的 items 上限口径)
  const hard = hits.filter(h => h.nature === '明确违规');
  const entry = {
    id: `PC-${Date.now()}-${_seq}`,
    at: e.at || new Date().toISOString(),
    source: clip(e.source || 'plugin', 20),
    patient: {
      sex: clip(e.patient?.sex, 4), age: clampAge(e.patient?.age),
      dept: clip(e.patient?.dept, 40), diagnosis: clip(e.patient?.diagnosis, 80),
    },
    scenario: e.scenario ? clip(e.scenario, 20) : null,
    hits: hits.map(h => ({ rule_id: clip(h.rule_id, 40), nature: clip(h.nature, 10), rule_name: clip(h.rule_name, 60) })),
    hard_count: hard.length,
    suspect_count: hits.length - hard.length,
    top_rule: hits[0]?.rule_id ? clip(hits[0].rule_id, 40) : null,
    action: ['heeded', 'overridden', 'no_hit'].includes(e.action) ? e.action : (hits.length ? 'pending' : 'no_hit'),
    reason: clip(e.reason, 200),
  };
  store.events.push(entry);
  if (store.events.length > 500) store.events = store.events.slice(-500); // 台账封顶
  save(store);
  return entry;
}

// 统一按北京时区(UTC+8)判定"今日",避免 UTC 午夜(北京 08:00)演示途中翻篇丢数据
function beijingDay(iso) {
  const d = iso ? new Date(iso) : new Date();
  return new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}
function isToday(iso) { return beijingDay(iso) === beijingDay(); }

// 启动时清陈旧:只保留今日事件,忘点"清空"也不会显示上一场脏数据
function pruneStale() {
  const store = load();
  const before = (store.events || []).length;
  store.events = (store.events || []).filter(ev => isToday(ev.at));
  if (store.events.length !== before) save(store);
  return before - store.events.length;
}

/** 院端看板汇总 + 监管联动清单(未遵从) */
function summary() {
  const store = load();
  const ev = store.events || [];
  const today = ev.filter(e => isToday(e.at));
  const fired = today.filter(e => e.action !== 'no_hit');
  const heeded = today.filter(e => e.action === 'heeded');
  const overridden = today.filter(e => e.action === 'overridden');
  // 萌芽拦截:采纳了含"明确违规"的提醒 → 该违规被消灭在开单环节,监管侧少处理一条
  const buddingIntercepts = heeded.filter(e => e.hard_count > 0);
  // 未遵从待监管:强行提交且含违规 → 升入监管重点审核
  const pendingSupervision = overridden.filter(e => e.hits.length > 0);
  const byRule = {};
  for (const e of fired) for (const h of e.hits) byRule[h.rule_id] = (byRule[h.rule_id] || 0) + 1;
  const decided = heeded.length + overridden.length;
  return {
    generated_at: new Date().toISOString(),
    today: {
      reminders_fired: fired.length,
      heeded: heeded.length,
      overridden: overridden.length,
      pending_decision: fired.length - decided,
    },
    heed_rate: decided ? Math.round((heeded.length / decided) * 100) : null,
    budding_intercepts: buddingIntercepts.length, // 院端开单环节拦下的明确违规(院端拦截量,非监管实际减少量)
    by_rule: byRule,
    pending_supervision: pendingSupervision.slice(-20).reverse().map(e => ({
      id: e.id, at: e.at, dept: e.patient.dept, sex: e.patient.sex, age: e.patient.age,
      diagnosis: e.patient.diagnosis, top_rule: e.top_rule, hard_count: e.hard_count,
      reason: e.reason, rules: e.hits.map(h => h.rule_id),
    })),
    recent: fired.slice(-25).reverse().map(e => ({
      id: e.id, at: e.at, dept: e.patient.dept, action: e.action,
      hard_count: e.hard_count, suspect_count: e.suspect_count, top_rule: e.top_rule, reason: e.reason,
    })),
    total_all_time: ev.length,
  };
}

function reset() { save({ schema: '1.0', events: [] }); }

module.exports = { record, summary, reset, pruneStale, LEDGER_PATH };
