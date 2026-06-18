'use strict';

const { scoreCase, sortRanked, activeFindings } = require('./priority-score');
const priorityStore = require('./priority-store');
const { enrichFindingsPipeline, mergeCaseIntoStore } = require('./priority-enrich');
const { loadRegistry } = require('./case-id');

function computeHitRates(store, { patient_id, dept, doctor } = {}) {
  const records = store.audit_records || [];
  const byKey = { patient: {}, dept: {}, doctor: {} };

  for (const ar of records) {
    const c = store.cases[ar.case_id];
    if (!c) continue;
    const active = activeFindings(ar.findings_snapshot || []);
    const hit = active.length > 0 ? 1 : 0;
    const amt = active.reduce((s, f) => s + (Number(f.amount_involved) || 0), 0);

    const bump = (map, key) => {
      if (!key) return;
      map[key] = map[key] || { cases: 0, hits: 0, amount: 0 };
      map[key].cases += 1;
      map[key].hits += hit;
      map[key].amount += amt;
    };

    bump(byKey.patient, c.patient_id);
    bump(byKey.dept, c.dept);
    bump(byKey.doctor, c.doctor);
  }

  const rate = (map, key) => {
    const row = map[key];
    if (!row || !row.cases) return 0;
    return row.hits / row.cases;
  };

  return {
    patient: rate(byKey.patient, patient_id),
    dept: rate(byKey.dept, dept),
    doctor: rate(byKey.doctor, doctor),
    raw: byKey,
  };
}

function aggregateHistory(store, filters = {}) {
  const { patient_id, dept, doctor, from, to, dim } = filters;
  let records = [...(store.audit_records || [])];

  if (from) records = records.filter(r => r.finished_at >= from);
  if (to) records = records.filter(r => r.finished_at <= to);

  const scoped = records.filter(r => {
    const c = store.cases[r.case_id];
    if (!c) return false;
    if (patient_id && c.patient_id !== patient_id) return false;
    if (dept && c.dept !== dept) return false;
    if (doctor && c.doctor !== doctor) return false;
    return true;
  });

  const dimensions = {};
  for (const ar of scoped) {
    const c = store.cases[ar.case_id];
    const active = activeFindings(ar.findings_snapshot || []);
    for (const [dimKey, key] of [
      ['patient', c.patient_id],
      ['dept', c.dept],
      ['doctor', c.doctor],
      ['drg_group', c.drg_group],
    ]) {
      if (!key) continue;
      if (dim && dim !== dimKey) continue;
      dimensions[dimKey] = dimensions[dimKey] || {};
      dimensions[dimKey][key] = dimensions[dimKey][key] || { audits: 0, hit_cases: 0, suspected_amount: 0, label: key };
      const row = dimensions[dimKey][key];
      row.audits += 1;
      if (active.length) row.hit_cases += 1;
      row.suspected_amount += active.filter(f => f.status === '疑点').reduce((s, f) => s + (Number(f.amount_involved) || 0), 0);
    }
  }

  const hitRates = {};
  for (const [dim, map] of Object.entries(dimensions)) {
    hitRates[dim] = Object.entries(map).map(([key, row]) => ({
      key,
      label: row.label,
      audits: row.audits,
      hit_rate: row.audits ? Math.round((row.hit_cases / row.audits) * 1000) / 1000 : 0,
      suspected_amount: Math.round(row.suspected_amount * 100) / 100,
    })).sort((a, b) => b.hit_rate - a.hit_rate);
  }

  return {
    total_audits: scoped.length,
    records: scoped.slice(-50).reverse(),
    hit_rates: hitRates,
  };
}

async function ensureFindings(store, caseApiId, record, runAuditFn, { force = false, examMode = false } = {}) {
  const c = store.cases[caseApiId];
  if (!force && c?.findings_cache && c.findings_cached_at) {
    return c.findings_cache;
  }
  const report = runAuditFn(record);
  const enriched = enrichFindingsPipeline(report.findings || [], record, store, store.config, { examMode });
  const findings = enriched.findings;
  if (c) {
    Object.assign(c, mergeCaseIntoStore(c, enriched.case_fields));
    c.suppressed_special_case = enriched.suppressed_special_case;
  }
  priorityStore.setFindingsCache(store, caseApiId, findings, {});
  return findings;
}

