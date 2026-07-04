'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const evidenceLinks = require('./evidence-link-store');
const priorityStore = require('./priority-store');
const { activeFindings } = require('./priority-score');
const { findingNature, NATURE } = require('./nature');
const precipService = require('./rule-precipitation-service');
const { isReadonlyRuntime } = require('./runtime-env');

const DATA_DIR = path.join(__dirname, '../../data');
const STORE_PATH = path.join(DATA_DIR, 'onsite/store.json');

const TASK_TYPES = ['设备存在性核查', '进销存盘点', '病历调阅+人员询问'];
const STATIONS = [
  { station_id: 'station-equipment', name: '设备科 / 影像科' },
  { station_id: 'station-pharmacy', name: '药库 / 耗材库' },
  { station_id: 'station-records', name: '病案室 / 医务科' },
  { station_id: 'station-finance', name: '财务科 / 结算办' },
  { station_id: 'station-info', name: '信息科' },
];
const ROUTES = [
  { route_id: 'route-a', name: '动线 A', teams: ['医疗组', '政策组'], station_ids: ['station-records', 'station-equipment', 'station-info'] },
  { route_id: 'route-b', name: '动线 B', teams: ['财务组', '数据组'], station_ids: ['station-pharmacy', 'station-finance', 'station-info'] },
];

function emptyStore() {
  return { schema_version: '1.0', plans: [], tasks: [], stations: STATIONS, routes: ROUTES };
}

function loadStore() {
  try {
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    return {
      ...emptyStore(),
      ...raw,
      plans: Array.isArray(raw.plans) ? raw.plans : [],
      tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
      stations: Array.isArray(raw.stations) && raw.stations.length ? raw.stations : STATIONS,
      routes: Array.isArray(raw.routes) && raw.routes.length ? raw.routes : ROUTES,
    };
  } catch {
    return emptyStore();
  }
}

function saveStore(store) {
  if (isReadonlyRuntime()) return;
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify({ ...emptyStore(), ...store }, null, 2), 'utf8');
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function taskKindForFinding(finding) {
  const text = `${finding.rule_id || ''} ${finding.rule_name || ''} ${finding.violation_type || ''} ${finding.reasoning || ''}`;
  if (/设备|器械|影像|麻醉|手术|检查/.test(text)) return '设备存在性核查';
  if (/药|耗材|进销存|发药|库存|追溯|回流|重复开药/.test(text)) return '进销存盘点';
  return '病历调阅+人员询问';
}

function stationForType(type) {
  if (type === '设备存在性核查') return 'station-equipment';
  if (type === '进销存盘点') return 'station-pharmacy';
  return 'station-records';
}

function teamForIndex(idx) {
  return idx % 2 === 0 ? '医疗组' : '财务组';
}

function routeForTeam(team) {
  return ['财务组', '数据组'].includes(team) ? 'route-b' : 'route-a';
}

function evidenceRequirements(type) {
  if (type === '设备存在性核查') return ['铭牌与序列号照片', '采购发票编号', '收费期间设备在院说明'];
  if (type === '进销存盘点') return ['台账复印盖章', '收费量 vs 出库量差量计算表', '发票/随货同行单编号'];
  return ['原始病历调阅记录', '经治医师询问笔录', '逐页签字/捺印确认'];
}

function complianceFlags(type) {
  return { need_two_officers: true, need_signed_transcript: type === '病历调阅+人员询问' };
}

function lineNoFromFinding(finding) {
  const text = JSON.stringify(finding?.evidence || []) + ' ' + (finding?.reasoning || '');
  const m = text.match(/第\s*(\d+)\s*行/);
  return m ? Number(m[1]) : null;
}

function basisRef(rule) {
  return {
    rule_id: rule?.rule_id || null,
    rule_name: rule?.rule_name || null,
    official_gz_codes: rule?.official?.gz_codes || [],
    effective_interval: rule?.effective_interval || null,
    policy_basis: rule?.policy_basis || [],
    disposal: rule?.workflow_messages?.regulator?.disposal || rule?.workflow_messages?.audit?.disposal || rule?.disposal_suggestion || '',
    region_override: rule?.params?.region_override || '',
  };
}

