'use strict';

/* 鹰眼 · 项目看板 SPA — 所有子页在看板内打开，无复制路径 */

const NAV = [
  { id: 'overview', icon: '📊', label: '总览', group: '监控' },
  { id: 'bench', icon: '🧪', label: 'AuditBench', group: '监控' },
  { id: 'batch', icon: '📦', label: '批量初筛', group: '监控' },
  { id: 'yhf', icon: '🔒', label: 'YHF 门禁', group: '监控' },
  { id: 'shadow', icon: '🔬', label: '规则准入', group: '监控' },
  { id: 'roadmap', icon: '🗺', label: '迭代路线', group: '规划', doc: 'roadmap' },
  { id: 'tasks', icon: '📋', label: '任务台账', group: '规划' },
  { id: 'priority', icon: '🎯', label: '稽核队列', group: '业务' },
  { id: 'institution', icon: '🏥', label: '机构画像', group: '业务' },
  { id: 'governance', icon: '🗂', label: '规则治理', group: '业务' },
  { id: 'brand', icon: '🎨', label: '品牌规范', group: '设计' },
  { id: 'arch', icon: '🏗', label: '架构蓝图', group: '设计', doc: 'arch' },
  { id: 'yhf_readme', icon: '📐', label: 'Harness 说明', group: '工程', doc: 'yhf_readme' },
  { id: 'gate_report', icon: '📄', label: 'Gate 报告', group: '工程', doc: 'gate_report' },
  { id: 'eval', icon: '📝', label: 'Prompt 评测', group: '工程' },
  { id: 'three_review', icon: '⚖', label: '三审演示', group: '工程' },
  { id: 'open_issues', icon: '⚠', label: 'Open Issues', group: '工程', doc: 'open_issues' },
  { id: 'docs', icon: '📚', label: '文档中心', group: '文档' },
  { id: 'master', icon: '📖', label: '项目主文档', group: '文档', doc: 'master' },
  { id: 'pitch', icon: '🎤', label: 'Pitch 文案', group: '文档', doc: 'pitch' },
  { id: 'rules_v01', icon: '📜', label: '规则库雏形', group: '文档', doc: 'rules_v01' },
];

const ROADMAP_TASKS = {
  'Phase 4 · iter-21（下一迭代）': [
    { id: 'T4-1', text: '同步 main 案卷 expected_findings（5→6）', pri: 'P0' },
    { id: 'T4-2', text: '核心 10 规则补 test_cases 6 条', pri: 'P0' },
    { id: 'T4-3', text: 'L4 shadow → 治理页 shadow_metrics', pri: 'P1' },
    { id: 'T4-4', text: 'L1 接 eval baseline / G2 报告', pri: 'P1' },
    { id: 'T4-5', text: 'AuditBench 扩至 20 案卷', pri: 'P1' },
    { id: 'T4-6', text: 'yhf gate CI 接入', pri: 'P2' },
  ],
  'Phase 5 · iter-22': [
    { id: 'T5-1', text: 'LLM 路径接 shadow (B07c)', pri: 'P0' },
    { id: 'T5-2', text: 'deprecated 规则 routing 显下线', pri: 'P1' },
    { id: 'T5-3', text: '三审 Agent prompt 模板 demo', pri: 'P1' },
  ],
  'Phase 6–8': [
    { id: 'T6-1', text: '真 OCR → anchor.bbox', pri: 'P1' },
    { id: 'T6-2', text: '江苏价格目录导入 KB1', pri: 'P1' },
    { id: 'T7-1', text: '批量队列 + 进度条', pri: 'P1' },
    { id: 'T8-1', text: '治理落盘 → DB + 鉴权', pri: 'P2' },
  ],
};

const PHASES = [
  { id: 'P1', name: 'YHF', status: 'done' }, { id: 'P2', name: '品牌', status: 'done' },
  { id: 'P3', name: 'UI', status: 'done' },   { id: 'P4', name: '评测闭环', status: 'done' }, { id: 'P5', name: '治理语义', status: 'done' },
  { id: 'P6', name: '输入专科', status: 'done' }, { id: 'P7', name: '批量', status: 'done' }, { id: 'P8', name: '生产', status: 'done' },
];

const DOC_LINKS = {
  'docs/ROADMAP.md': 'roadmap', 'yhf/README.md': 'yhf_readme', 'prototype/docs/TASKS.md': 'tasks',
  'docs/07-架构升级蓝图.md': 'arch', 'docs/00-项目主文档.md': 'master', 'eval/README.md': 'eval',
  'assets/brand/DESIGN.md': 'brand', 'assets/brand/DESIGN-v2-gpt.md': 'brand_v2', 'assets/brand/APPLICATION.md': 'brand_apply',
  'prompts/品牌元素生成.md': 'brand_prompt',
  'docs/06-Pitch文案.md': 'pitch', 'eval/OPEN_ISSUES.md': 'open_issues',
  '../yhf/README.md': 'yhf_readme', '../docs/ROADMAP.md': 'roadmap',
};

let cache = {};
let currentView = 'overview';
let docFullMode = {};
let loadDataPromise = null;
const DASH_CACHE_KEY = 'yingyan_dashboard_cache_v1';

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/** 调用 dash-bridges.json 注册的跨脚本 API（tasks-board 等） */
function dashCall(name, ...args) {
  const registries = [window.DashTasks, window.PriorityUX];
  for (const reg of registries) {
    const fn = reg?.[name];
    if (typeof fn === 'function') return fn(...args);
  }
  throw new Error(
    `看板模块「${name}」未加载 — 请硬刷新；若仍失败请运行 node scripts/verify-dashboard-frontend.js`,
  );
}

async function fetchJSON(url, timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let r;
  try {
    r = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!r.ok) throw new Error(r.status + ' ' + url);
  return r.json();
}

function saveCacheSnapshot() {
  try {
    const snapshot = {
      bench: cache.bench,
      yhf: cache.yhf,
      health: cache.health,
      inst: cache.inst,
      gov: cache.gov,
      tasks: cache.tasks,
      kb: cache.kb,
      maturity: cache.maturity,
      at: cache.at instanceof Date ? cache.at.toISOString() : new Date().toISOString(),
      _coreLoaded: !!cache._coreLoaded,
    };
    sessionStorage.setItem(DASH_CACHE_KEY, JSON.stringify(snapshot));
  } catch (_) {}
}

function hydrateCacheSnapshot() {
  try {
    const raw = sessionStorage.getItem(DASH_CACHE_KEY);
    if (!raw) return;
    const snapshot = JSON.parse(raw);
    if (!snapshot || !snapshot._coreLoaded) return;
    cache = {
      bench: snapshot.bench,
      yhf: snapshot.yhf,
      health: snapshot.health,
      inst: snapshot.inst,
      gov: snapshot.gov,
      tasks: snapshot.tasks,
      kb: snapshot.kb,
      maturity: snapshot.maturity,
      at: new Date(snapshot.at || Date.now()),
      _coreLoaded: true,
    };
  } catch (_) {}
}

