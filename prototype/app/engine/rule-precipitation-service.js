/**
 * 规则沉淀双链服务：驳回链（误报淘汰）+ 采纳链（规则巩固）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { runRejectPrecipitationAgent, runAdoptPrecipitationAgent } = require('./rule-precipitation-agent');

const REJECT_THRESHOLD = 3;
const ADOPT_THRESHOLD = 3;
const ADOPT_WINDOW = 10;
const ADOPT_MAX_REJECT_IN_WINDOW = 1;

function precipPaths(dataDir) {
  return {
    queue: path.join(dataDir, 'rule_precipitation_queue.json'),
    overlay: path.join(dataDir, 'rule_patch_overlay.json'),
  };
}

function loadJSON(fp, fallback) {
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (e) { return fallback; }
}

function normalizeQueue(raw) {
  if (raw.reject_items || raw.adopt_items) {
    return {
      reject_items: raw.reject_items || [],
      adopt_items: raw.adopt_items || [],
      reject_drafts: raw.reject_drafts || [],
      adopt_drafts: raw.adopt_drafts || [],
    };
  }
  const items = raw.items || [];
  const drafts = raw.drafts || [];
  return {
    reject_items: items.map(i => ({ ...i, track: 'reject' })),
    adopt_items: [],
    reject_drafts: drafts.map(d => ({ ...d, track: d.track || 'reject' })),
    adopt_drafts: [],
  };
}

function loadPrecipQueue(dataDir) {
  const fp = precipPaths(dataDir).queue;
  return normalizeQueue(loadJSON(fp, { items: [], drafts: [] }));
}

function savePrecipQueue(dataDir, q) {
  fs.writeFileSync(precipPaths(dataDir).queue, JSON.stringify(q, null, 2), 'utf8');
}

function loadRuleOverlay(dataDir) {
  return loadJSON(precipPaths(dataDir).overlay, { patches: {} });
}

function saveRuleOverlay(dataDir, overlay) {
  fs.writeFileSync(precipPaths(dataDir).overlay, JSON.stringify(overlay, null, 2), 'utf8');
}

function applyOverlaysToRules(rules, overlay) {
  if (!overlay?.patches) return rules;
  return rules.map(r => {
    const p = overlay.patches[r.rule_id];
    if (!p) return r;
    const copy = { ...r };
    if (p.exclusions_replace) copy.exclusions = p.exclusions_replace;
    else if (p.exclusions_append) {
      copy.exclusions = `${r.exclusions || ''}${r.exclusions ? '；' : ''}${p.exclusions_append}`;
    }
    if (p.trigger_logic) copy.trigger_logic = p.trigger_logic;
    copy._overlay_preview = true;
    return copy;
  });
}

function ruleChainProgress(store, ruleId, ruleStates) {
  const entries = (store.entries || []).filter(e => e.rule_id === ruleId);
  const by = {};
  for (const e of store.entries || []) {
    if (e.rule_id !== ruleId) continue;
    const r = by[e.rule_id] = by[e.rule_id] || { adopted: 0, rejected: 0, more: 0 };
    if (e.action === '采纳') r.adopted++;
    else if (e.action === '驳回') r.rejected++;
    else if (e.action === '补材料') r.more++;
  }
  const stats = by[ruleId] || { adopted: 0, rejected: 0, more: 0 };
  const ack = ruleStates?.states?.[ruleId]?.ack_rejects || 0;
  const effectiveRejected = Math.max(0, stats.rejected - ack);
  const recent = entries.slice(-ADOPT_WINDOW);
  const recentRejects = recent.filter(e => e.action === '驳回').length;

  return {
    rule_id: ruleId,
    adopted: stats.adopted,
    rejected: stats.rejected,
    effective_rejected: effectiveRejected,
    more: stats.more,
    reject: {
      count: effectiveRejected,
      threshold: REJECT_THRESHOLD,
      remaining: Math.max(0, REJECT_THRESHOLD - effectiveRejected),
      eligible: effectiveRejected >= REJECT_THRESHOLD,
    },
    adopt: {
      count: stats.adopted,
      threshold: ADOPT_THRESHOLD,
      remaining: Math.max(0, ADOPT_THRESHOLD - stats.adopted),
      window_rejects: recentRejects,
      window_max_rejects: ADOPT_MAX_REJECT_IN_WINDOW,
      eligible: stats.adopted >= ADOPT_THRESHOLD && recentRejects <= ADOPT_MAX_REJECT_IN_WINDOW,
    },
  };
}

function findPendingItem(q, ruleId, track) {
  const list = track === 'adopt' ? q.adopt_items : q.reject_items;
  return list.find(i => i.rule_id === ruleId && (i.status === 'pending' || i.status === 'running' || i.status === 'draft_ready'));
}

async function runAgentForTrack(track, rule, feedback, stats, governanceStatus) {
  if (track === 'adopt') {
    return runAdoptPrecipitationAgent(rule, feedback, stats, governanceStatus);
  }
  return runRejectPrecipitationAgent(rule, feedback, stats, governanceStatus);
}

async function autoRunAgent(dataDir, q, track, ruleId, rule, feedback, stats, governanceStatus, trigger) {
  const draft = await runAgentForTrack(track, rule, feedback, stats, governanceStatus);
  const draftId = `RD-${track === 'adopt' ? 'A' : 'R'}-${Date.now()}`;
  draft.id = draftId;
  draft.track = track;
  draft.created_at = new Date().toISOString();
  draft.trigger = trigger;

  const draftList = track === 'adopt' ? q.adopt_drafts : q.reject_drafts;
  draftList.push(draft);

  const items = track === 'adopt' ? q.adopt_items : q.reject_items;
  let item = items.find(i => i.rule_id === ruleId && i.status !== 'applied' && i.status !== 'dismissed');
  if (!item) {
    item = {
      id: `RP-${track === 'adopt' ? 'A' : 'R'}-${Date.now()}`,
      rule_id: ruleId,
      track,
      status: 'draft_ready',
      trigger,
      created_at: new Date().toISOString(),
      draft_id: draftId,
    };
    items.push(item);
  } else {
    item.status = 'draft_ready';
    item.draft_id = draftId;
    item.updated_at = new Date().toISOString();
  }
  return { draft, item };
}

async function maybeEnqueueAndRun(dataDir, {
  ruleId, track, trigger, rule, feedback, stats, governanceStatus, force = false,
}) {
  const q = loadPrecipQueue(dataDir);
  const progress = track === 'adopt'
    ? stats.adopted >= ADOPT_THRESHOLD && (stats.recent_rejects ?? 0) <= ADOPT_MAX_REJECT_IN_WINDOW
    : stats.effective_rejected >= REJECT_THRESHOLD;

  if (!force && !progress) return { enqueued: false, q };

  const existing = findPendingItem(q, ruleId, track);
  if (existing && existing.status === 'draft_ready' && !force) {
    return { enqueued: false, skipped: 'already_has_draft', item: existing, q };
  }

  if (!existing) {
    const items = track === 'adopt' ? q.adopt_items : q.reject_items;
    items.push({
      id: `RP-${track === 'adopt' ? 'A' : 'R'}-${Date.now()}`,
      rule_id: ruleId,
      track,
      status: 'pending',
      trigger,
      created_at: new Date().toISOString(),
      draft_id: null,
    });
  }

  savePrecipQueue(dataDir, q);
  const result = await autoRunAgent(dataDir, q, track, ruleId, rule, feedback, stats, governanceStatus, trigger);
  savePrecipQueue(dataDir, q);
  return { enqueued: true, ...result, q };
}

async function processReviewFeedback(dataDir, {
  ruleId, reviewStore, ruleStates, rulesDoc, collectFeedback, trigger = 'review',
}) {
  const chain = ruleChainProgress(reviewStore, ruleId, ruleStates);
  const rule = rulesDoc.find(r => r.rule_id === ruleId);
  if (!rule) return { chain, precip: {} };

  const feedback = collectFeedback(ruleId);
  const stats = {
    adopted: chain.adopted,
    rejected: chain.rejected,
    effective_rejected: chain.effective_rejected,
    recent_rejects: chain.adopt.window_rejects,
  };
  const gov = ruleStates?.states?.[ruleId]?.status || 'active';

  const precip = { reject: null, adopt: null };

  if (chain.reject.eligible) {
    precip.reject = await maybeEnqueueAndRun(dataDir, {
      ruleId, track: 'reject', trigger: `${trigger}_reject`, rule, feedback, stats, governanceStatus: gov,
    });
  }
  if (chain.adopt.eligible) {
    precip.adopt = await maybeEnqueueAndRun(dataDir, {
      ruleId, track: 'adopt', trigger: `${trigger}_adopt`, rule, feedback, stats, governanceStatus: gov,
    });
  }

  return { chain, precip };
}

function applyDraftToOverlay(dataDir, draft, action) {
  const overlay = loadRuleOverlay(dataDir);
  if (action === 'dismiss') return overlay;

  const p = draft.patches || {};
  overlay.patches[draft.rule_id] = {
    draft_id: draft.id,
    track: draft.track,
    recommendation: draft.recommendation,
    exclusions_append: p.exclusions_append || (p.exclusions && !p.exclusions_replace ? p.exclusions : ''),
    exclusions_replace: p.exclusions_replace || null,
    trigger_logic: p.trigger_logic || null,
    test_cases: draft.suggested_test_cases || [],
    governance_suggestion: draft.governance_action || null,
    applied_at: new Date().toISOString(),
    preview_note: 'overlay 预览：runAudit 合并 exclusions/trigger，不改源 rules.json',
  };
  saveRuleOverlay(dataDir, overlay);
  return overlay;
}

function resolveDraft(dataDir, draftId, action, note) {
  const q = loadPrecipQueue(dataDir);
  let draft = (q.reject_drafts || []).find(d => d.id === draftId);
  let track = 'reject';
  if (!draft) {
    draft = (q.adopt_drafts || []).find(d => d.id === draftId);
    track = 'adopt';
  }
  if (!draft) return { error: 'draft 不存在' };

  const items = track === 'adopt' ? q.adopt_items : q.reject_items;
  const item = items.find(i => i.draft_id === draftId);
  if (item) {
    item.status = action === 'dismiss' ? 'dismissed' : 'applied';
    item.resolved_at = new Date().toISOString();
  }
  draft.resolution = action === 'dismiss' ? 'dismissed' : 'approved_for_merge';
  draft.resolved_at = new Date().toISOString();
  draft.resolved_note = note || '';

  let overlay = null;
  if (action !== 'dismiss') overlay = applyDraftToOverlay(dataDir, draft, action);

  savePrecipQueue(dataDir, q);
  return { draft, item, overlay, track };
}

function getPrecipitationSummary(dataDir, ruleId) {
  const q = loadPrecipQueue(dataDir);
  const filter = (list) => (ruleId ? list.filter(i => i.rule_id === ruleId) : list);
  return {
    reject_items: filter(q.reject_items || []),
    adopt_items: filter(q.adopt_items || []),
    reject_drafts: filter(q.reject_drafts || []).slice(-10),
    adopt_drafts: filter(q.adopt_drafts || []).slice(-10),
    overlay: loadRuleOverlay(dataDir),
    thresholds: {
      reject: REJECT_THRESHOLD,
      adopt: ADOPT_THRESHOLD,
      adopt_window: ADOPT_WINDOW,
      adopt_max_rejects_in_window: ADOPT_MAX_REJECT_IN_WINDOW,
    },
    prompts: {
      reject: 'prompts/规则沉淀-驳回.md',
      adopt: 'prompts/规则沉淀-采纳.md',
    },
  };
}

module.exports = {
  REJECT_THRESHOLD,
  ADOPT_THRESHOLD,
  ADOPT_WINDOW,
  loadPrecipQueue,
  savePrecipQueue,
  loadRuleOverlay,
  applyOverlaysToRules,
  ruleChainProgress,
  processReviewFeedback,
  maybeEnqueueAndRun,
  autoRunAgent,
  resolveDraft,
  getPrecipitationSummary,
};
