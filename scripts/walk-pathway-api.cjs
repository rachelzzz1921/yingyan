#!/usr/bin/env node
'use strict';
/** API-level full pathway walk — mirrors UI fetch sequences */

const BASE = process.env.BASE || 'http://localhost:3700';
let failed = 0;

async function api(method, urlPath, body) {
  const r = await fetch(BASE + urlPath, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const ct = r.headers.get('content-type') || '';
  let json = null;
  let raw = '';
  try { raw = await r.text(); json = JSON.parse(raw); } catch { /* non-json */ }
  return { status: r.status, ok: r.ok, json, raw, ct };
}

function assert(name, cond, detail) {
  console.log(cond ? `  ✓ ${name}` : `  ✗ ${name}${detail ? ': ' + detail : ''}`);
  if (!cond) failed += 1;
}

async function main() {
  console.log('walk-pathway-api @', BASE);

  // 1. 角色工作台初始化序列 (app.js init)
  const health = await api('GET', '/api/health');
  assert('health', health.ok && health.json?.ok);
  await api('GET', '/api/rules');
  await api('GET', '/api/cases');
  await api('GET', '/api/rule-governance');
  const caseMain = await api('GET', '/api/case?id=main');
  assert('load case main', caseMain.ok && caseMain.json?.case_meta);

  // 2. 稽核 + 复核
  const audit = await api('POST', '/api/audit', { caseId: 'main' });
  assert('audit main', audit.ok && Array.isArray(audit.json?.findings), audit.raw.slice(0, 80));
  const finding = audit.json?.findings?.find((f) => f.status === '疑点' && !f.shadow);
  if (finding) {
    const review = await api('POST', '/api/review', {
      caseId: 'main', rule_id: finding.rule_id, action: '采纳',
      finding_id: finding.finding_id || finding.rule_id,
    });
    assert('review 采纳', review.ok, review.json?.error || review.raw.slice(0, 80));
  } else {
    assert('review 采纳', false, 'no active finding');
  }

  // 3. 导入中心序列
  await api('GET', '/api/intake/slots');
  await api('GET', '/api/case?id=uploaded').catch(() => ({}));

  // 4. 优先队列序列
  const rank = await api('GET', '/api/priority/rank');
  assert('priority rank', rank.ok && (rank.json?.queue?.length || 0) > 0);
  const caseId = rank.json?.queue?.[0]?.case_id || 'main';
  const detail = await api('GET', `/api/cases/${caseId}`);
  assert('case detail', detail.ok && detail.json?.case);

  const pkg = await api('POST', '/api/evidence-package', { case_id: caseId, format: 'json' });
  assert('evidence package', pkg.ok && pkg.json?.ok);

  const batch = await api('POST', '/api/audit/batch', { priority: true, top_n: 1, skip: ['uploaded'], mode: 'live' });
  assert('batch enqueue', batch.ok && batch.json?.ok, batch.json?.error);

  // 5. 看板序列 (dashboard.js overview/batch/priority/tasks)
  for (const p of ['/api/bench', '/api/yhf', '/api/tasks', '/api/maturity', '/api/kb/status']) {
    const r = await api('GET', p);
    assert(`dashboard ${p}`, r.ok && r.json != null, `status=${r.status}`);
  }
  const rank2 = await api('GET', '/api/priority/rank');
  assert('dashboard priority summary', rank2.ok);

  // 6. 院端模式
  const examAudit = await api('POST', '/api/audit?mode=exam', { caseId: 'main' });
  assert('exam mode audit', examAudit.ok, examAudit.raw.slice(0, 80));

  // 7. unknown API JSON 404
  const unknown = await api('GET', '/api/__walk_unknown__');
  assert('unknown API JSON 404', unknown.status === 404 && unknown.json?.error, unknown.raw.slice(0, 60));

  console.log(failed ? `\nFAIL (${failed})` : '\nPASS');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
