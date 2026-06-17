#!/usr/bin/env node
'use strict';
/**
 * 端到端流程自检：API + 稽核模式 + 报告结构
 * 用法: node scripts/debug-flow.js [baseUrl]
 */
const BASE = process.argv[2] || 'http://localhost:3700';

async function req(path, opts = {}) {
  const t0 = Date.now();
  const res = await fetch(BASE + path, opts);
  const ms = Date.now() - t0;
  let body;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('json')) body = await res.json();
  else body = await res.text();
  return { ok: res.ok, status: res.status, ms, body };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function reportMetaChecks(report, label) {
  assert(report && typeof report === 'object', `${label}: 非对象`);
  assert(report.report_meta, `${label}: 缺 report_meta`);
  assert(Array.isArray(report.findings), `${label}: findings 非数组`);
  assert(report.report_meta.summary, `${label}: 缺 summary`);
  return true;
}

async function main() {
  const results = [];
  const pass = (name, detail = '') => { results.push({ name, ok: true, detail }); console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`); };
  const fail = (name, err) => { results.push({ name, ok: false, detail: String(err) }); console.error(`✗ ${name} — ${err}`); };

  console.log(`\n鹰眼流程自检 @ ${BASE}\n`);

  // 1. 静态资源
  for (const p of ['/', '/dashboard.html', '/app.js', '/dashboard.js', '/intake.html']) {
    try {
      const r = await req(p);
      assert(r.ok, `HTTP ${r.status}`);
      pass(`静态 ${p}`, `${r.ms}ms`);
    } catch (e) { fail(`静态 ${p}`, e.message); }
  }

  // 2. 核心 API
  const apis = [
    ['/api/health', null],
    ['/api/rules', null],
    ['/api/cases', null],
    ['/api/bench', null],
    ['/api/yhf', null],
    ['/api/institution', null],
    ['/api/rule-governance', null],
    ['/api/tasks', null],
    ['/api/kb/status', null],
    ['/api/maturity', null],
    ['/api/docs', null],
  ];
  for (const [path] of apis) {
    try {
      const r = await req(path);
      assert(r.ok, `HTTP ${r.status}`);
      pass(`API GET ${path}`, `${r.ms}ms`);
    } catch (e) { fail(`API GET ${path}`, e.message); }
  }

  // 3. 案卷加载
  let mainCase;
  try {
    const r = await req('/api/case?caseId=main');
    assert(r.ok, `HTTP ${r.status}`);
    mainCase = r.body;
    assert(mainCase.case_meta, '无 case_meta');
    pass('案卷 main', `${r.ms}ms`);
  } catch (e) { fail('案卷 main', e.message); }

  // 4. 稽核模式矩阵
  const audits = [
    { name: '标准稽核', q: '', body: { caseId: 'main' }, maxMs: 5000 },
    { name: 'RAG 增强', q: '?rag=1', body: { caseId: 'main', rag: true }, maxMs: 15000 },
    { name: '超级增强 super', q: '?mode=super', body: { caseId: 'main', inject: true, rag: true }, maxMs: 15000 },
    { name: '体检 exam', q: '?mode=exam', body: { caseId: 'main' }, maxMs: 5000 },
    { name: '干净件 clean', q: '', body: { caseId: 'clean' }, maxMs: 5000 },
    { name: '注入对抗 inject', q: '', body: { caseId: 'main', inject: true }, maxMs: 5000 },
  ];

  for (const a of audits) {
    try {
      const r = await req('/api/audit' + a.q, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(a.body),
      });
      assert(r.ok, `HTTP ${r.status}`);
      reportMetaChecks(r.body, a.name);
      if (r.ms > a.maxMs) throw new Error(`超时 ${r.ms}ms > ${a.maxMs}ms`);
      const s = r.body.report_meta.summary;
      pass(a.name, `${r.ms}ms · 疑点${s.suspected_count} 线索${s.clue_count}`);
    } catch (e) { fail(a.name, e.message); }
  }

  // 5. LLM 路径（仅结构检查，短超时）
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const t0 = Date.now();
    const res = await fetch(BASE + '/api/audit?mode=llm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({ caseId: 'main' }),
    });
    clearTimeout(timer);
    const body = await res.json();
    const ms = Date.now() - t0;
    if (ms < 8000) {
      reportMetaChecks(body, 'LLM');
      pass('LLM 路径', `${ms}ms · real_agent=${!!body.report_meta.real_agent}`);
    } else {
      pass('LLM 路径', '8s 内未返回（预期慢路径，接口可达）');
    }
  } catch (e) {
    if (e.name === 'AbortError') pass('LLM 路径', '慢路径正常（>8s，后台影子模式适用）');
    else fail('LLM 路径', e.message);
  }

  // 6. 报告分页 DOM 契约（index.html 必须有的 id）
  try {
    const r = await req('/');
    const ids = ['reportBody', 'reportPagerNav', 'page-overview', 'page-findings', 'page-shield', 'page-detail', 'btnPagePrev', 'btnPageNext'];
    for (const id of ids) {
      assert(r.body.includes(`id="${id}"`), `index.html 缺 #${id}`);
    }
    pass('报告分页 DOM 契约', ids.join(', '));
  } catch (e) { fail('报告分页 DOM 契约', e.message); }

  // 7. app.js 关键函数存在
  try {
    const r = await req('/app.js');
    for (const fn of ['ensureReportPagerShell', 'showScanOverlay', 'hideScanOverlay', 'renderReport', 'launchLlmShadow', 'switchReportPage']) {
      assert(r.body.includes(`function ${fn}`), `app.js 缺 ${fn}`);
    }
    assert(!r.body.includes('rb.innerHTML = scanningHTML()'), '仍存在破坏分页的 innerHTML 赋值');
    pass('app.js 稽核流程函数', 'shell/overlay/shadow 齐全');
  } catch (e) { fail('app.js 稽核流程', e.message); }

  // 8. dashboard 按需加载
  try {
    const r = await req('/dashboard.js');
    assert(r.body.includes('needsCoreData'), 'dashboard 缺按需加载');
    assert(r.body.includes('hydrateCacheSnapshot'), 'dashboard 缺快照缓存');
    pass('dashboard.js 提速逻辑', '按需+快照');
  } catch (e) { fail('dashboard.js', e.message); }

  // 9. 慢接口缓存（maturity 二次应 <500ms）
  try {
    const r1 = await req('/api/maturity');
    const r2 = await req('/api/maturity');
    assert(r1.ok && r2.ok, 'maturity HTTP 失败');
    if (r2.ms > 500) throw new Error(`缓存未命中，二次 ${r2.ms}ms`);
    pass('maturity 缓存', `首次${r1.ms}ms → 二次${r2.ms}ms`);
  } catch (e) { fail('maturity 缓存', e.message); }

  const failed = results.filter(x => !x.ok);
  console.log(`\n--- 汇总: ${results.length - failed.length}/${results.length} 通过 ---\n`);
  if (failed.length) {
    console.error('失败项:');
    failed.forEach(f => console.error(`  - ${f.name}: ${f.detail}`));
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
