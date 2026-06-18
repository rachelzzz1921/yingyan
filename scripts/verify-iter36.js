#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(buf) }); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function main() {
  const { maybeEvalDraftFromDebate } = require(path.resolve(__dirname, '../prototype/app/engine/review-debate.js'));
  const evalDraft = require(path.resolve(__dirname, '../prototype/app/engine/eval-draft-service.js'));
  const priorityService = require(path.resolve(__dirname, '../prototype/app/engine/priority-service.js'));
  const priorityStore = require(path.resolve(__dirname, '../prototype/app/engine/priority-store.js'));
  const { loadRegistry } = require(path.resolve(__dirname, '../prototype/app/engine/case-id.js'));
  const { loadJsonKB } = require(path.resolve(__dirname, '../prototype/app/kb/retrieval.js'));
  const { runAudit } = require(path.resolve(__dirname, '../prototype/app/engine/audit-engine.js'));

  const drafts = [];
  const mockAppend = (item) => { drafts.push(item); return { ...item, id: 'ED-test' }; };

  const down = maybeEvalDraftFromDebate({
    caseId: 'edge_egfr',
    finding: { finding_id: 'F-x', rule_id: 'T-201', status: '疑点' },
    debate: { verdict: '降级线索', verdict_reason: '病理未闭环' },
  }, mockAppend);
  if (!down || down.gold_draft?.expected_status !== '线索' || down.source !== 'p5_debate') {
    console.error('❌ maybeEvalDraftFromDebate 降级', down);
    process.exit(1);
  }

  const revoke = maybeEvalDraftFromDebate({
    caseId: 'main',
    finding: { finding_id: 'F-y', rule_id: 'T-201', status: '疑点' },
    debate: { verdict: '撤销', verdict_reason: '证据不足' },
  }, mockAppend);
  if (!revoke || revoke.gold_draft?.expected_status !== '不输出') {
    console.error('❌ maybeEvalDraftFromDebate 撤销', revoke);
    process.exit(1);
  }

  const noop = maybeEvalDraftFromDebate({
    caseId: 'main',
    finding: { finding_id: 'F-z', rule_id: 'T-201', status: '疑点' },
    debate: { verdict: '维持疑点', verdict_reason: 'ok' },
  }, mockAppend);
  if (noop != null) {
    console.error('❌ maybeEvalDraftFromDebate 应跳过维持疑点', noop);
    process.exit(1);
  }
  console.log('✅ maybeEvalDraftFromDebate PASS');

  const tmpQueue = path.join(__dirname, '../prototype/data/eval_draft_queue.json.bak-verify36');
  const queuePath = evalDraft.QUEUE_PATH;
  let restored = false;
  if (fs.existsSync(queuePath)) {
    fs.copyFileSync(queuePath, tmpQueue);
    restored = true;
  }
  const item = evalDraft.appendEvalDraft({
    case_id: 'clean',
    rule_id: 'T-test',
    finding_id: 'F-test',
    reject_reason: 'verify36',
    gold_draft: { expected_status: '不输出' },
    source: 'p5_debate',
  });
  if (item.source !== 'p5_debate') {
    console.error('❌ appendEvalDraft source', item);
    process.exit(1);
  }
  if (restored) {
    fs.copyFileSync(tmpQueue, queuePath);
    fs.unlinkSync(tmpQueue);
  } else if (fs.existsSync(queuePath)) {
    const q = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
    q.items = (q.items || []).filter(i => i.reject_reason !== 'verify36');
    fs.writeFileSync(queuePath, JSON.stringify(q, null, 2));
  }
  console.log('✅ eval-draft source PASS');

  const DATA = path.resolve(__dirname, '../prototype/data');
  const rules = JSON.parse(fs.readFileSync(path.join(DATA, 'rules/rules.json'), 'utf8')).rules;
  const maps = loadJsonKB(DATA);
  const reg = loadRegistry();
  const casesMap = {};
  for (const e of reg.entries || []) {
    const folder = e.api_id === 'main' ? 'case_NSCLC' : `case_${e.api_id}`;
    const recPath = path.join(DATA, folder, 'medical_record.json');
    if (fs.existsSync(recPath)) casesMap[e.api_id] = JSON.parse(fs.readFileSync(recPath, 'utf8'));
  }
  const store = priorityStore.loadStore();
  const rank = await priorityService.buildRankQueue(store, casesMap, (rec) => runAudit(rec, rules, {
    policyTexts: maps.policyTexts,
    policyVerified: maps.policyVerified,
    shadowRules: [],
    retiredRules: [],
  }), { refresh: false });

  const boundaryIds = new Set((reg.entries || []).filter(e => e.bench_tier === 'boundary').map(e => e.api_id));
  const bucketIds = new Set((rank.boundary_bucket || []).map(r => r.case_id));
  if (!Array.isArray(rank.boundary_bucket)) {
    console.error('❌ rank 缺 boundary_bucket');
    process.exit(1);
  }
  for (const id of bucketIds) {
    if (!boundaryIds.has(id)) {
      console.error('❌ boundary_bucket 含非 boundary 案卷', id);
      process.exit(1);
    }
  }
  if (rank.boundary_bucket.length < 9) {
    console.error('❌ boundary_bucket 过少', rank.boundary_bucket.length);
    process.exit(1);
  }
  console.log(`✅ priority boundary_bucket PASS — ${rank.boundary_bucket.length} 案`);

  const base = process.env.VERIFY_BASE || 'http://localhost:3700';
  try {
    const rankHttp = await get(`${base}/api/priority/rank`);
    if (rankHttp.status !== 200 || !Array.isArray(rankHttp.data.boundary_bucket)) {
      console.error('❌ /api/priority/rank boundary_bucket', rankHttp.status);
      process.exit(1);
    }
    const review = await get(`${base}/api/review`);
    const hasDebateShape = (review.data.entries || []).some(e => e.action === '控辩裁' && e.source === 'p5_debate')
      || fs.readFileSync(path.resolve(__dirname, '../prototype/app/public/app.js'), 'utf8').includes('renderDebateHistory');
    if (!hasDebateShape) {
      console.error('❌ debate history UX 未就绪');
      process.exit(1);
    }
    console.log(`✅ HTTP rank boundary PASS — API ${rankHttp.data.boundary_count ?? rankHttp.data.boundary_bucket.length} 边界桶`);
  } catch (e) {
    console.log(`⏭ HTTP 探针跳过: ${e.message}`);
  }
}

main().catch((e) => {
  console.error('❌ verify-iter36:', e.message);
  process.exit(1);
});