function buildRankRow(store, caseApiId, record, findings, config, peerAmountsByDept) {
  const c = store.cases[caseApiId] || {};
  const history = computeHitRates(store, {
    patient_id: c.patient_id,
    dept: c.dept,
    doctor: c.doctor,
  });
  if (c.drg_group && store.audit_records?.length) {
    const drgHits = store.audit_records.filter(ar => store.cases[ar.case_id]?.drg_group === c.drg_group);
    history.drg_group = drgHits.length
      ? drgHits.filter(ar => activeFindings(ar.findings_snapshot || []).length).length / drgHits.length
      : 0;
  }
  const scored = scoreCase({
    findings,
    history,
    peerAmounts: peerAmountsByDept[c.dept] || [],
    config,
    risk_tags: c.risk_tags || [],
    special_case_review: c.special_case_review || record?.case_meta?.special_case_review,
  });

  return {
    case_id: caseApiId,
    case_title: c.case_title || record.case_meta?.case_title,
    patient_id: c.patient_id,
    status: c.status || 'uploaded',
    dept: c.dept,
    doctor: c.doctor,
    principal_diagnosis: c.principal_diagnosis,
    completeness: c.completeness,
    tier: scored.tier,
    tier_label: scored.tier === 1 ? '疑点' : scored.tier === 2 ? '线索' : '无命中',
    api_score: scored.api_score,
    breakdown: scored.breakdown,
    suspected_count: scored.suspected_count,
    suspected_amount: scored.suspected_amount,
    clue_count: scored.clue_count,
    shadow_count: scored.shadow_count,
    shadow_amount: scored.shadow_amount,
    top_violation: scored.top_violation,
    special_case_review: c.special_case_review || record?.case_meta?.special_case_review || '无',
    risk_tags: c.risk_tags || [],
    bench_tier: c.bench_tier || null,
    violation_nature: (() => {
      const top = scored.top_violation;
      if (!top) return null;
      const f = findings.find(x => x.rule_id === top.rule_id && x.status === top.status);
      return f?.violation_nature || null;
    })(),
    disposition: (() => {
      const top = scored.top_violation;
      if (!top) return null;
      return findings.find(x => x.rule_id === top.rule_id)?.disposition_suggestion;
    })(),
    history_hint: {
      patient: Math.round((history.patient || 0) * 100),
      dept: Math.round((history.dept || 0) * 100),
      doctor: Math.round((history.doctor || 0) * 100),
    },
    computed_at: scored.computed_at,
  };
}

