'use strict';

/**
 * 治理状态 Supabase 同步（iter-25 T8-1）
 * push: rule_states.json → governance_rule_states
 * pull: governance_rule_states → rule_states.json
 */
const fs = require('fs');
const path = require('path');
const { canUseSupabase } = require('../kb/config');
const supabase = require('../kb/supabase-client');
const { buildGovernanceSnapshot } = require('./governance-snapshot');

function loadLocalRuleStates(dataDir) {
  const fp = path.join(dataDir, 'rule_states.json');
  try {
    const d = JSON.parse(fs.readFileSync(fp, 'utf8'));
    return d.states ? d : { states: {} };
  } catch {
    return { states: {} };
  }
}

function saveLocalRuleStates(dataDir, store) {
  const fp = path.join(dataDir, 'rule_states.json');
  fs.writeFileSync(fp, JSON.stringify(store, null, 2), 'utf8');
}

function localRows(store) {
  return Object.entries(store.states || {}).map(([rule_id, s]) => ({
    rule_id,
    status: s.status || 'active',
    reason: s.reason || null,
    ack_rejects: s.ack_rejects || 0,
    history: s.history || [],
    updated_at: (s.history?.slice(-1)[0]?.ts) || new Date().toISOString(),
  }));
}

function rowsToStore(rows) {
  const states = {};
  for (const r of rows || []) {
    states[r.rule_id] = {
      status: r.status,
      reason: r.reason || '',
      ack_rejects: r.ack_rejects || 0,
      history: r.history || [],
    };
  }
  return { states };
}

async function pushToRemote(dataDir) {
  if (!canUseSupabase()) return { ok: false, reason: 'supabase_not_configured' };
  const store = loadLocalRuleStates(dataDir);
  const rows = localRows(store);
  if (!rows.length) {
    await supabase.insertGovernanceSnapshot(buildGovernanceSnapshot(dataDir), 'push_empty');
    return { ok: true, pushed: 0, message: '本地无治理条目，仅写入快照' };
  }
  const n = await supabase.upsertGovernanceStates(rows);
  const snap = buildGovernanceSnapshot(dataDir);
  await supabase.insertGovernanceSnapshot(snap, 'push');
  return { ok: true, pushed: n, snapshot_at: snap.generated_at };
}

async function pullFromRemote(dataDir) {
  if (!canUseSupabase()) return { ok: false, reason: 'supabase_not_configured' };
  const rows = await supabase.listGovernanceStates();
  const store = rowsToStore(rows);
  saveLocalRuleStates(dataDir, store);
  return { ok: true, pulled: rows.length, states: store.states };
}

async function remoteStatus() {
  if (!canUseSupabase()) return { configured: false };
  try {
    const rows = await supabase.listGovernanceStates();
    const ping = await supabase.ping();
    return {
      configured: true,
      reachable: ping.ok,
      rule_state_count: rows.length,
      kb_entries: ping.entry_count,
    };
  } catch (e) {
    return { configured: true, reachable: false, error: e.message };
  }
}

async function syncGovernance(dataDir, direction = 'push') {
  if (direction === 'pull') return pullFromRemote(dataDir);
  if (direction === 'both') {
    const push = await pushToRemote(dataDir);
    const pull = await pullFromRemote(dataDir);
    return { ok: push.ok && pull.ok, push, pull };
  }
  return pushToRemote(dataDir);
}

module.exports = {
  loadLocalRuleStates,
  saveLocalRuleStates,
  pushToRemote,
  pullFromRemote,
  remoteStatus,
  syncGovernance,
};