function mdToHtml(src) {
  if (!src) return '';
  let h = esc(src);
  h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  h = h.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  h = h.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\*(.+?)\*/g, '<em>$1</em>');
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  h = h.replace(/^---$/gm, '<hr>');
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => {
    if (u.startsWith('http') || u.startsWith('/')) return `<a href="${u}" target="_blank" rel="noopener">${t}</a>`;
    const clean = u.replace(/^\.\.\//, '').replace(/^\.\//, '');
    const viewId = DOC_LINKS[clean] || DOC_LINKS[u.replace(/^#/, '')];
    if (viewId) return `<a href="#${viewId}" class="md-nav" data-goto="${viewId}">${t}</a>`;
    if (u.startsWith('#')) return `<a href="${u}">${t}</a>`;
    return `<span class="md-plain">${t}</span>`;
  });
  const lines = h.split('\n');
  let out = [], inPre = false, inUl = false, inOl = false, inTable = false, rows = [];
  const flushTable = () => {
    if (!rows.length) return;
    let t = '<table><thead><tr>' + rows[0].map(c => `<th>${c.trim()}</th>`).join('') + '</tr></thead><tbody>';
    for (let i = 2; i < rows.length; i++) {
      const cells = rows[i].map((c, j) => {
        let v = c.trim();
        let k = i - 1;
        while (v === '同上' && k >= 2) {
          v = (rows[k][j] || '').trim();
          k -= 1;
        }
        return v;
      });
      t += '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
    }
    t += '</tbody></table>';
    out.push(t); rows = []; inTable = false;
  };
  for (const line of lines) {
    if (line.startsWith('```')) { inPre = !inPre; out.push(inPre ? '<pre><code>' : '</code></pre>'); continue; }
    if (inPre) { out.push(line); continue; }
    if (/^\|/.test(line)) {
      if (!inTable) { if (inUl) { out.push('</ul>'); inUl = false; } if (inOl) { out.push('</ol>'); inOl = false; } inTable = true; }
      if (!/^\|[\s\-:|]+\|$/.test(line)) rows.push(line.split('|').slice(1, -1));
      continue;
    } else if (inTable) flushTable();
    if (/^[\-\*] /.test(line)) {
      if (!inUl) { out.push('<ul>'); inUl = true; }
      out.push('<li>' + line.slice(2) + '</li>');
      continue;
    } else if (inUl) { out.push('</ul>'); inUl = false; }
    if (/^\d+\. /.test(line)) {
      if (!inOl) { out.push('<ol>'); inOl = true; }
      out.push('<li>' + line.replace(/^\d+\. /, '') + '</li>');
      continue;
    } else if (inOl) { out.push('</ol>'); inOl = false; }
    if (line.startsWith('<h') || line.startsWith('<hr') || line.startsWith('<blockquote')) { out.push(line); continue; }
    if (line.trim()) out.push('<p>' + line + '</p>');
  }
  if (inUl) out.push('</ul>');
  if (inOl) out.push('</ol>');
  if (inTable) flushTable();
  return out.join('\n');
}

function ringSVG(pct, color) {
  const r = 36, c = 2 * Math.PI * r, off = c * (1 - Math.min(1, pct));
  return `<svg width="88" height="88" viewBox="0 0 88 88"><circle cx="44" cy="44" r="${r}" fill="none" stroke="#eef2f6" stroke-width="8"/>
    <circle cx="44" cy="44" r="${r}" fill="none" stroke="${color}" stroke-width="8" stroke-dasharray="${c}" stroke-dashoffset="${off}" stroke-linecap="round"/>
    <text x="44" y="48" text-anchor="middle" font-family="DM Sans,sans-serif" font-size="16" font-weight="800" fill="#0B2A4A">${Math.round(pct * 100)}%</text></svg>`;
}

function renderSideNav() {
  const groups = [...new Set(NAV.map(n => n.group))];
  let html = '';
  for (const g of groups) {
    html += `<div class="nav-group">${esc(g)}</div>`;
    html += NAV.filter(n => n.group === g).map(n =>
      `<a href="#${n.id}" data-view="${n.id}" class="${n.id === currentView ? 'active' : ''}"><span class="ico">${n.icon}</span>${esc(n.label)}</a>`
    ).join('');
  }
  document.getElementById('sideNav').innerHTML = html;
  document.querySelectorAll('#sideNav a[data-view]').forEach(a => {
    a.onclick = (e) => { e.preventDefault(); navigate(a.dataset.view); };
  });
}

let pendingBrandTab = null;

function navigate(id) {
  if (id === 'brand_v2' || id === 'brand_apply' || id === 'brand_prompt') {
    pendingBrandTab = id;
    id = 'brand';
  }
  currentView = id;
  const item = NAV.find(n => n.id === id);
  document.getElementById('viewTitle').textContent = item ? item.label : id;
  document.title = `鹰眼看板 · ${item?.label || id}`;
  renderSideNav();
  renderView(id);
  history.replaceState(null, '', `#${id}`);
}

function fallbackCoreData() {
  return {
    bench: { cases: [], meta: { total_cases: 0, clean_false_positive_total: 0, avg_latency_ms: 0, red_line_clean_zero_fp: null } },
    yhf: { _fetchFailed: true, overall_pass: null, generated: Date.now(), engine: { gates: {}, cases: [], meta: { total_cases: 0, avg_latency_ms: 0, clean_false_positive_total: null } }, shadow: null, prompt: null, rule: { missing_test_cases: 0, total_rules: 0, core_rules: [] } },
    health: { rules: 0, rules_count: 0, llm_ready: false, llm_provider: '' },
    inst: { hospital: '机构画像', summary: { audited_cases: 0, suspected_total: 0, amount_total: 0, clean_pass: 0 }, top_rules: [] },
    gov: { model: 'local', summary: { total_rules: 0, shadow: 0, deprecated: 0 }, entries: [] },
    tasks: { tasks: [], summary: {}, meta: {} },
    kb: null,
    maturity: null,
  };
}

function resolveG0(d) {
  const yhfG0 = d.yhf?.engine?.gates?.G0_clean_zero_fp;
  if (yhfG0 === true || yhfG0 === false) return yhfG0;
  const benchG0 = d.bench?.meta?.red_line_clean_zero_fp;
  if (benchG0 === true || benchG0 === false) return benchG0;
  return null;
}

async function loadData(force = false) {
  if (loadDataPromise && !force) return loadDataPromise;
  const run = (async () => {
  const fallback = fallbackCoreData();
  const settled = await Promise.allSettled([
    fetchJSON('/api/bench', 8000),
    fetchJSON('/api/yhf', 20000),
    fetchJSON('/api/health', 2500),
    fetchJSON('/api/institution', 3000),
    fetchJSON('/api/rule-governance', 3000),
    fetchJSON('/api/tasks', 2500),
    fetchJSON('/api/kb/status', 2500),
    fetchJSON('/api/maturity', 2500),
  ]);
  const [bench, yhf, health, inst, gov, tasks, kb, maturity] = settled.map((r, i) => {
    const keyOrder = ['bench', 'yhf', 'health', 'inst', 'gov', 'tasks', 'kb', 'maturity'];
    const key = keyOrder[i];
    if (r.status === 'fulfilled') return r.value;
    const fb = fallback[key];
    if (key === 'yhf' && fb) fb._fetchFailed = true;
    return fb;
  });
  cache = { bench, yhf, health, inst, gov, tasks, kb, maturity, at: new Date(), _coreLoaded: true };
  saveCacheSnapshot();
  return cache;
  })();
  loadDataPromise = run.finally(() => { loadDataPromise = null; });
  return loadDataPromise;
}

function warmCoreDataInBackground() {
  if (cache._coreLoaded || loadDataPromise) return;
  loadData().then(() => {
    if (document.getElementById('dashContent')) renderView(currentView);
  }).catch(() => {});
}

function maturitySectionHTML(m) {
  if (!m) return '';
  const pct = Math.round((m.gold_ratio || 0) * 100);
  const g1 = m.g1 ? 'PASS' : 'FAIL';
  const g2label = m.g2 == null ? '—' : (m.g2 ? 'PASS' : 'report');
  const g2rate = m.g2_pass_rate != null ? `${Math.round(m.g2_pass_rate * 100)}%` : '无缓存';
  const l1 = m.l1_sidecar ? `L1✓ ${m.l1_sidecar}` : 'L1—';
  const themes = (m.giac_themes || []).join(' · ');
  return `<section class="card"><div class="card-head"><h2 class="section-title">工程成熟度 · GIAC 对齐</h2><span class="badge-live">/api/maturity</span></div>
    <div class="kpi-grid kpi-compact" style="margin-bottom:10px">
      ${kpiCard('G0 零误报', m.g0 ? 'PASS' : 'FAIL', m.g0 ? 'pass' : 'fail', '干净件红线')}
      ${kpiCard('G4 RAG', m.g4 ? 'PASS' : 'FAIL', m.g4 ? 'pass' : 'fail', 'recall@8')}
      ${kpiCard('G1 Shadow', g1, m.g1 ? 'pass' : 'fail', `${m.shadow_summary?.passed ?? '—'}/${m.shadow_summary?.total ?? '—'} 规则`)}
      ${kpiCard('G2 Prompt', g2label, m.g2 ? 'pass' : '', `eval ${g2rate}`)}
      ${kpiCard('L1 解析', l1, m.l1_sidecar ? 'pass' : '', 'ppstructure sidecar')}
      ${kpiCard('Bench 案卷', m.bench_cases ?? '—', 'accent', 'AuditBench 20')}
      ${kpiCard('Gold 覆盖', pct + '%', pct >= 90 ? 'pass' : '', `${m.registry?.total ?? '—'} 注册`)}
    </div>
    <p class="muted" style="margin:0;font-size:12px">GIAC 主题：${esc(themes)}${m.g2_source ? ` · G2 源：${esc(m.g2_source)}` : ''}</p></section>`;
}

async function loadDoc(id, full) {
  const useFull = full ?? docFullMode[id];
  const key = 'doc_' + id + (useFull ? '_full' : '');
  if (!cache[key]) {
    cache[key] = await fetchJSON('/api/docs/' + id + (useFull ? '?full=1' : ''));
  }
  return cache[key];
}

async function loadDocCatalog() {
  if (!cache.docList) cache.docList = await fetchJSON('/api/docs');
  return cache.docList;
}

function gateReportLiveHTML(yhf) {
  const e = yhf.engine;
  const rows = (e?.cases || []).map(c =>
    `<tr><td>${esc(c.case_id)}</td><td class="num">${c.found_suspected}</td><td>${c.is_clean ? '🟢' : '🔴'}</td><td>${c.pass ? '✓' : esc((c.failures || []).join('; '))}</td></tr>`
  ).join('');
  return `
    <div class="doc-toolbar"><h2 style="margin:0">Gate 报告 · 实时生成</h2><span class="badge-live">由 /api/yhf 动态渲染</span></div>
    <article class="card">
      <p><strong>整体</strong>：${yhf.overall_pass ? '✅ PASS' : '❌ FAIL'} · 模式 Oracle · ${new Date(yhf.generated || Date.now()).toLocaleString('zh-CN')}</p>
      <p><strong>G0</strong>：${e?.gates?.G0_clean_zero_fp ? '✅ 干净件零误报' : '❌ 失败'} · 误报合计 ${e?.meta?.clean_false_positive_total ?? 0}</p>
      <p><strong>案卷</strong>：${e?.meta?.total_cases ?? 0} · 均时延 ${e?.meta?.avg_latency_ms ?? 0}ms</p>
    </article>
    <article class="card" style="padding:0;overflow:auto"><table class="bench-table"><thead><tr><th>案卷</th><th class="num">疑点</th><th>类型</th><th>结果</th></tr></thead><tbody>${rows}</tbody></table></article>
    <div class="action-row">
      <button class="action-btn secondary" type="button" onclick="navigate('yhf')">🔒 YHF 详情</button>
      <button class="action-btn secondary" type="button" onclick="navigate('bench')">🧪 AuditBench</button>
    </div>`;
}

function evalViewHTML(evalReadme, evalStatus, g2) {
  const g2pass = g2?.gates?.G2_prompt_pass;
  const rate = g2?.pass_rate != null ? `${Math.round(g2.pass_rate * 100)}%` : '—';
  const rows = (g2?.cases || []).slice(0, 12).map(c =>
    `<tr><td>${esc(c.id || c.case_id || '—')}</td><td>${c.pass ? '✅' : '❌'}</td><td class="muted">${esc((c.failures || []).join('; ') || '—')}</td></tr>`
  ).join('');
  return `
    <div class="doc-toolbar"><h2 style="margin:0">Prompt 评测台</h2><span class="badge-live">47 用例 · eval/</span></div>
    <div class="kpi-grid" style="margin-bottom:16px">
      ${kpiCard('G2 Prompt', g2pass == null ? '—' : (g2pass ? 'PASS' : 'FAIL'), g2pass ? 'pass' : (g2pass === false ? 'fail' : ''), rate)}
      ${kpiCard('最新结果', evalStatus?.latest?.file?.replace('.json', '') || '未跑', evalStatus?.latest ? 'accent' : 'warn', evalStatus?.latest?.mtime?.slice(0, 16) || '请运行 run_v7.sh')}
      ${kpiCard('Open Issues', evalStatus?.open_issues ? '有文档' : '—', '', '看板内可读')}
      ${kpiCard('G2 数据源', g2?.source || '—', '', g2?.message || '')}
    </div>
    ${g2 ? `<article class="card" style="padding:0;overflow:auto;max-height:280px;margin-bottom:16px">
      <div style="padding:12px 16px"><h3 class="section-title" style="margin:0">G2 报告 · L1 Prompt Harness</h3>
      <p class="muted" style="margin:4px 0 0;font-size:11px">${esc(g2.message || '')}</p></div>
      <table class="bench-table"><thead><tr><th>用例</th><th>结果</th><th>说明</th></tr></thead><tbody>${rows || '<tr><td colspan="3" class="muted">无明细</td></tr>'}</tbody></table>
    </article>` : ''}
    <article class="card md-body">${mdToHtml(evalReadme?.content || '')}</article>
    <div class="action-row">
      <button class="action-btn secondary" type="button" onclick="navigate('open_issues')">⚠ Open Issues</button>
      <button class="action-btn secondary" type="button" onclick="navigate('three_review')">⚖ 三审 Agent 演示</button>
      <button class="action-btn secondary" type="button" onclick="navigate('yhf_readme')">📐 Harness 说明</button>
    </div>`;
}

function shadowViewHTML(data) {
  const maxFpr = Math.round((data.max_fpr ?? 0.10) * 100);
  const sum = data.summary || {};
  const rules = data.rules || [];
  const rows = rules.map((r) => {
    const m = r.shadow_metrics || {};
    const fprPct = m.false_positive_rate != null ? `${Math.round(m.false_positive_rate * 100)}%` : '—';
    const precPct = m.precision != null ? `${Math.round(m.precision * 100)}%` : '—';
    const fprOk = m.false_positive_rate != null ? m.false_positive_rate <= (data.max_fpr ?? 0.10) : null;
    const passCell = r.skipped ? '<span class="muted">无 gold</span>' : (r.pass ? '✅ 达标' : '❌ 超标');
    const govLabel = { active: '在役', shadow: '观察期', deprecated: '已下线' }[r.governance_status] || r.governance_status;
    const govCls = r.governance_status === 'shadow' ? 'warn' : (r.governance_status === 'deprecated' ? 'fail' : 'pass');
    return `<tr>
      <td><b>${esc(r.rule_id)}</b><div class="muted" style="font-size:11px">${esc(r.rule_name || '')}</div></td>
      <td><span class="badge-${govCls}">${esc(govLabel)}</span>${r.governance_reason ? `<div class="muted" style="font-size:10px">${esc(r.governance_reason)}</div>` : ''}</td>
      <td class="num">${m.true_positive ?? '—'}</td>
      <td class="num">${m.false_positive ?? '—'}</td>
      <td class="num">${precPct}</td>
      <td class="num ${fprOk === false ? 'fail-text' : ''}">${fprPct}</td>
      <td>${passCell}</td>
    </tr>`;
  }).join('');
  const shadowGov = (data.governance?.shadow || []);
  const govCards = shadowGov.length ? shadowGov.map(e =>
    `<div class="gov-card"><div class="rid">${esc(e.rule_id)} · ${esc(e.rule_name || '')}</div>
    <div class="meta">观察期 · ${esc(e.reason || '待复审')}</div></div>`
  ).join('') : '<p class="muted">当前无规则处于观察期（全部在役或已下线）</p>';
  return `
    <div class="doc-toolbar">
      <h2 style="margin:0">规则准入 · 观察期三验</h2>
      <span class="badge-live">L4 Harness · FPR≤${maxFpr}%</span>
      <span class="redline ${data.pass ? 'pass' : 'fail'}">${data.pass ? '✓ G1 PASS' : '✗ G1 FAIL'}</span>
    </div>
    <p class="muted" style="margin:0 0 14px;font-size:12px">${esc(data.description || '')}</p>
    <div class="kpi-grid kpi-compact" style="margin-bottom:16px">
      ${kpiCard('核心规则', rules.length, 'accent', 'gate.config core_rules')}
      ${kpiCard('准入通过', sum.passed ?? '—', 'pass', `失败 ${sum.failed ?? 0}`)}
      ${kpiCard('跳过', sum.skipped ?? '—', '', '无 gold 覆盖')}
      ${kpiCard('观察期', shadowGov.length, 'warn', '治理状态 shadow')}
    </div>
    <article class="card" style="padding:0;overflow:auto;margin-bottom:16px">
      <div style="padding:12px 16px"><h3 class="section-title" style="margin:0">核心规则 · 误报率三验（TP/FP/Precision/FPR）</h3></div>
      <table class="bench-table shadow-metrics-table">
        <thead><tr><th>规则</th><th>治理状态</th><th class="num">TP</th><th class="num">FP</th><th class="num">Precision</th><th class="num">FPR</th><th>准入</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </article>
    <section class="card"><h3 class="section-title" style="margin:0 0 10px">观察期规则清单</h3><div class="gov-list">${govCards}</div></section>
    <div class="action-row">
      <button class="action-btn secondary" type="button" data-goto="governance">🗂 规则治理</button>
      <button class="action-btn secondary" type="button" data-goto="yhf">🔒 YHF 门禁</button>
      <a class="action-btn" href="/">🛡 工作台复核</a>
    </div>`;
}

function threeReviewViewHTML(demo) {
  const rounds = (demo.rounds || []).map(r => `
    <article class="card three-review-round">
      <h3 style="margin:0 0 8px">${esc(r.label)} <span class="badge">${esc(r.role)}</span></h3>
      <p style="margin:0;line-height:1.6">${esc(r.output)}</p>
      ${r.verdict ? `<p class="muted" style="margin:8px 0 0"><b>裁决</b>：${esc(r.verdict)} → ${esc(r.final_status || '')}</p>` : ''}
    </article>`).join('');
  return `
    <div class="doc-toolbar"><h2 style="margin:0">三审 Agent 模板演示</h2>
      <span class="badge-live">${esc(demo.template || '')}</span>
      ${demo.p5_judge ? `<span class="badge teal">${esc(demo.p5_judge)}</span>` : ''}</div>
    <p class="muted" style="margin:0 0 14px">样例疑点：<b>${esc(demo.sample_finding?.rule_id)}</b> ${esc(demo.sample_finding?.rule_name || '')}</p>
    ${demo.p5_excerpt ? `<article class="card md-body" style="margin-bottom:14px;font-size:11px"><h4 style="margin:0 0 8px">P5 裁判 prompt（节选）</h4>${mdToHtml(demo.p5_excerpt)}</article>` : ''}
    ${demo.template_excerpt ? `<article class="card md-body" style="margin-bottom:14px;font-size:12px">${mdToHtml(demo.template_excerpt)}</article>` : ''}
    ${rounds}
    <p class="muted" style="font-size:12px">${esc(demo.note || '')}</p>
    <div class="action-row"><a class="action-btn" href="/">🛡 工作台 · 对抗辩论</a></div>`;
}

async function docsHubHTML() {
  const { docs } = await loadDocCatalog();
  const groups = [...new Set(docs.map(d => d.group))];
  let html = '<div class="doc-toolbar"><h2 style="margin:0">文档中心</h2><span class="badge-live">全部在看板内打开</span></div>';
  for (const g of groups) {
    html += `<h3 class="hub-group">${esc(g)}</h3><div class="docs-hub">`;
    html += docs.filter(d => d.group === g).map(d =>
      `<button type="button" class="doc-card ${d.exists ? '' : 'na'}" data-goto="${esc(d.id)}">
        <span class="doc-card-title">${esc(d.title)}</span>
        <span class="doc-card-desc">${d.exists ? '点击进入阅读' : '动态页 / 待生成'}</span>
      </button>`
    ).join('');
    html += '</div>';
  }
  html += `<div class="docs-hub" style="margin-top:12px">
    <button type="button" class="doc-card accent" data-goto="bench"><span class="doc-card-title">🧪 AuditBench</span><span class="doc-card-desc">实时案卷指标</span></button>
    <button type="button" class="doc-card accent" data-goto="yhf"><span class="doc-card-title">🔒 YHF 门禁</span><span class="doc-card-desc">Oracle 门禁环</span></button>
    <button type="button" class="doc-card accent" data-goto="shadow"><span class="doc-card-title">🔬 规则准入</span><span class="doc-card-desc">观察期三验 · FPR</span></button>
    <button type="button" class="doc-card accent" data-goto="institution"><span class="doc-card-title">🏥 机构画像</span><span class="doc-card-desc">批量聚合</span></button>
  </div>`;
  return html;
}

function bindDocCards(root) {
  root.querySelectorAll('[data-goto]').forEach(el => {
    el.onclick = (e) => { e.preventDefault(); navigate(el.dataset.goto); };
  });
  root.querySelectorAll('a.md-nav').forEach(el => {
    el.onclick = (e) => { e.preventDefault(); navigate(el.dataset.goto); };
  });
  root.querySelectorAll('.link-btn[data-goto]').forEach(el => {
    el.onclick = (e) => { e.preventDefault(); navigate(el.dataset.goto); };
  });
}

function kpiCard(lbl, val, cls, sub) {
  return `<div class="kpi ${cls || ''}"><div class="val">${esc(val)}</div><div class="lbl">${esc(lbl)}</div><div class="sub">${esc(sub || '')}</div></div>`;
}

function collectBlockers(d) {
  const items = [];
  for (const c of (d.yhf?.engine?.cases || [])) {
    if (!c.pass) {
      items.push({
        kind: c.is_clean ? 'gate' : 'recall',
        id: c.case_id,
        text: (c.failures || []).join('；') || '案卷未通过',
      });
    }
  }
  const g0 = resolveG0(d);
  if (g0 === false) {
    items.push({ kind: 'gate', id: 'G0', text: '干净件存在误报 — 红线未过' });
  } else if (g0 == null && d.yhf?._fetchFailed) {
    items.push({ kind: 'info', id: 'YHF', text: 'YHF 门禁加载超时 — 请刷新或打开 YHF 页跑全量' });
  }
  if (d.yhf?.rule?.missing_test_cases > 0) {
    const core = d.yhf.rule.core_rules?.length ? '核心集' : '';
    items.push({ kind: 'rule', id: 'L2', text: `${d.yhf.rule.missing_test_cases} 条${core}规则缺 test_cases` });
  }
  for (const t of (d.tasks?.tasks || [])) {
    if (t.priority === 'P0' && (t.status === 'todo' || t.status === 'doing')) {
      items.push({ kind: 'task', id: t.id, text: t.title, status: t.status });
    }
  }
  return items;
}

function heroStatus(d) {
  const blockers = collectBlockers(d);
  const g0 = resolveG0(d);
  const gateHard = blockers.filter(b => b.kind === 'gate');
  const l3AllPass = (d.yhf?.engine?.cases || []).every(c => c.pass);
  if (g0 === false || gateHard.some(b => b.id === 'G0')) return { level: 'fail', label: '有阻塞项', blockers };
  if (gateHard.length) return { level: 'fail', label: '有阻塞项', blockers };
  if (blockers.length) return { level: 'warn', label: '可运行 · 有待办', blockers };
  return { level: 'pass', label: '评测就绪', blockers: [] };
}

function statusHeroHTML(d) {
  const st = heroStatus(d);
  const g0 = resolveG0(d);
  const l3Pass = (d.yhf?.engine?.cases || []).filter(c => c.pass).length;
  const l3Total = (d.yhf?.engine?.cases || []).length;
  const smart = d.tasks?.meta?.smart_goal || 'Phase 4 评测闭环';
  const p0Count = st.blockers.filter(b => b.kind === 'task').length;
  const headline = st.level === 'pass'
    ? `G0 零误报 PASS · L3 案卷 ${l3Pass}/${l3Total} 全绿`
    : st.level === 'warn'
      ? `G0 PASS · 尚有 ${st.blockers.length} 项待办${p0Count ? `（P0 ×${p0Count}）` : ''}`
      : g0 === false
        ? `门禁未全绿 · ${st.blockers.filter(b => b.kind === 'gate').length || 1} 处需修复`
        : `门禁加载中或待确认 · 请刷新`;
  return `
    <section class="status-hero ${st.level}">
      <div class="hero-body">
        <span class="hero-badge">${esc(st.label)}</span>
        <h2 class="hero-title">${esc(headline)}</h2>
        <p class="hero-sub">${esc(smart)}</p>
        <p class="hero-meta">Oracle 模式 · ${d.bench.meta.total_cases} 案卷 · ${d.health.rules ?? d.health.rules_count ?? '—'} 规则 · 更新 ${d.at.toLocaleString('zh-CN')}</p>
      </div>
      <div class="hero-actions">
        <a class="action-btn" href="/">稽核工作台</a>
        <button type="button" class="action-btn secondary" data-goto="tasks">任务台账</button>
        <button type="button" class="action-btn secondary" data-goto="yhf">YHF 门禁</button>
      </div>
    </section>`;
}

function blockersHTML(blockers) {
  if (!blockers.length) return '';
  const rows = blockers.map(b => {
    const tag = b.kind === 'gate' ? '门禁' : b.kind === 'recall' ? '召回' : b.kind === 'rule' ? '规则' : b.kind === 'info' ? '提示' : 'P0';
    const cls = b.kind === 'gate' ? 'gate' : b.kind === 'recall' ? 'recall' : b.kind === 'task' ? 'task' : b.kind === 'info' ? 'info' : 'rule';
    const extra = b.status === 'doing' ? ' · 进行中' : '';
    return `<li class="blocker-item ${cls}"><span class="blocker-tag">${tag}</span><strong>${esc(b.id)}</strong><span>${esc(b.text)}${extra}</span></li>`;
  }).join('');
  return `<section class="card blockers-card"><h3 class="section-title">待解决</h3><ul class="blocker-list">${rows}</ul></section>`;
}

function p0TasksHTML(tasks) {
  const p0 = (tasks?.tasks || []).filter(t => t.priority === 'P0' && t.status !== 'done' && t.status !== 'deferred');
  if (!p0.length) {
    return `<section class="card"><div class="card-head"><h2 class="section-title">本轮 P0</h2><button type="button" class="link-sm link-btn" data-goto="tasks">台账 →</button></div>
      <p class="muted" style="margin:0">无待办 P0 — Phase 4 可推进下一项</p></section>`;
  }
  const rows = p0.slice(0, 5).map(t => {
    const st = t.status === 'doing' ? '进行中' : '待办';
    return `<div class="p0-row ${t.status}"><span class="p0-id">${esc(t.id)}</span><span class="p0-title">${esc(t.title)}</span><span class="p0-st">${st}</span></div>`;
  }).join('');
  return `<section class="card"><div class="card-head"><h2 class="section-title">本轮 P0 · ${p0.length} 项</h2><button type="button" class="link-sm link-btn" data-goto="tasks">去打勾 →</button></div>${rows}</section>`;
}

function overviewHTML(d) {
  const st = heroStatus(d);
  const { bench, yhf, health, inst, gov, kb } = d;
  const g0 = resolveG0(d);
  const g0Label = g0 === true ? 'PASS' : g0 === false ? 'FAIL' : '—';
  const g0Cls = g0 === true ? 'pass' : g0 === false ? 'fail' : '';
  const kbLive = kb?.live?.active && kb?.live?.vector_ready;
  const kbSub = kb
    ? `${kb.live?.supabase?.entry_count ?? kb.oracle?.ref_count ?? '—'} 条 · ${kb.embedding?.embedded_chunks ?? 0} 向量 · ${kb.embedding?.provider || '—'}`
    : '未连接';
  return `
    ${statusHeroHTML(d)}
    ${blockersHTML(st.blockers)}
    <section class="kpi-grid kpi-compact">
      ${kpiCard('G0 零误报', g0Label, g0Cls, `误报 ${bench.meta.clean_false_positive_total ?? '—'}`)}
      ${kpiCard('L3 案卷', `${(yhf.engine?.cases || []).filter(c => c.pass).length}/${yhf.engine?.cases?.length || 0}`, 'accent', 'recall 对齐')}
      ${kpiCard('规则', health.rules ?? health.rules_count ?? '—', '', `shadow ${gov.summary?.shadow ?? 0}`)}
      ${kpiCard('KB/RAG', kbLive ? 'Live' : (kb ? 'JSON' : '—'), kbLive ? 'pass' : '', kbSub)}
      ${kpiCard('机构疑点', inst.summary.suspected_total, 'warn', '¥' + inst.summary.amount_total)}
      ${kpiCard('LLM', health.llm_ready ? '就绪' : '未配置', health.llm_ready ? 'pass' : '', health.llm_provider || '确定性引擎')}
    </section>
    <section class="grid-2">
      <article class="card"><div class="card-head"><h2 class="section-title">时延分布</h2><button type="button" class="link-sm link-btn" data-goto="bench">AuditBench →</button></div>
        <div class="chart-bars">${latencyBars(bench)}</div></article>
      <article class="card"><div class="card-head"><h2 class="section-title">门禁环</h2><button type="button" class="link-sm link-btn" data-goto="yhf">YHF →</button></div>
        <div class="gate-rings">${gateRingsHTML(yhf)}</div>
        <p class="gate-legend">G0 干净件 · G1 shadow · G2 prompt · All 综合</p></article>
    </section>
    ${kb ? `<section class="card"><div class="card-head"><h2 class="section-title">知识库 / RAG 状态</h2><a class="link-sm" href="/" target="_blank">工作台 RAG 稽核 →</a></div>
      <div class="kpi-grid kpi-compact" style="margin-bottom:0">
        ${kpiCard('模式', kb.mode || '—', '', kb.corpus_version || '')}
        ${kpiCard('Supabase', kb.live?.supabase?.ok ? '在线' : '离线', kb.live?.supabase?.ok ? 'pass' : 'fail', `${kb.live?.supabase?.entry_count ?? 0} entries`)}
        ${kpiCard('向量就绪', kb.live?.vector_ready ? '是' : '否', kb.live?.vector_ready ? 'pass' : '', `${kb.embedding?.model || ''}`)}
        ${kpiCard('Oracle JSON', kb.oracle?.ref_count ?? '—', '', '离线兜底')}
      </div></section>` : ''}
    ${p0TasksHTML(d.tasks)}
    ${maturitySectionHTML(d.maturity)}
    <section class="card"><div class="card-head"><h2 class="section-title">迭代 Phase</h2><button type="button" class="link-sm link-btn" data-goto="roadmap">完整路线 →</button></div>
      <div class="phase-timeline">${PHASES.map(p => `<div class="phase-node ${p.status}"><div class="phase-dot"></div><div class="phase-name">${esc(p.name)}</div><div class="phase-id">${esc(p.id)}</div></div>`).join('')}</div>
    </section>
    <section class="card"><div class="card-head"><h2 class="section-title">快捷入口</h2></div>
      <div class="docs-hub">
        <button type="button" class="doc-card accent" data-goto="bench"><span class="doc-card-title">AuditBench</span><span class="doc-card-desc">20 案卷回归 · G0 红线</span></button>
        <button type="button" class="doc-card accent" data-goto="institution"><span class="doc-card-title">机构画像</span><span class="doc-card-desc">${inst.summary.audited_cases} 案 · ¥${inst.summary.amount_total}</span></button>
        <button type="button" class="doc-card accent" data-goto="governance"><span class="doc-card-title">规则治理</span><span class="doc-card-desc">shadow ${gov.summary?.shadow ?? 0} · 下线 ${gov.summary?.deprecated ?? 0}</span></button>
        <button type="button" class="doc-card accent" data-goto="docs"><span class="doc-card-title">文档中心</span><span class="doc-card-desc">战略 · 架构 · Pitch</span></button>
      </div>
    </section>`;
}

function latencyBars(bench) {
  const max = Math.max(1, ...bench.cases.map(c => c.latency_ms));
  return bench.cases.map(c => `<div class="bar-row"><span class="bar-label">${esc(c.id)}${c.is_clean ? '🟢' : ''}</span>
    <div class="bar-track"><div class="bar-fill" style="width:${Math.round(c.latency_ms / max * 100)}%"></div></div>
    <span class="bar-val">${c.latency_ms}ms</span></div>`).join('');
}

function gateRingsHTML(yhf) {
  const rings = [
    { name: 'G0', pass: yhf?.engine?.gates?.G0_clean_zero_fp },
    { name: 'G1', pass: yhf?.shadow?.pass, na: !yhf?.shadow },
    { name: 'G2', pass: yhf?.prompt?.pass, na: yhf?.prompt?.pass == null },
    { name: 'All', pass: yhf?.overall_pass },
  ];
  return rings.map(r => {
    const color = r.na ? '#cbd5e1' : (r.pass ? '#0D9B6A' : '#DC4A3D');
    return `<div class="ring-wrap"><div class="ring">${ringSVG(r.na ? 0 : (r.pass ? 1 : 0), color)}</div><div class="ring-label">${r.name}</div></div>`;
  }).join('');
}

function taskBoardHTML() {
  return Object.entries(ROADMAP_TASKS).map(([title, tasks], i) =>
    `<div class="task-col"><h3>${esc(title)} ${i === 0 ? '<span class="tag next">NEXT</span>' : ''}</h3>` +
    tasks.map(t => `<div class="task-item ${t.pri.toLowerCase()}"><span>${esc(t.id)} ${esc(t.text)}</span><span class="task-pri">${esc(t.pri)}</span></div>`).join('') +
    '</div>'
  ).join('');
}

function benchViewHTML(bench) {
  const tierLabel = (t) => ({ clean: '干净', boundary: '边界', violation: '违规' }[t] || t || '—');
  const rows = bench.cases.map(c => `<tr>
    <td>${c.is_clean ? '🟢 干净' : '🔴 违规'}</td>
    <td><span class="muted" style="font-size:11px">${esc(tierLabel(c.bench_tier))}</span></td>
    <td>${esc(c.title || c.id)}</td>
    <td class="num">${c.found_suspected}</td><td class="num">${c.found_clue}</td>
    <td class="num">${c.false_positives ?? '—'}</td><td class="num">${c.latency_ms}ms</td>
    <td><a class="btn-sm" href="/?case=${encodeURIComponent(c.id)}">在工作台打开</a></td>
  </tr>`).join('');
  return `
    <div class="doc-toolbar"><h2 style="margin:0">AuditBench · Oracle 模式</h2>
      <span class="redline ${bench.meta.red_line_clean_zero_fp ? 'pass' : 'fail'}">${bench.meta.red_line_clean_zero_fp ? '✓ G0 PASS' : '✗ G0 FAIL'}</span></div>
    <div class="bench-kpis" style="margin-bottom:16px">
      <div class="bkpi"><div class="n">${bench.meta.total_cases}</div><div class="l">案卷</div></div>
      <div class="bkpi green"><div class="n">${bench.meta.clean_false_positive_total}</div><div class="l">干净误报</div></div>
      <div class="bkpi"><div class="n">${bench.meta.boundary_cases ?? '—'}</div><div class="l">边界案卷</div></div>
      <div class="bkpi ${bench.meta.boundary_zero_fp ? 'green' : 'warn'}"><div class="n">${bench.meta.boundary_false_positives ?? 0}</div><div class="l">边界误报</div></div>
      <div class="bkpi"><div class="n">${bench.meta.avg_latency_ms}</div><div class="l">均时延 ms</div></div>
    </div>
    <div class="card" style="padding:0;overflow:auto;max-height:520px">
      <table class="bench-table"><thead><tr><th>类型</th><th>层级</th><th>案卷</th><th class="num">疑点</th><th class="num">线索</th><th class="num">误报</th><th class="num">时延</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table>
    </div>
    <div class="action-row">
      <a class="action-btn" href="/" target="_blank">🛡 打开稽核工作台</a>
      <button class="action-btn secondary" type="button" onclick="navigate('yhf')">🔒 查看 YHF 门禁</button>
    </div>`;
}

let batchPollTimer = null;
let lastBatchJobId = null;

function batchProgressHTML(job) {
  if (!job) return '<p class="muted">尚未启动批量任务</p>';
  const pct = job.progress_pct ?? 0;
  const statusLabel = { pending: '排队', running: '运行中', done: '完成', failed: '失败' }[job.status] || job.status;
  const rows = (job.results || []).map(r => `<tr class="${r.error ? 'warn' : ''}">
    <td>${r.is_clean ? '🟢' : '🔴'} ${esc(r.title || r.id)}</td>
    <td class="num">${r.error ? '—' : r.found_suspected}</td>
    <td class="num">${r.error ? '—' : (r.shadow_count ?? 0)}</td>
    <td class="num">${r.latency_ms ?? 0}ms</td>
    <td>${r.error ? esc(r.error) : `<a class="btn-sm" href="/?case=${encodeURIComponent(r.id)}">打开</a>`}</td>
  </tr>`).join('');
  const sum = job.summary;
  const exportBtn = (job.status === 'done' || job.status === 'failed')
    ? `<div class="action-row" style="margin-top:10px">
      <a class="action-btn secondary" href="/api/audit/batch/${encodeURIComponent(job.id)}/export">📄 Markdown</a>
      <a class="action-btn" target="_blank" href="/api/audit/batch/${encodeURIComponent(job.id)}/export?format=html">🖨 打印/PDF</a>
    </div>`
    : '';
  return `
    <div class="batch-head"><span class="badge teal">${esc(job.mode)} · 并发 ${job.concurrency ?? 3}${job.priority_ranked ? ' · 🎯优先' : ''}${job.top_n ? ` · Top ${job.top_n}` : ''} · ${esc(statusLabel)}</span>
      <code style="font-size:11px">${esc(job.id)}</code></div>
    <div class="batch-progress" aria-label="进度 ${pct}%"><div class="batch-progress-fill" style="width:${pct}%"></div></div>
    <p class="muted" style="margin:8px 0 12px">${job.done}/${job.total} 案卷 · ${pct}%</p>
    ${sum ? `<div class="bench-kpis" style="margin-bottom:12px">
      <div class="bkpi"><div class="n">${sum.cases_run}</div><div class="l">完成</div></div>
      <div class="bkpi warn"><div class="n">${sum.suspected_total}</div><div class="l">疑点合计</div></div>
      <div class="bkpi"><div class="n">${sum.shadow_total}</div><div class="l">shadow</div></div>
      <div class="bkpi green"><div class="n">${sum.clean_false_positives}</div><div class="l">干净误报</div></div>
    </div>` : ''}
    <div class="card" style="padding:0;overflow:auto;max-height:360px">
      <table class="bench-table"><thead><tr><th>案卷</th><th class="num">疑点</th><th class="num">shadow</th><th class="num">时延</th><th>操作</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" class="muted">等待结果…</td></tr>'}</tbody></table>
    </div>${exportBtn}`;
}

function batchViewHTML() {
  return `
    <div class="doc-toolbar"><h2 style="margin:0">批量初筛队列</h2>
      <span class="badge teal">live=治理叠加 · oracle=纯引擎</span></div>
    <p class="muted" style="margin:0 0 12px">飞检/院端批量跑案卷初筛，默认 <b>3 路并发</b>。勾选「按优先队列」时：先分 <b>疑点 &gt; 线索</b> 层级，再按 <b>api_score</b>（越高越先查）入队；可设 <b>Top N</b> 只跑队首 N 案。</p>
    <div class="action-row" style="margin-bottom:8px;align-items:center;gap:8px;flex-wrap:wrap">
      <label class="muted" for="batchTopN" style="font-size:13px">Top N</label>
      <input id="batchTopN" type="number" min="1" max="50" placeholder="全部" style="width:72px;padding:6px 8px;border:1px solid var(--border);border-radius:6px" />
    </div>
    <div class="action-row" style="margin-bottom:16px">
      <button type="button" class="action-btn" id="btnBatchLive">▶ 全部案卷 · live</button>
      <button type="button" class="action-btn secondary" id="btnBatchOracle">▶ 全部 · oracle</button>
      <button type="button" class="action-btn" id="btnBatchPriLive">🎯 优先级 · live</button>
      <button type="button" class="action-btn secondary" id="btnBatchPriOracle">🎯 优先级 · oracle</button>
      <button type="button" class="action-btn secondary" id="btnBatchRefresh">↻ 刷新任务列表</button>
    </div>
    <div id="batchLivePanel">${batchProgressHTML(null)}</div>
    <article class="card" style="margin-top:16px"><h3 style="margin:0 0 8px">最近任务</h3><div id="batchJobList"><p class="muted">加载中…</p></div></article>
    <div class="action-row">
      <button type="button" class="action-btn secondary" onclick="navigate('bench')">🧪 AuditBench</button>
      <button type="button" class="action-btn secondary" onclick="navigate('institution')">🏥 机构画像</button>
    </div>`;
}

async function startBatchJob(mode, { priority = false, top_n } = {}) {
  const body = { skip: ['uploaded'], mode, concurrency: 3, priority };
  const n = Number(top_n);
  if (Number.isFinite(n) && n > 0) {
    body.top_n = Math.min(50, Math.floor(n));
  } else {
    body.all = true;
  }
  const res = await fetch('/api/audit/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || '启动失败');
  return data.job;
}

async function pollBatchJob(jobId, panelEl) {
  lastBatchJobId = jobId;
  if (batchPollTimer) clearInterval(batchPollTimer);
  const tick = async () => {
    const job = await fetchJSON(`/api/audit/batch/${encodeURIComponent(jobId)}`);
    if (panelEl) panelEl.innerHTML = batchProgressHTML(job);
    if (job.status === 'done' || job.status === 'failed') {
      clearInterval(batchPollTimer);
      batchPollTimer = null;
      await refreshBatchJobList();
    }
  };
  await tick();
  batchPollTimer = setInterval(tick, 600);
}

async function refreshBatchJobList() {
  const el = document.getElementById('batchJobList');
  if (!el) return;
  const data = await fetchJSON('/api/audit/batch');
  const jobs = data.jobs || [];
  if (!jobs.length) {
    el.innerHTML = '<p class="muted">暂无历史任务</p>';
    return;
  }
  el.innerHTML = jobs.map(j => `<div class="batch-job-row">
    <button type="button" class="link-sm link-btn batch-show" data-id="${esc(j.id)}">${esc(j.id)}</button>
    <span>${esc(j.mode)} · ${esc(j.status)} · ${j.done}/${j.total}</span>
  </div>`).join('');
  el.querySelectorAll('.batch-show').forEach(btn => {
    btn.onclick = () => {
      const panel = document.getElementById('batchLivePanel');
      pollBatchJob(btn.dataset.id, panel);
    };
  });
}

function bindBatchView(root) {
  const panel = root.querySelector('#batchLivePanel');
  const readTopN = () => {
    const v = Number(root.querySelector('#batchTopN')?.value);
    return Number.isFinite(v) && v > 0 ? Math.min(50, Math.floor(v)) : undefined;
  };
  root.querySelector('#btnBatchLive')?.addEventListener('click', async () => {
    try {
      const job = await startBatchJob('live', { top_n: readTopN() });
      await pollBatchJob(job.id, panel);
    } catch (e) { alert(e.message); }
  });
  root.querySelector('#btnBatchOracle')?.addEventListener('click', async () => {
    try {
      const job = await startBatchJob('oracle', { top_n: readTopN() });
      await pollBatchJob(job.id, panel);
    } catch (e) { alert(e.message); }
  });
  root.querySelector('#btnBatchPriLive')?.addEventListener('click', async () => {
    try {
      const job = await startBatchJob('live', { priority: true, top_n: readTopN() });
      await pollBatchJob(job.id, panel);
    } catch (e) { alert(e.message); }
  });
  root.querySelector('#btnBatchPriOracle')?.addEventListener('click', async () => {
    try {
      const job = await startBatchJob('oracle', { priority: true, top_n: readTopN() });
      await pollBatchJob(job.id, panel);
    } catch (e) { alert(e.message); }
  });
  root.querySelector('#btnBatchRefresh')?.addEventListener('click', () => refreshBatchJobList());
  refreshBatchJobList();
}

function yhfViewHTML(yhf, bench) {
  const g0 = resolveG0({ yhf, bench });
  const g0Pass = g0 === true;
  const cases = (yhf.engine?.cases || []).map(c => `<tr class="${c.pass ? '' : 'warn'}">
    <td>${esc(c.case_id)}</td><td class="num">${c.found_suspected}</td><td>${c.is_clean ? '🟢' : '🔴'}</td>
    <td>${c.failures?.length ? esc(c.failures.join('; ')) : '✓'}</td>
  </tr>`).join('');
  return `
    <div class="doc-toolbar"><h2 style="margin:0">YHF 变更门禁</h2><span class="badge teal">Oracle · 零 governance 叠加</span></div>
    <div class="grid-2"><div class="gate-rings">${gateRingsHTML(yhf)}</div>
      <div class="mini-stats">
        ${kpiCard('G0', g0Pass ? 'PASS' : (g0 === false ? 'FAIL' : '—'), g0Pass ? 'pass' : (g0 === false ? 'fail' : ''), '干净件零误报')}
        ${kpiCard('缺用例', yhf.rule?.missing_test_cases, 'warn', `/${yhf.rule?.total_rules} 规则`)}
      </div></div>
    <article class="card"><h3 style="margin-bottom:10px">L3 案卷明细</h3>
      <table class="bench-table"><thead><tr><th>案卷</th><th class="num">疑点</th><th>类型</th><th>结果</th></tr></thead><tbody>${cases}</tbody></table>
    </article>
    <div class="action-row">
      <button class="action-btn secondary" type="button" onclick="navigate('yhf_readme')">📐 Harness 说明</button>
      <button class="action-btn secondary" type="button" onclick="navigate('gate_report')">📄 Gate 报告</button>
      <button class="action-btn secondary" type="button" onclick="navigate('bench')">🧪 AuditBench</button>
    </div>`;
}

function institutionViewHTML(inst) {
  const s = inst.summary;
  const max = Math.max(1, ...inst.top_rules.map(r => r.amount));
  const bars = inst.top_rules.slice(0, 8).map(r =>
    `<div class="bar-row"><span class="bar-label">${esc(r.rule_id)}</span>
    <div class="bar-track"><div class="bar-fill" style="width:${Math.round(r.amount / max * 100)}%;background:linear-gradient(90deg,#DC4A3D,#E8A838)"></div></div>
    <span class="bar-val">¥${r.amount}</span></div>`).join('');
  return `
    <div class="doc-toolbar"><h2 style="margin:0">${esc(inst.hospital)}</h2></div>
    <div class="kpi-grid">
      ${kpiCard('受检案卷', s.audited_cases, 'accent', '')}
      ${kpiCard('疑点', s.suspected_total, 'warn', '')}
      ${kpiCard('金额', '¥' + s.amount_total, 'warn', '')}
      ${kpiCard('干净件', s.clean_pass, 'pass', '零误报')}
    </div>
    <article class="card inst-chart"><h3>高频规则 TOP（金额）</h3>${bars}</article>
    <div class="action-row">
      <a class="action-btn" href="/api/export/institution?format=html" target="_blank" rel="noopener">🖨 打印/PDF 报告</a>
      <a class="action-btn secondary" href="/api/export/institution" target="_blank" rel="noopener">📄 Markdown</a>
      <a class="action-btn secondary" href="/">🏥 打开工作台</a>
    </div>`;
}

function evalDraftsHTML(drafts) {
  const pending = (drafts?.items || []).filter(i => i.status === 'pending');
  if (!pending.length) {
    return `<section class="card"><h3 class="section-title" style="margin:0 0 8px">Eval 草案队列</h3><p class="muted" style="margin:0">暂无待确认驳回草案 — 在工作台驳回误报后自动生成</p></section>`;
  }
  const rows = pending.map(d => `<tr data-draft-id="${esc(d.id)}">
    <td>${esc(d.case_id)}</td><td>${esc(d.rule_id)}</td><td>${esc(d.reject_reason || '—')}</td>
    <td class="num">${esc(d.gold_draft?.expected_status || '—')}</td>
    <td><button type="button" class="btn-sm draft-confirm" data-id="${esc(d.id)}">确认入库</button>
        <button type="button" class="btn-sm draft-ignore" data-id="${esc(d.id)}">忽略</button></td>
  </tr>`).join('');
  return `<section class="card" style="padding:0;overflow:auto"><div style="padding:12px 16px"><h3 class="section-title" style="margin:0">Eval 草案队列 · ${pending.length} 待确认</h3>
    <p class="muted" style="margin:4px 0 0;font-size:11px">驳回误报自动生成 — 确认后写入 eval_drafts/，不自动改 gold</p></div>
    <table class="bench-table"><thead><tr><th>案卷</th><th>规则</th><th>驳回原因</th><th>草案状态</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

function coverageMiniMatrixHTML(cov) {
  if (!cov || !cov.summary) return '';
  const s = cov.summary;
  const oc = cov.official_coverage || {};
  const statusColor = { implemented: '#16a34a', pilot: '#ca8a04', candidate: '#94a3b8', roadmap: '#6366f1' };
  let cells = '';
  for (const t1 of (cov.tier1 || []).slice(0, 3)) {
    for (const t2 of (t1.tier2 || [])) {
      for (const r of (t2.rules || [])) {
        const st = r.coverage_status || 'candidate';
        const col = statusColor[st] || '#64748b';
        cells += `<a href="/coverage-map.html" class="cov-dot" title="${esc(r.official_code)} ${esc(r.name)} (${st})" style="background:${col}"></a>`;
      }
    }
  }
  return `<section class="card" style="margin-bottom:16px">
    <div class="card-head" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <h3 class="section-title" style="margin:0">国家 79 条官方规则覆盖</h3>
      <a class="action-btn secondary" href="/coverage-map.html" style="font-size:12px;padding:6px 12px">全屏地图 →</a>
    </div>
    <div class="mini-stats" style="margin:10px 0">
      ${kpiCard('已实现', s.implemented ?? 0, 'pass', `${s.total ? Math.round((s.implemented||0)/s.total*100) : 0}%`)}
      ${kpiCard('生产就绪', oc.production_ready ?? 0, 'pass', 'YHF 已验')}
      ${kpiCard('试运行', s.pilot ?? 0, 'warn', '')}
      ${kpiCard('checker', oc.rule_checker_count ?? 0, 'accent', '引擎注册')}
      ${kpiCard('核心', oc.core_checker_count ?? 0, '', '对齐国家框架')}
      ${kpiCard('增强', oc.enhancement_checker_count ?? 0, '', '专科扩展')}
    </div>
    ${oc.family_breakdown ? `<p class="muted" style="margin:0 0 8px;font-size:11px">规则库分层：13族 <b>${oc.family_breakdown.naming_62 ?? '—'}</b> · 埋点 <b>${oc.family_breakdown.embed_4 ?? 0}</b>/4 · L3 <b>${oc.family_breakdown.l3_5 ?? 0}</b>/5 · ZB <b>${oc.family_breakdown.zb_8 ?? 0}</b>/8 · <a href="/coverage-map.html">全屏地图</a></p>` : ''}
    <div class="cov-matrix" style="display:flex;flex-wrap:wrap;gap:3px;max-height:72px;overflow:hidden">${cells}</div>
    <p class="muted" style="margin:8px 0 0;font-size:11px">绿=已实现 · 黄=试运行 · 灰=候选 · 紫虚线格=路线图（含跨就诊统计指标监测 8 条）</p>
  </section>`;
}

function governanceViewHTML(gov, drafts, coverage) {
  const entries = gov.entries || [];
  const cards = entries.length ? entries.map(e => {
    const cls = e.status === 'shadow' ? '' : (e.status === 'deprecated' ? 'dep' : 'active');
    const hist = (e.history || []).slice(-2).map(h => `${h.from}→${h.to} (${h.by})`).join(' · ');
    return `<div class="gov-card ${cls}"><div class="rid">${esc(e.rule_id)} · ${esc(e.rule_name || '')}</div>
      <div class="meta">状态: <b>${esc(e.status)}</b>${hist ? ' · ' + esc(hist) : ''}</div></div>`;
  }).join('') : '<p class="muted">全部规则在役（active）— 无 shadow / deprecated 条目</p>';
  return `
    ${coverageMiniMatrixHTML(coverage)}
    <div class="doc-toolbar"><h2 style="margin:0">规则治理三态</h2><span class="badge">${esc(gov.model || '')}</span></div>
    <div class="mini-stats" style="margin-bottom:16px">
      ${kpiCard('总数', gov.summary?.total_rules, '', '')}
      ${kpiCard('shadow', gov.summary?.shadow ?? 0, 'warn', '观察期')}
      ${kpiCard('deprecated', gov.summary?.deprecated ?? 0, '', '已下线')}
    </div>
    <div class="gov-list">${cards}</div>
    <section class="card" style="margin-top:16px">
      <h3 class="section-title" style="margin:0 0 8px">Supabase 治理落库</h3>
      <p class="muted" style="margin:0 0 10px;font-size:11px">push 本地 rule_states → DB（service_role 写入 · anon 只读 · 快照表禁 anon）</p>
      <div id="govSyncStatus" class="muted">检测中…</div>
      <div class="action-row" style="margin-top:10px">
        <button type="button" class="action-btn secondary" id="btnGovPush">↑ push 到 Supabase</button>
        <button type="button" class="action-btn secondary" id="btnGovPull">↓ pull 覆盖本地</button>
      </div>
    </section>
    ${evalDraftsHTML(drafts)}
    <div class="action-row"><a class="action-btn" href="/">🗂 打开工作台 · 规则治理</a></div>`;
}

async function bindGovernanceSync(root) {
  const statusEl = root.querySelector('#govSyncStatus');
  const refresh = async () => {
    try {
      const st = await fetchJSON('/api/governance/sync/status');
      if (!st.configured) statusEl.textContent = 'Supabase 未配置 — 仅本地 JSON 落盘';
      else if (!st.reachable) statusEl.textContent = `Supabase 不可达：${st.error || '请执行 migration 20260616000001_governance.sql'}`;
      else statusEl.textContent = `✅ 已连接 · 远程 ${st.rule_state_count ?? 0} 条治理状态 · KB ${st.kb_entries ?? '—'} 条`;
    } catch (e) {
      statusEl.textContent = '检测失败：' + e.message;
    }
  };
  await refresh();
  const sync = async (direction) => {
    const headers = { 'content-type': 'application/json' };
    const token = localStorage.getItem('yingyan_admin_token');
    if (token) headers['X-Yingyan-Token'] = token;
    const res = await fetch('/api/governance/sync', {
      method: 'POST',
      headers,
      body: JSON.stringify({ direction }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    alert(direction === 'push' ? `已 push ${data.pushed ?? 0} 条` : `已 pull ${data.pulled ?? 0} 条`);
    await refresh();
  };
  root.querySelector('#btnGovPush')?.addEventListener('click', () => sync('push').catch(e => alert(e.message)));
  root.querySelector('#btnGovPull')?.addEventListener('click', () => {
    if (!confirm('pull 将用 Supabase 覆盖本地 rule_states.json，继续？')) return;
    sync('pull').catch(e => alert(e.message));
  });
}

async function bindEvalDraftActions(root) {
  root.querySelectorAll('.draft-confirm, .draft-ignore').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.classList.contains('draft-confirm') ? 'confirm' : 'ignore';
      try {
        await fetch('/api/eval-drafts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action, id: btn.dataset.id }),
        });
        navigate('governance');
      } catch (e) {
        alert('操作失败：' + e.message);
      }
    });
  });
}

function brandViewHTML() {
  const colors = [
    ['--yy-ink', '#0B2A4A'], ['--yy-iris', '#2DD4BF'], ['--yy-amber', '#E8A838'],
    ['--red', '#DC4A3D'], ['--green', '#0D9B6A'],
  ];
  const swatches = colors.map(([n, hex]) =>
    `<div class="swatch"><div class="chip" style="background:${hex}"></div><div class="lbl">${esc(hex)}</div></div>`).join('');
  const v2Cards = [
    { id: 'brand_v2', icon: '📄', title: 'DESIGN-v2-gpt.md', desc: 'GPT 完整品牌方案（2026-06-15）' },
    { id: 'brand_apply', icon: '📐', title: 'APPLICATION.md', desc: '如何应用到原型 / Pitch' },
    { id: 'brand_gallery', icon: '🖼', title: 'gpt-v2/', desc: 'GPT 参考图（Logo、证据链 UI、图标集）' },
    { id: 'brand_prompt', icon: '✨', title: '品牌元素生成.md', desc: '复用 Prompt' },
  ].map(c =>
    `<button type="button" class="brand-v2-card" data-brand-target="${esc(c.id)}">
      <span class="brand-v2-icon">${c.icon}</span>
      <span class="brand-v2-title">${esc(c.title)}</span>
      <span class="brand-v2-desc">${esc(c.desc)}</span>
    </button>`).join('');
  const dontUse = [
    '纯红医疗十字作为主视觉',
    '过高饱和渐变（廉价 SaaS 感）',
    '与 shadow 观察期紫色混淆的大面积紫（shadow 仅治理态使用）',
  ].map(t => `<li>${esc(t)}</li>`).join('');
  return `
    <div class="brand-showcase">
      <div class="brand-logo-box"><img src="/brand/logo-mark.svg" alt="鹰眼 logo"></div>
      <div><h2 style="margin:0 0 8px">鹰眼 <span style="font-family:var(--font-num);font-size:14px;font-weight:600;opacity:.7">EagleEye Audit</span></h2>
        <p class="muted">监管可信 × 智能锐利 · v1 工程基准 + v2 GPT 候选</p>
        <div class="color-swatches">${swatches}</div></div>
    </div>
    <section class="card brand-v2-section">
      <h3 style="margin:0 0 4px;font-size:14px">扩展（v2 候选）</h3>
      <p class="muted" style="margin:0 0 12px;font-size:11px">来自 DESIGN.md · 候选方案尚未合并进 v1 正式规范</p>
      <div class="brand-v2-grid">${v2Cards}</div>
    </section>
    <section class="card brand-dont-use">
      <h3 style="margin:0 0 8px;font-size:13px;color:var(--red)">勿用</h3>
      <ul class="brand-dont-list">${dontUse}</ul>
    </section>
    <section class="card brand-phase-track">
      <h3 style="margin:0 0 10px;font-size:14px">v2 落地进度</h3>
      <ul class="brand-phase-list">
        <li class="done"><strong>Phase A</strong> 文案对齐 · EagleEye Audit · 微文案 v2</li>
        <li class="done"><strong>Phase B</strong> CSS Token 扩展 · 深色/阴影三档</li>
        <li class="done"><strong>Phase C</strong> 证据链三列 UI · 工作台 finding</li>
        <li class="done"><strong>Phase D</strong> 9 功能图标 SVG · assets/brand/icons/</li>
        <li class="wip"><strong>Phase E</strong> Pitch 物料 · 下方预览 → Canva / Keynote 导出</li>
      </ul>
    </section>
    <section class="card brand-pitch-cover">
      <h3 style="margin:0 0 4px;font-size:14px">Pitch 封面 · 方案 A（居中准星型）</h3>
      <p class="muted" style="margin:0 0 12px;font-size:11px">参考 gpt-v2/04-applications.png · 导出至 Keynote / Canva</p>
      <div class="pitch-cover-mock">
        <img src="/brand/gpt-v2/04-applications.png" alt="Pitch 展台参考" loading="lazy">
        <div class="pitch-cover-overlay">
          <img src="/brand/logo-mark.svg" alt="" width="72" height="72">
          <h4>鹰眼 EagleEye Audit</h4>
          <p>让每一分救命钱，都查得有据</p>
        </div>
      </div>
      <div class="brand-icon-strip">
        ${['scan','evidence','report'].map(i => `<span><img src="/brand/icons/${i}.svg" alt="" width="20" height="20"> ${i === 'scan' ? '线索筛查' : i === 'evidence' ? '证据链' : '报告输出'}</span>`).join('')}
      </div>
    </section>
    <div class="brand-tabs">
      <button class="brand-tab active" type="button" data-brand-doc="brand">v1 规范</button>
      <button class="brand-tab" type="button" data-brand-doc="brand_v2">v2 GPT 方案</button>
      <button class="brand-tab" type="button" data-brand-doc="brand_apply">应用指南</button>
      <button class="brand-tab" type="button" data-brand-doc="brand_prompt">生成 Prompt</button>
    </div>
    <section class="card brand-gallery-wrap" id="brandGalleryWrap">
      <h3 style="margin:0 0 4px;font-size:14px">GPT 参考图（gpt-v2/）</h3>
      <p class="muted" id="brandGalleryHint" style="margin:0 0 12px;font-size:11px">加载中…</p>
      <div class="brand-gallery" id="brandGallery"></div>
    </section>
    <div id="brandDoc" class="md-body"><p>加载品牌规范…</p></div>`;
}

async function loadBrandGallery() {
  const box = document.getElementById('brandGallery');
  const hint = document.getElementById('brandGalleryHint');
  if (!box) return;
  try {
    const { items, anyExists } = await fetchJSON('/api/brand/gpt-v2');
    if (!anyExists) {
      hint.textContent = '参考图目录 assets/brand/gpt-v2/ 待放入 7 张 PNG（见 DESIGN-v2-gpt.md 索引）';
      box.innerHTML = items.map(it =>
        `<figure class="brand-gallery-item missing"><div class="brand-gallery-ph">${esc(it.caption)}</div><figcaption>${esc(it.file)} · 待上传</figcaption></figure>`
      ).join('');
      return;
    }
    hint.textContent = `共 ${items.filter(i => i.exists).length} 张 · 2026-06-15 GPT 产出`;
    box.innerHTML = items.filter(i => i.exists).map(it =>
      `<figure class="brand-gallery-item"><img src="${esc(it.url)}" alt="${esc(it.caption)}" loading="lazy"><figcaption>${esc(it.caption)}</figcaption></figure>`
    ).join('');
  } catch (e) {
    hint.textContent = '参考图加载失败';
    box.innerHTML = `<p class="muted">${esc(e.message)}</p>`;
  }
}

async function activateBrandTab(root, docId) {
  root.querySelectorAll('.brand-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.brandDoc === docId);
  });
  const doc = await loadDoc(docId);
  const el = document.getElementById('brandDoc');
  if (el) {
    el.innerHTML = mdToHtml(doc.content);
    bindDocCards(el);
  }
  const gal = document.getElementById('brandGalleryWrap');
  if (gal) gal.style.display = docId === 'brand_gallery' ? 'block' : (docId === 'brand' || docId === 'brand_v2' ? 'block' : 'none');
  if (docId === 'brand_gallery') {
    gal?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

async function docViewHTML(docId) {
  if (docId === 'gate_report') {
    const doc = await loadDoc(docId);
    if (!doc.missing && doc.content) {
      return docPageShell(doc.title, doc.excerpt, mdToHtml(doc.content), docId, doc);
    }
    if (!cache.yhf) await loadData();
    return gateReportLiveHTML(cache.yhf);
  }
  let doc;
  try {
    doc = await loadDoc(docId);
  } catch (e) {
    return `<div class="card"><p style="color:var(--red)">文档加载失败：${esc(e.message)}</p><p class="muted">若为 Vercel 预览，请确认最新部署已完成；本地请从 prototype/app 运行 node server.js。</p></div>`;
  }
  if (!doc.content && doc.missing) {
    return `<div class="card"><p class="muted">「${esc(doc.title || docId)}」暂无静态文档，请使用看板内动态视图或本地仓库文件。</p></div>`;
  }
  let extra = '';
  if (docId === 'roadmap') extra = `<section class="card" style="margin-top:16px"><div class="task-board">${await dashCall('roadmapTasksPreviewHTML')}</div></section>`;
  if (docId === 'pitch') extra = `<section class="card brand-pitch-cover" style="margin-top:16px"><h3 style="margin:0 0 8px">Deck 封面预览</h3><div class="pitch-cover-mock"><img src="/brand/gpt-v2/04-applications.png" alt="Pitch 参考"><div class="pitch-cover-overlay"><img src="/brand/logo-mark.svg" width="64" height="64" alt=""><h4>鹰眼 EagleEye Audit</h4><p>让每一分救命钱，都查得有据</p></div></div><p class="muted" style="margin-top:10px;font-size:11px">完整物料请用 04-applications.png 在 Canva / Keynote 排版 · 见品牌规范页 Phase E</p></section>`;
  return docPageShell(doc.title, doc.excerpt, mdToHtml(doc.content), docId, doc) + extra;
}

function docPageShell(title, excerpt, bodyHtml, docId, doc) {
  const navBtns = [];
  if (docId === 'tasks') navBtns.push(`<button class="action-btn secondary" type="button" data-goto="roadmap">🗺 迭代路线</button>`);
  if (docId === 'roadmap') navBtns.push(`<button class="action-btn secondary" type="button" data-goto="tasks">📋 任务台账</button>`);
  if (docId === 'eval') navBtns.push(`<button class="action-btn secondary" type="button" data-goto="open_issues">⚠ Open Issues</button>`);
  const expand = excerpt ? `<button class="action-btn secondary" type="button" id="btnExpandDoc" data-doc="${esc(docId)}">展开全文${doc.totalLines ? ' (' + doc.totalLines + ' 行)' : ''}</button>` : '';
  return `
    <div class="doc-toolbar"><h2 style="margin:0">${esc(title)}</h2>
      <span class="badge-live">${excerpt ? '摘要' : '全文'} · 看板内阅读</span></div>
    <article class="card md-body doc-article" data-doc-id="${esc(docId)}">${bodyHtml}</article>
    <div class="action-row">${expand}${navBtns.join('')}<a class="action-btn" href="/">🛡 稽核工作台</a></div>`;
}

function truncText(s, max = 40) {
  const t = String(s ?? '');
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function priScoreHeaderHtml() {
  const tip = window.PriorityUX?.GLOSSARY?.find(g => g.en === 'api_score')?.tip
    || '优先指数：越高越应安排稽核，非质量分。内部字段 api_score';
  return `<th class="num pri-th-score" title="${esc(tip)}">
    <span class="pri-th-main">优先指数</span>
  </th>`;
}

function priorityViewHTML(rank) {
  const queue = rank.queue || [];
  const top = queue.slice(0, 8);
  const tier1 = queue.filter(r => r.tier === 1).length;
  const shadowList = rank.shadow_bucket || [];
  const legend = window.PriorityUX?.scoreLegend
    || '排序规则：先看风险层（有疑点 > 仅线索），层内按优先指数从高到低。';
  const rows = top.map((r) => {
    const title = r.case_title || r.case_id;
    return `<tr>
      <td><span class="pri-tier t${r.tier}" title="${r.tier === 1 ? '有疑点，优先查' : '仅线索'}">${r.tier === 1 ? '有疑点' : r.tier === 2 ? '仅线索' : '—'}</span></td>
      <td class="num"><strong class="pri-score" title="优先指数，非质量分">${r.api_score}</strong></td>
      <td class="pri-case-cell" title="${esc(title)}">
        <span class="pri-case-id">${esc(r.case_id)}</span>
        <span class="pri-case-title">${esc(truncText(title, 44))}</span>
      </td>
      <td class="num" title="疑点条数 / 线索条数"><span class="pri-ratio">${r.suspected_count}<span class="pri-slash">/</span>${r.clue_count}</span></td>
      <td class="num pri-amt">¥${Number(r.suspected_amount || 0).toLocaleString()}</td>
      <td><a class="btn-sm" href="/priority.html">队列</a></td>
    </tr>`;
  }).join('');
  const shadowChips = shadowList.slice(0, 3).map(r =>
    `<span class="pri-shadow-chip" title="新规则试运行：展示证据但不计分">${esc(truncText(r.case_title || r.case_id, 24))} · 观察 ${r.shadow_count ?? 0}条</span>`,
  ).join('');
  const glossary = window.PriorityUX ? PriorityUX.glossaryPanelHtml(true, 'dashboard') : '';
  return `
    <div class="doc-toolbar">
      <h2 style="margin:0">🎯 稽核优先队列</h2>
      <span class="badge-live">先看风险层 · 再按优先指数排序 · 试运行不计分</span>
    </div>
    ${glossary}
    <div class="bench-kpis">
      <div class="bkpi accent"><div class="n">${rank.total ?? queue.length}</div><div class="l">可排序案卷</div></div>
      <div class="bkpi warn"><div class="n">${tier1}</div><div class="l">有疑点案卷</div></div>
      <div class="bkpi"><div class="n">${shadowList.length}</div><div class="l">新规则试运行</div></div>
      <div class="bkpi green"><div class="n">${queue[0]?.api_score ?? '—'}</div><div class="l">最高优先指数</div></div>
    </div>
    <p class="pri-score-legend muted">${esc(legend)}</p>
    <div class="card pri-card-table">
      <div class="card-head">
        <h2>排序靠前 ${top.length || 0} 案</h2>
        <a class="link-sm" href="/priority.html">打开完整队列 →</a>
      </div>
      <div class="pri-table-wrap">
        <table class="bench-table pri-queue-table">
          <thead><tr>
            <th title="有疑点的案卷永远排在仅线索前">风险层</th>${priScoreHeaderHtml()}<th>案卷</th>
            <th class="num" title="疑点 / 线索">疑/线</th><th class="num">暴露金额</th><th></th>
          </tr></thead>
          <tbody>${rows || '<tr><td colspan="6" class="muted" style="padding:16px">暂无排序数据</td></tr>'}</tbody>
        </table>
      </div>
      ${shadowList.length ? `<div class="pri-shadow-bar"><span class="pri-shadow-label" title="新规则试运行，不计入优先指数">新规则试运行</span>${shadowChips}</div>` : ''}
    </div>
    <div class="action-row">
      <a class="action-btn primary" href="/priority.html">🎯 完整队列与批量入队</a>
      <a class="action-btn secondary" href="/intake.html">📥 导入中心</a>
    </div>`;
}

async function renderView(id) {
  const root = document.getElementById('dashContent');
  const needsCoreData = new Set(['overview', 'bench', 'batch', 'yhf', 'institution', 'governance', 'gate_report']);
  const hasCore = !!cache._coreLoaded;
  if (!hasCore && needsCoreData.has(id)) {
    if (!cache.bench) cache = { ...fallbackCoreData(), at: new Date(), _coreLoaded: false };
    warmCoreDataInBackground();
    if (!root.innerHTML.trim()) root.innerHTML = '<div class="card"><p class="muted">加载中…</p></div>';
  } else {
    root.innerHTML = '<div class="card"><p class="muted">加载中…</p></div>';
  }
  try {
    if (needsCoreData.has(id) && !cache._coreLoaded && !cache.bench) await loadData();
    const item = NAV.find(n => n.id === id);
    let html = '';
    if (id === 'overview') html = overviewHTML(cache);
    else if (id === 'bench') html = benchViewHTML(cache.bench);
    else if (id === 'batch') {
      html = batchViewHTML();
      root.innerHTML = `<div class="view-panel active">${html}</div>`;
      bindDocCards(root);
      bindBatchView(root);
      return;
    }
    else if (id === 'yhf') html = yhfViewHTML(cache.yhf, cache.bench);
    else if (id === 'shadow') {
      const metrics = await fetchJSON('/api/shadow-metrics', 45000);
      html = shadowViewHTML(metrics);
    }
    else if (id === 'three_review') {
      const demo = await fetchJSON('/api/three-review/demo');
      html = threeReviewViewHTML(demo);
    }
    else if (id === 'institution') html = institutionViewHTML(cache.inst);
    else if (id === 'priority') {
      const rank = await fetchJSON('/api/priority/rank', 120000);
      html = priorityViewHTML(rank);
    }
    else if (id === 'governance') {
      const [drafts, coverage] = await Promise.all([
        fetchJSON('/api/eval-drafts').catch(() => ({ items: [] })),
        fetchJSON('/api/official-coverage', 5000).catch(() => null),
      ]);
      html = governanceViewHTML(cache.gov, drafts, coverage);
      root.innerHTML = `<div class="view-panel active">${html}</div>`;
      bindDocCards(root);
      await bindEvalDraftActions(root);
      await bindGovernanceSync(root);
      return;
    }
    else if (id === 'docs') html = await docsHubHTML();
    else if (id === 'eval') {
      const [readme, status, g2] = await Promise.all([
        loadDoc('eval'),
        fetchJSON('/api/eval/status'),
        fetchJSON('/api/eval/g2').catch(() => null),
      ]);
      html = evalViewHTML(readme, status, g2);
    } else if (id === 'gate_report') html = await docViewHTML('gate_report');
    else if (id === 'brand') {
      html = brandViewHTML();
      root.innerHTML = `<div class="view-panel active">${html}</div>`;
      bindDocCards(root);
      const startTab = pendingBrandTab || 'brand';
      pendingBrandTab = null;
      await loadBrandGallery();
      await activateBrandTab(root, startTab === 'brand_gallery' ? 'brand_v2' : startTab);
      root.querySelectorAll('.brand-tab').forEach(btn => {
        btn.addEventListener('click', async () => {
          await activateBrandTab(root, btn.dataset.brandDoc);
        });
      });
      root.querySelectorAll('[data-brand-target]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const target = btn.dataset.brandTarget;
          if (target === 'brand_gallery') {
            document.getElementById('brandGalleryWrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
          }
          await activateBrandTab(root, target);
        });
      });
      if (startTab === 'brand_gallery') {
        document.getElementById('brandGalleryWrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      bindExpandDoc(root);
      return;
    } else if (id === 'tasks') {
      html = await dashCall('tasksBoardHTML');
      root.innerHTML = `<div class="view-panel active">${html}</div>`;
      dashCall('bindTasksBoard', root);
      return;
    } else if (item?.doc) html = await docViewHTML(item.doc);
    else if (id === 'open_issues') html = await docViewHTML('open_issues');
    else html = '<div class="card"><p>未知视图</p></div>';
    root.innerHTML = `<div class="view-panel active">${html}</div>`;
    bindDocCards(root);
    bindExpandDoc(root);
  } catch (e) {
    const isModule = /未加载|is not defined|DashTasks/.test(String(e.message));
    const hint = isModule
      ? '前端脚本可能未完整加载（常见于 tasks-board.js 语法错误）。请硬刷新页面；开发者请运行 node scripts/verify-dashboard-frontend.js'
      : '请确认 node server.js 已从 prototype/app 启动';
    root.innerHTML = `<div class="card"><p style="color:var(--red)">加载失败：${esc(e.message)}</p><p class="muted">${hint}</p></div>`;
  }
}

function bindExpandDoc(root) {
  const btn = root.querySelector('#btnExpandDoc');
  if (!btn) return;
  btn.onclick = async () => {
    const docId = btn.dataset.doc;
    docFullMode[docId] = true;
    delete cache['doc_' + docId];
    delete cache['doc_' + docId + '_full'];
    const doc = await loadDoc(docId, true);
    const art = root.querySelector('.doc-article');
    if (art) art.innerHTML = mdToHtml(doc.content);
    bindDocCards(art || root);
    btn.remove();
  };
}

async function refreshAll() {
  const editing = document.activeElement?.closest?.('[contenteditable="true"], textarea, input');
  cache = {};
  await loadData();
  if (editing && (currentView === 'tasks')) {
    // 编辑中仅刷新缓存，避免 60s 定时器抹掉未保存的标题
    return;
  }
  await renderView(currentView);
}

document.getElementById('btnRefresh').onclick = refreshAll;

let booted = false;

function navigateFromHash() {
  const hash = location.hash.replace(/^#/, '');
  const id = NAV.some(n => n.id === hash) ? hash : 'overview';
  if (!booted || id !== currentView) {
    booted = true;
    navigate(id);
  }
}

window.addEventListener('hashchange', navigateFromHash);
window.addEventListener('popstate', navigateFromHash);

hydrateCacheSnapshot();
navigateFromHash();
setInterval(refreshAll, 60000);