async function buildRankQueue(store, casesMap, runAuditFn, filters = {}) {
  priorityStore.syncCasesFromDb(store, casesMap);
  const config = store.config;
  const boundaryIds = new Set(
    (loadRegistry().entries || []).filter(e => e.bench_tier === 'boundary').map(e => e.api_id),
  );
  for (const id of boundaryIds) {
    if (store.cases[id]) store.cases[id].bench_tier = 'boundary';
  }

  const caseIds = Object.keys(store.cases).filter(id => {
    const c = store.cases[id];
    if (!casesMap[id] && id !== 'uploaded') return false;
    if (filters.status && c.status !== filters.status) return false;
    if (filters.dept && c.dept !== filters.dept) return false;
    if (filters.doctor && c.doctor !== filters.doctor) return false;
    if (filters.q) {
      const q = filters.q.toLowerCase();
      const hay = `${c.case_title || ''} ${c.principal_diagnosis || ''} ${id}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const findingsMap = {};
  for (const id of caseIds) {
    const record = casesMap[id];
    if (!record) continue;
    findingsMap[id] = await ensureFindings(store, id, record, runAuditFn, { force: !!filters.refresh });
  }

  const preScores = caseIds.map(id => {
    const active = activeFindings(findingsMap[id] || []);
    return {
      id,
      dept: store.cases[id]?.dept,
      S: active.reduce((s, f) => s + (Number(f.amount_involved) || 0), 0),
    };
  });
  const peerAmountsByDept = {};
  for (const row of preScores) {
    if (!row.dept) continue;
    peerAmountsByDept[row.dept] = peerAmountsByDept[row.dept] || [];
    if (row.S > 0) peerAmountsByDept[row.dept].push(row.S);
  }

  const ranked = [];
  const shadowBucket = [];
  const zeroBucket = [];
  const boundaryBucket = [];

  for (const id of caseIds) {
    const record = casesMap[id];
    if (!record) continue;
    const findings = findingsMap[id] || [];
    const row = buildRankRow(store, id, record, findings, config, peerAmountsByDept);

    if (filters.amount_min != null && row.suspected_amount < Number(filters.amount_min)) continue;
    if (filters.amount_max != null && row.suspected_amount > Number(filters.amount_max)) continue;
    if (filters.risk_level && row.top_violation) {
      const rl = row.top_violation.risk_level || '';
      if (!rl.includes(filters.risk_level)) continue;
    }

    const shadowOnly = (findings || []).filter(f => f.shadow);
    const isBoundaryBench = boundaryIds.has(id);
    if (row.tier >= 3 && !shadowOnly.length && isBoundaryBench) {
      boundaryBucket.push({ ...row, boundary_bench: true });
    } else if (row.tier >= 3 && !shadowOnly.length) zeroBucket.push(row);
    else if (row.tier >= 3 && shadowOnly.length) {
      shadowBucket.push({ ...row, shadow_only: true, shadow_count: shadowOnly.length });
    } else ranked.push(row);
  }

  const sorted = sortRanked(ranked);
  return {
    queue: sorted,
    shadow_bucket: shadowBucket.sort((a, b) => (b.shadow_amount || 0) - (a.shadow_amount || 0)),
    zero_bucket: zeroBucket,
    boundary_bucket: boundaryBucket.sort((a, b) => (a.case_title || a.case_id).localeCompare(b.case_title || b.case_id, 'zh')),
    config: store.config,
    computed_at: new Date().toISOString(),
    total: sorted.length,
    boundary_count: boundaryBucket.length,
  };
}

async function getCaseDetailFull(store, caseApiId, record, runAuditFn, { maskPii = true, force = false, examMode = false } = {}) {
  const findings = await ensureFindings(store, caseApiId, record, runAuditFn, { force, examMode });
  const detail = getCaseDetail(store, caseApiId, record, { maskPii });
  detail.findings = findings;

  const peerAmountsByDept = {};
  for (const [id, c] of Object.entries(store.cases || {})) {
    if (!record && !c) continue;
    const cached = id === caseApiId ? findings : (c.findings_cache || []);
    const active = activeFindings(cached);
    const dept = c.dept;
    const S = active.reduce((s, f) => s + (Number(f.amount_involved) || 0), 0);
    if (dept && S > 0) {
      peerAmountsByDept[dept] = peerAmountsByDept[dept] || [];
      peerAmountsByDept[dept].push(S);
    }
  }
  detail.score = buildRankRow(store, caseApiId, record, findings, store.config, peerAmountsByDept);
  return detail;
}

function getCaseDetail(store, caseApiId, record, { maskPii = true } = {}) {
  const c = store.cases[caseApiId];
  const patient = c ? priorityStore.getPatient(store, c.patient_id, { maskPii }) : null;
  const slots = record ? priorityStore.slotCompleteness(record) : null;
  return {
    case: c,
    patient: patient ? { patient_id: patient.patient_id, name: patient.name, case_ids: patient.case_ids } : null,
    record_meta: record ? {
      case_meta: record.case_meta,
      front_page: maskPii ? {
        ...record.front_page,
        patient_name: priorityStore.maskPatient({ name: record.front_page?.patient_name, pii_token: record.case_meta?.pii_token }, true).name,
      } : record.front_page,
      fee_list: record.fee_list,
    } : null,
    findings: c?.findings_cache || [],
    slots,
    audit_records: (store.audit_records || []).filter(r => r.case_id === caseApiId).slice(-10).reverse(),
  };
}

function finalizeBatchAudit(store, caseIds, jobId) {
  for (const id of caseIds) {
    priorityStore.setCaseStatus(store, id, 'auditing', `batch:${jobId}`);
  }
}

function completeBatchAudit(store, caseId, findings, reportMeta) {
  priorityStore.createAuditRecord(store, {
    case_id: caseId,
    findings,
    report_meta: reportMeta,
    auditor_id: 'batch-queue',
  });
}

/** 批量入队案卷顺序：priority=true 时按 api_score 队列排序 */
async function resolveBatchCaseIds(casesMap, runAuditFn, body = {}) {
  const skip = new Set(body.skip || ['uploaded']);
  if (!body.priority) {
    let caseIds = body.caseIds;
    if (body.all || !caseIds?.length) {
      caseIds = Object.keys(casesMap).filter(id => !skip.has(id));
    } else {
      caseIds = caseIds.filter(id => !skip.has(id));
    }
    if (body.top_n) {
      caseIds = caseIds.slice(0, Math.max(1, Number(body.top_n) || 10));
    }
    return { caseIds, rank_meta: null, priority_ranked: false };
  }

  const store = priorityStore.loadStore();
  const rank = await buildRankQueue(store, casesMap, runAuditFn, {
    refresh: body.refresh_rank === true,
    dept: body.dept || undefined,
    doctor: body.doctor || undefined,
    amount_min: body.amount_min || undefined,
  });

  const ordered = [
    ...(rank.queue || []).map(r => r.case_id),
    ...(rank.shadow_bucket || []).map(r => r.case_id),
    ...(rank.zero_bucket || []).map(r => r.case_id),
    ...(rank.boundary_bucket || []).map(r => r.case_id),
  ].filter((id, i, arr) => arr.indexOf(id) === i && !skip.has(id));

  let caseIds = ordered;
  if (body.caseIds?.length) {
    const orderMap = new Map(ordered.map((id, i) => [id, i]));
    caseIds = body.caseIds
      .filter(id => !skip.has(id))
      .sort((a, b) => (orderMap.get(a) ?? 9999) - (orderMap.get(b) ?? 9999));
  }
  if (body.top_n) {
    caseIds = caseIds.slice(0, Math.max(1, Number(body.top_n) || 10));
  }

  const rank_meta = {
    priority_ranked: true,
    computed_at: rank.computed_at,
    tier1_count: (rank.queue || []).filter(r => r.tier === 1).length,
    preview: (rank.queue || []).slice(0, 6).map(r => ({
      case_id: r.case_id,
      api_score: r.api_score,
      tier: r.tier,
      suspected_amount: r.suspected_amount,
    })),
  };
  return { caseIds, rank_meta, priority_ranked: true };
}

module.exports = {
  computeHitRates,
  aggregateHistory,
  ensureFindings,
  buildRankQueue,
  getCaseDetail,
  getCaseDetailFull,
  finalizeBatchAudit,
  completeBatchAudit,
  resolveBatchCaseIds,
};
