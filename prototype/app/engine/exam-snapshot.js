'use strict';

/**
 * 院端自查复跑留痕与整改前后对比（diff）
 * ------------------------------------------------------------
 * 补齐"整改后重跑对比"承诺（此前是 UI mock）：
 *  - 体检模式每次自查落一份 snapshot（案卷 + 时间 + findings 摘要）
 *  - diff 按 finding 指纹（rule_id + 证据定位/金额）对齐两次自查：
 *    已消除（整改生效）/ 仍存在 / 新增
 */

const fs = require('fs');
const path = require('path');

const SNAPSHOT_PATH = path.join(__dirname, '../../data/exam_snapshots.json');
const MAX_PER_CASE = 20;

function loadSnapshots() {
  try { return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8')); } catch { return { snapshots: [] }; }
}

function saveSnapshots(data) {
  fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(data, null, 2), 'utf8');
}

/** finding 指纹：规则 + 首条证据定位（回退金额）——支持跨两次自查对齐同一问题 */
function findingKey(f) {
  const loc = f.evidence?.[0]?.loc || '';
  return `${f.rule_id}|${loc || 'amt:' + (f.amount_involved || 0)}`;
}

function summarizeFinding(f) {
  return {
    key: findingKey(f),
    finding_id: f.finding_id,
    rule_id: f.rule_id,
    rule_name: f.rule_name,
    status: f.status,
    violation_type: f.violation_type,
    violation_nature: f.violation_nature || null,
    amount_involved: f.amount_involved || 0,
    evidence_loc: f.evidence?.[0]?.loc || '',
  };
}

function recordSnapshot(caseId, report) {
  const data = loadSnapshots();
  const active = (report.findings || []).filter(f => !f.shadow);
  const snap = {
    snapshot_id: `SNAP-${caseId}-${Date.now()}`,
    case_id: caseId,
    at: new Date().toISOString(),
    mode: report.report_meta?.panel === '体检' ? 'exam' : 'audit',
    summary: {
      suspected: active.filter(f => f.status === '疑点').length,
      clue: active.filter(f => f.status === '线索').length,
      amount: Math.round(active.filter(f => f.status === '疑点').reduce((s, f) => s + (f.amount_involved || 0), 0) * 100) / 100,
    },
    findings: active.map(summarizeFinding),
  };
  data.snapshots = data.snapshots || [];
  data.snapshots.push(snap);
  // 每案卷保留最近 N 份
  const ofCase = data.snapshots.filter(s => s.case_id === caseId);
  if (ofCase.length > MAX_PER_CASE) {
    const dropIds = new Set(ofCase.slice(0, ofCase.length - MAX_PER_CASE).map(s => s.snapshot_id));
    data.snapshots = data.snapshots.filter(s => !dropIds.has(s.snapshot_id));
  }
  saveSnapshots(data);
  return snap;
}

function listSnapshots(caseId) {
  const all = loadSnapshots().snapshots || [];
  return caseId ? all.filter(s => s.case_id === caseId) : all;
}

/** 对比两次自查：from 缺省取倒数第二份，to 缺省取最新一份 */
function diffSnapshots(caseId, fromId = null, toId = null) {
  const snaps = listSnapshots(caseId);
  if (snaps.length < 2 && !(fromId && toId)) {
    return { ok: false, error: '该案卷自查快照不足 2 份，无法对比（先自查→整改→再自查）', snapshots: snaps.length };
  }
  const from = fromId ? snaps.find(s => s.snapshot_id === fromId) : snaps[snaps.length - 2];
  const to = toId ? snaps.find(s => s.snapshot_id === toId) : snaps[snaps.length - 1];
  if (!from || !to) return { ok: false, error: '指定的快照不存在' };

  const fromMap = new Map(from.findings.map(f => [f.key, f]));
  const toMap = new Map(to.findings.map(f => [f.key, f]));
  const resolved = from.findings.filter(f => !toMap.has(f.key));
  const persisting = to.findings.filter(f => fromMap.has(f.key));
  const added = to.findings.filter(f => !fromMap.has(f.key));
  const amt = (arr) => Math.round(arr.filter(f => f.status === '疑点').reduce((s, f) => s + (f.amount_involved || 0), 0) * 100) / 100;

  return {
    ok: true,
    case_id: caseId,
    from: { snapshot_id: from.snapshot_id, at: from.at, summary: from.summary },
    to: { snapshot_id: to.snapshot_id, at: to.at, summary: to.summary },
    summary: {
      resolved_count: resolved.length,
      persisting_count: persisting.length,
      added_count: added.length,
      resolved_amount: amt(resolved),
      persisting_amount: amt(persisting),
      added_amount: amt(added),
    },
    resolved,
    persisting,
    added,
  };
}

module.exports = { SNAPSHOT_PATH, recordSnapshot, listSnapshots, diffSnapshots, findingKey };
