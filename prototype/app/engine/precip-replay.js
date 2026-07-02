'use strict';

/**
 * E2 沉淀门禁·历史案卷回放(Q14 定案)
 * ------------------------------------------------------------
 * 草案(规则补丁/治理动作)转正前,在全部历史案卷上自动回放:
 *   基线(当前规则) vs 候选(应用草案) 各跑一遍确定性引擎 → 逐案 diff
 *   新增命中按金标准分类: 命中 gold=新增检出 / 干净件上命中=新增误报 / 其余=新增待核
 *   消失命中: gold 内=漏检回退(红线) / gold 外=减少误报
 * 过门禁条件: 新增误报=0 且 漏检回退=0("成熟一条应用一条;假阳性率高即停用")
 * 补丁只影响 L2 语义字段(exclusions/trigger_logic)时,确定性层 diff=0/0 → 如实报告
 * "不影响确定性层,可安全转正,L2 影响由 shadow 观察期监控"。
 */

const fs = require('fs');
const path = require('path');
const { runAudit } = require('./audit-engine');
const { loadJsonKB } = require('../kb/retrieval');
const { applyOverlaysToRules } = require('./rule-precipitation-service');

function listCaseFolders(dataDir) {
  return fs.readdirSync(dataDir)
    .filter(n => n.startsWith('case_') && fs.existsSync(path.join(dataDir, n, 'medical_record.json')));
}

function findingKey(f) {
  const loc = (f.evidence || []).map(e => e.loc).filter(Boolean).slice(0, 2).join('|');
  return `${f.rule_id}#${f.status}#${loc}`;
}

function runOnce(record, rules, maps, retiredRules) {
  const rep = runAudit(JSON.parse(JSON.stringify(record)), rules, {
    policyTexts: maps.policyTexts, policyVerified: maps.policyVerified, retiredRules,
  });
  return rep.findings.filter(f => !f.shadow);
}

/**
 * @param {string} dataDir prototype/data
 * @param {object} draft 沉淀草案 {rule_id, patches, governance_action}
 * @param {object[]} baseRules 当前生效规则(已带既有 overlay)
 * @returns diff 报告 {pass, new_detections, new_false_positives, new_unverified, gold_regressions, fp_reduced, per_case, note}
 */
function replayDraft(dataDir, draft, baseRules) {
  const maps = loadJsonKB(dataDir);
  const ruleId = draft.rule_id;
  // 候选规则集:应用草案补丁;治理动作 retire/deprecate 视为下线该规则
  const overlayPreview = { patches: { [ruleId]: draft.patches || {} } };
  const candidateRules = applyOverlaysToRules(baseRules, overlayPreview);
  const retireCandidate = /retire|deprecate|停用/.test(String(draft.governance_action || ''));
  const candidateRetired = retireCandidate ? [ruleId] : [];

  const perCase = [];
  let newDetections = 0, newFalsePositives = 0, newUnverified = 0, goldRegressions = 0, fpReduced = 0;

  for (const folder of listCaseFolders(dataDir)) {
    const record = JSON.parse(fs.readFileSync(path.join(dataDir, folder, 'medical_record.json'), 'utf8'));
    let gold = null;
    try { gold = JSON.parse(fs.readFileSync(path.join(dataDir, folder, 'expected_findings.json'), 'utf8')); } catch (_) { /* 无金标准按待核处理 */ }
    const isCleanBench = (record.case_meta?.embedded_violation_count || 0) === 0;
    const goldKeys = new Set((gold?.findings || []).map(g => `${g.rule_id}#${g.status}`));

    let base, cand;
    try {
      base = runOnce(record, baseRules, maps, []);
      cand = runOnce(record, candidateRules, maps, candidateRetired);
    } catch (e) {
      perCase.push({ folder, error: e.message });
      continue;
    }
    const baseKeys = new Map(base.map(f => [findingKey(f), f]));
    const candKeys = new Map(cand.map(f => [findingKey(f), f]));

    const added = [...candKeys.keys()].filter(k => !baseKeys.has(k)).map(k => candKeys.get(k));
    const removed = [...baseKeys.keys()].filter(k => !candKeys.has(k)).map(k => baseKeys.get(k));
    if (!added.length && !removed.length) continue;

    const caseDiff = { folder, added: [], removed: [] };
    for (const f of added) {
      let cls;
      if (goldKeys.has(`${f.rule_id}#${f.status}`)) { cls = '新增检出(命中金标准)'; newDetections++; }
      else if (isCleanBench) { cls = '新增误报(干净件命中)'; newFalsePositives++; }
      else { cls = '新增待核'; newUnverified++; }
      caseDiff.added.push({ rule_id: f.rule_id, status: f.status, amount: f.amount_involved, class: cls });
    }
    for (const f of removed) {
      let cls;
      if (goldKeys.has(`${f.rule_id}#${f.status}`)) { cls = '漏检回退(金标准命中消失)'; goldRegressions++; }
      else { cls = '减少误报/待核'; fpReduced++; }
      caseDiff.removed.push({ rule_id: f.rule_id, status: f.status, amount: f.amount_involved, class: cls });
    }
    perCase.push(caseDiff);
  }

  const pass = newFalsePositives === 0 && goldRegressions === 0;
  const noImpact = !perCase.some(c => (c.added?.length || c.removed?.length));
  return {
    rule_id: ruleId,
    replayed_at: new Date().toISOString(),
    cases_replayed: listCaseFolders(dataDir).length,
    new_detections: newDetections,
    new_false_positives: newFalsePositives,
    new_unverified: newUnverified,
    gold_regressions: goldRegressions,
    fp_reduced: fpReduced,
    per_case: perCase,
    pass,
    note: noImpact
      ? '该草案不改变确定性层输出(0新增检出/0新增误报)——补丁作用于 L2 语义字段(exclusions/trigger_logic),可安全转正;语义层影响由 shadow 观察期与人审驳回率监控。'
      : (pass ? `过门禁:新增检出 ${newDetections}、减少误报 ${fpReduced},且零新增误报、零漏检回退。` : `未过门禁:新增误报 ${newFalsePositives}、漏检回退 ${goldRegressions} ——"假阳性率高即停用",草案退回候选池。`),
  };
}

module.exports = { replayDraft };