function selectCandidateFindings(priorityStoreData, rulesDoc, selected = []) {
  const selectedSet = new Set(selected.map(x => `${x.case_id || x.caseId || x}:${x.finding_id || x.findingId || ''}`));
  const all = [];
  for (const [caseId, row] of Object.entries(priorityStoreData.cases || {})) {
    const active = activeFindings(row.findings_cache || [])
      .filter(f => {
        const nature = findingNature(f);
        if (nature === NATURE.CLEAN) return false;
        return f.status === '疑点' || f.status === '线索';
      })
      .map(f => ({ ...f, case_id: caseId, case_title: row.case_title, dept: row.dept, nature: findingNature(f) }));
    all.push(...active);
  }
  all.sort((a, b) => (Number(b.amount_involved) || 0) - (Number(a.amount_involved) || 0));
  const chosen = selectedSet.size
    ? all.filter(f => selectedSet.has(`${f.case_id}:${f.finding_id || f.rule_id}`) || selectedSet.has(`${f.case_id}:`))
    : all.slice(0, 8);
  return chosen.map(f => {
    const rule = (rulesDoc || []).find(r => r.rule_id === f.rule_id) || {};
    return { ...f, basis_ref: basisRef(rule) };
  });
}

function listCandidates(priorityStoreData, rulesDoc, limit = 24) {
  return selectCandidateFindings(priorityStoreData, rulesDoc, []).slice(0, limit);
}

