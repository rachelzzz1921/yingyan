'use strict';

/**
 * 治理状态快照 —— 为 DB 迁移 / 备份准备（iter-24 T8-1 轻量版，无鉴权）
 */
const fs = require('fs');
const path = require('path');

function loadJSON(fp, fallback) {
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { return fallback; }
}

function buildGovernanceSnapshot(dataDir) {
  const ruleStates = loadJSON(path.join(dataDir, 'rule_states.json'), { states: {} });
  const overlay = loadJSON(path.join(dataDir, 'rule_patch_overlay.json'), { patches: {} });
  const review = loadJSON(path.join(dataDir, 'review_feedback.json'), { entries: [] });
  const precip = loadJSON(path.join(dataDir, 'rule_precipitation_queue.json'), {});

  const byRule = {};
  for (const e of review.entries || []) {
    const id = e.rule_id;
    if (!id) continue;
    byRule[id] = byRule[id] || { adopted: 0, rejected: 0, more: 0 };
    if (e.action === '采纳') byRule[id].adopted++;
    else if (e.action === '驳回') byRule[id].rejected++;
    else if (e.action === '补材料') byRule[id].more++;
  }

  const states = ruleStates.states || {};
  return {
    generated_at: new Date().toISOString(),
    rule_states: states,
    overlay_patches: Object.keys(overlay.patches || {}),
    review_stats: {
      total_entries: (review.entries || []).length,
      by_rule: byRule,
    },
    precipitation: {
      reject_items: (precip.reject_items || precip.items || []).length,
      adopt_items: (precip.adopt_items || []).length,
      reject_drafts: (precip.reject_drafts || precip.drafts || []).length,
      adopt_drafts: (precip.adopt_drafts || []).length,
    },
    counts: {
      shadow: Object.values(states).filter(s => s.status === 'shadow').length,
      deprecated: Object.values(states).filter(s => s.status === 'deprecated').length,
      active: Object.values(states).filter(s => !s.status || s.status === 'active').length,
    },
  };
}

function exportSnapshotToFile(dataDir, outDir) {
  const snap = buildGovernanceSnapshot(dataDir);
  fs.mkdirSync(outDir, { recursive: true });
  const name = `governance-${snap.generated_at.replace(/[:.]/g, '-').slice(0, 19)}.json`;
  const fp = path.join(outDir, name);
  fs.writeFileSync(fp, JSON.stringify(snap, null, 2), 'utf8');
  return { path: fp, snapshot: snap };
}

module.exports = { buildGovernanceSnapshot, exportSnapshotToFile };
