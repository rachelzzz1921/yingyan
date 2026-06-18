'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const QUEUE_PATH = path.join(__dirname, '../../data/eval_draft_queue.json');

function loadQueue() {
  try {
    return JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
  } catch {
    return { items: [], meta: { version: 1 } };
  }
}

function saveQueue(q) {
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(q, null, 2), 'utf8');
}

function dedupeKey(item) {
  return `${item.source || 'audit_review'}::${item.case_id}::${item.rule_id}::${(item.reject_reason || '').slice(0, 80)}`;
}

function appendEvalDraft({ case_id, rule_id, finding_id, reject_reason, gold_draft, source }) {
  const q = loadQueue();
  const item = {
    id: `ED-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`,
    case_id,
    rule_id,
    finding_id,
    reject_reason: reject_reason || '',
    gold_draft: gold_draft || { expected_status: '不输出', note: reject_reason },
    source: source || 'audit_review',
    status: 'pending',
    created_at: new Date().toISOString(),
  };
  const key = dedupeKey(item);
  const recent = q.items.find(i => dedupeKey(i) === key && i.status === 'pending');
  if (recent) return recent;
  const dayAgo = Date.now() - 86400000;
  q.items = q.items.filter(i => !(dedupeKey(i) === key && new Date(i.created_at).getTime() > dayAgo && i.status === 'pending'));
  q.items.push(item);
  saveQueue(q);
  return item;
}

function updateDraftStatus(id, status) {
  const q = loadQueue();
  const item = q.items.find(i => i.id === id);
  if (!item) return null;
  item.status = status;
  item.updated_at = new Date().toISOString();
  saveQueue(q);
  return item;
}

function confirmDraft(id, dataDir) {
  const q = loadQueue();
  const item = q.items.find(i => i.id === id);
  if (!item) return { error: 'not found' };
  const draftDir = path.join(dataDir, 'eval_drafts');
  fs.mkdirSync(draftDir, { recursive: true });
  const fp = path.join(draftDir, `${item.id}.json`);
  fs.writeFileSync(fp, JSON.stringify(item, null, 2), 'utf8');
  item.status = 'confirmed';
  item.confirmed_path = fp;
  item.updated_at = new Date().toISOString();
  saveQueue(q);
  return item;
}

module.exports = {
  QUEUE_PATH,
  loadQueue,
  appendEvalDraft,
  updateDraftStatus,
  confirmDraft,
};