function createPlan({ priorityStoreData, rulesDoc, selected, orgId, period, createdBy }) {
  const now = new Date().toISOString();
  const findings = selectCandidateFindings(priorityStoreData, rulesDoc, selected).slice(0, 8);
  if (!findings.length) return { ok: false, error: '优先队列中暂无可生成现场任务的疑点' };
  const store = loadStore();
  const planId = `IP-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
  const tasks = findings.map((f, idx) => {
    const type = taskKindForFinding(f);
    const team = teamForIndex(idx);
    return {
      task_id: `IT-${Date.now().toString(36)}-${idx + 1}`,
      plan_id: planId,
      source_finding_id: f.finding_id || f.rule_id,
      case_id: f.case_id,
      case_title: f.case_title || f.case_id,
      rule_id: f.rule_id,
      rule_name: f.rule_name,
      amount_involved: round2(f.amount_involved),
      original_nature: f.nature,
      station_id: stationForType(type),
      team,
      route_id: routeForTeam(team),
      type,
      basis_ref: f.basis_ref,
      evidence_requirements: evidenceRequirements(type),
      compliance_flags: complianceFlags(type),
      fee_line_no: lineNoFromFinding(f) || 1,
      state: '已分配',
      verify_result: null,
      verify_reason: '',
      needs_more_evidence: false,
      created_at: now,
      updated_at: now,
    };
  });
  const plan = {
    plan_id: planId,
    org_id: orgId || '示范市第一人民医院',
    period: period || now.slice(0, 10),
    teams: ['医疗组', '财务组'],
    routes: ROUTES,
    status: '进行中',
    created_from: 'queue_selection',
    created_by: createdBy || 'onsite-lead',
    created_at: now,
    updated_at: now,
    task_ids: tasks.map(t => t.task_id),
  };
  store.plans.push(plan);
  store.tasks.push(...tasks);
  saveStore(store);
  return { ok: true, plan, tasks, stations: store.stations, routes: store.routes };
}

function findTask(store, taskId) {
  return (store.tasks || []).find(t => t.task_id === taskId);
}

function appendReviewReject(dataDir, task, reason) {
  const fp = path.join(dataDir || DATA_DIR, 'review_feedback.json');
  let review = { entries: [] };
  try { review = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { /* first write */ }
  review.entries = review.entries || [];
  review.entries.push({
    finding_id: task.source_finding_id,
    rule_id: task.rule_id,
    case_id: task.case_id,
    action: '驳回',
    reason,
    source: 'onsite',
    ts: new Date().toISOString(),
  });
  if (!isReadonlyRuntime()) fs.writeFileSync(fp, JSON.stringify(review, null, 2), 'utf8');
  return review;
}

function verifyTask({ taskId, result, reason, operators, officers, evidencePayload, casesMap, dataDir, rulesDoc }) {
  if (!['属实', '不属实', '存疑'].includes(result)) return { ok: false, error: 'verify_result 必须为 属实/不属实/存疑' };
  if (result === '不属实' && !String(reason || '').trim()) return { ok: false, error: '不属实必须填写排除理由' };
  const store = loadStore();
  const task = findTask(store, taskId);
  if (!task) return { ok: false, error: '任务不存在' };
  if (task.compliance_flags?.need_two_officers && (!Array.isArray(officers) || officers.filter(Boolean).length < 2)) {
    return { ok: false, error: '本任务需填写两名持证人员' };
  }
  const now = new Date().toISOString();
  task.verify_result = result;
  task.verify_reason = reason || '';
  task.operators = operators || [];
  task.officers = officers || [];
  task.state = result === '存疑' ? '已核' : '已回填';
  task.needs_more_evidence = result === '存疑';
  task.updated_at = now;

  const pStore = priorityStore.loadStore();
  const caseRow = pStore.cases?.[task.case_id];
  const finding = (caseRow?.findings_cache || []).find(f => f.finding_id === task.source_finding_id || f.rule_id === task.rule_id);
  if (finding) {
    finding.onsite_result = result;
    finding.onsite_verified_at = now;
    finding.onsite_task_id = task.task_id;
    if (result === '属实') {
      finding.nature = finding.nature === '可疑' ? '明确违规' : (finding.nature || '明确违规');
      finding.status = '疑点';
      finding.onsite_disposition = '坐实';
    } else if (result === '不属实') {
      finding.onsite_disposition = '排除';
      finding.excluded = true;
      finding.shadow = true;
      finding.exclude_reason = reason;
    } else {
      finding.onsite_disposition = '需补证';
      finding.needs_more_evidence = true;
    }
    caseRow.updated_at = now;
  }

  let onsiteEvidence = null;
  if (result === '属实') {
    onsiteEvidence = evidenceLinks.addOnsiteEvidence({
      caseId: task.case_id,
      record: casesMap?.[task.case_id],
      finding,
      task,
      payload: evidencePayload || {},
      operators,
      officers,
      ts: now,
    });
    task.onsite_evidence_link_id = onsiteEvidence.link_id;
  }

  if (result === '不属实') {
    const review = appendReviewReject(dataDir || DATA_DIR, task, reason);
    try {
      precipService.processReviewFeedback(dataDir || DATA_DIR, {
        ruleId: task.rule_id,
        reviewStore: review,
        ruleStates: { states: {} },
        rulesDoc: rulesDoc || [],
        collectFeedback: () => ({ examples: [] }),
        trigger: 'onsite',
      }).catch(() => {});
    } catch { /* 不阻断现场回填 */ }
  }

  priorityStore.appendAuditLog(pStore, {
    action: 'onsite_verify',
    case_id: task.case_id,
    finding_id: task.source_finding_id,
    task_id: task.task_id,
    result,
    reason: reason || '',
    officers: officers || [],
  });
  priorityStore.saveStore(pStore);

  const plan = store.plans.find(p => p.plan_id === task.plan_id);
  if (plan) {
    plan.updated_at = now;
    const planTasks = store.tasks.filter(t => t.plan_id === plan.plan_id);
    if (planTasks.every(t => ['已回填', '已核'].includes(t.state))) plan.status = '已完成';
  }
  saveStore(store);
  return { ok: true, task, finding, onsite_evidence: onsiteEvidence };
}

function getPlan(planId) {
  const store = loadStore();
  const plan = planId ? store.plans.find(p => p.plan_id === planId) : store.plans[store.plans.length - 1];
  if (!plan) return { ok: false, error: '暂无现场计划' };
  const tasks = store.tasks.filter(t => t.plan_id === plan.plan_id);
  const stations = store.stations.map(s => ({ ...s, tasks: tasks.filter(t => t.station_id === s.station_id) }));
  return { ok: true, plan, tasks, stations, routes: store.routes };
}

function buildDailyBrief(planId) {
  const data = getPlan(planId);
  if (!data.ok) return data;
  const tasks = data.tasks;
  const verified = tasks.filter(t => t.verify_result);
  const confirmed = tasks.filter(t => t.verify_result === '属实');
  const rejected = tasks.filter(t => t.verify_result === '不属实');
  const pending = tasks.filter(t => t.verify_result === '存疑' || t.needs_more_evidence);
  const completedStations = data.stations.filter(s => (s.tasks || []).some(t => t.verify_result)).length;
  return {
    ok: true,
    generated_at: new Date().toISOString(),
    plan: data.plan,
    summary: {
      total_tasks: tasks.length,
      verified_tasks: verified.length,
      completed_stations: completedStations,
      confirmed_count: confirmed.length,
      rejected_count: rejected.length,
      pending_evidence_count: pending.length,
      amount_confirmed: round2(confirmed.reduce((s, t) => s + (Number(t.amount_involved) || 0), 0)),
    },
    by_team: data.plan.teams.map(team => {
      const list = tasks.filter(t => t.team === team);
      return {
        team,
        total: list.length,
        done: list.filter(t => t.verify_result).length,
        confirmed: list.filter(t => t.verify_result === '属实').length,
        amount_confirmed: round2(list.filter(t => t.verify_result === '属实').reduce((s, t) => s + (Number(t.amount_involved) || 0), 0)),
      };
    }),
    stations: data.stations.map(s => ({
      station_id: s.station_id,
      name: s.name,
      total: s.tasks.length,
      done: s.tasks.filter(t => t.verify_result).length,
    })),
    confirmed_tasks: confirmed,
    rejected_tasks: rejected,
    pending_tasks: pending,
  };
}

module.exports = {
  STORE_PATH,
  TASK_TYPES,
  STATIONS,
  ROUTES,
  loadStore,
  saveStore,
  listCandidates,
  createPlan,
  verifyTask,
  getPlan,
  buildDailyBrief,
};
