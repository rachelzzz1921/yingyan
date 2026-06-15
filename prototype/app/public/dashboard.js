'use strict';

/* 鹰眼 · 项目看板 SPA — 所有子页在看板内打开，无复制路径 */

const NAV = [
  { id: 'overview', icon: '📊', label: '总览', group: '监控' },
  { id: 'bench', icon: '🧪', label: 'AuditBench', group: '监控' },
  { id: 'yhf', icon: '🔒', label: 'YHF 门禁', group: '监控' },
  { id: 'roadmap', icon: '🗺', label: '迭代路线', group: '规划', doc: 'roadmap' },
  { id: 'tasks', icon: '📋', label: '任务台账', group: '规划' },
  { id: 'institution', icon: '🏥', label: '机构画像', group: '业务' },
  { id: 'governance', icon: '🗂', label: '规则治理', group: '业务' },
  { id: 'brand', icon: '🎨', label: '品牌规范', group: '设计' },
  { id: 'arch', icon: '🏗', label: '架构蓝图', group: '设计', doc: 'arch' },
  { id: 'yhf_readme', icon: '📐', label: 'Harness 说明', group: '工程', doc: 'yhf_readme' },
  { id: 'gate_report', icon: '📄', label: 'Gate 报告', group: '工程', doc: 'gate_report' },
  { id: 'eval', icon: '📝', label: 'Prompt 评测', group: '工程' },
  { id: 'open_issues', icon: '⚠', label: 'Open Issues', group: '工程', doc: 'open_issues' },
  { id: 'docs', icon: '📚', label: '文档中心', group: '文档' },
  { id: 'master', icon: '📖', label: '项目主文档', group: '文档', doc: 'master' },
  { id: 'pitch', icon: '🎤', label: 'Pitch 文案', group: '文档', doc: 'pitch' },
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
  { id: 'P3', name: 'UI', status: 'done' }, { id: 'P4', name: '评测闭环', status: 'current' },
  { id: 'P5', name: '治理语义', status: 'pending' }, { id: 'P6', name: '输入专科', status: 'pending' },
  { id: 'P7', name: '批量', status: 'pending' }, { id: 'P8', name: '生产', status: 'pending' },
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

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(r.status + ' ' + url);
  return r.json();
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
    for (let i = 2; i < rows.length; i++) t += '<tr>' + rows[i].map(c => `<td>${c.trim()}</td>`).join('') + '</tr>';
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
  // #region agent log
  fetch('http://127.0.0.1:7664/ingest/82cc9e84-dfb6-4801-8348-532350165d81',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2726bf'},body:JSON.stringify({sessionId:'2726bf',location:'dashboard.js:navigate',message:'navigate called',data:{id,hash:location.hash,prev:currentView},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
  // #endregion
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

async function loadData() {
  const [bench, yhf, health, inst, gov, tasks] = await Promise.all([
    fetchJSON('/api/bench'),
    fetchJSON('/api/yhf'),
    fetchJSON('/api/health'),
    fetchJSON('/api/institution'),
    fetchJSON('/api/rule-governance'),
    fetchJSON('/api/tasks').catch(() => ({ tasks: [], summary: {}, meta: {} })),
  ]);
  cache = { bench, yhf, health, inst, gov, tasks, at: new Date() };
  return cache;
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

function evalViewHTML(evalReadme, evalStatus) {
  return `
    <div class="doc-toolbar"><h2 style="margin:0">Prompt 评测台</h2><span class="badge-live">47 用例 · eval/</span></div>
    <div class="kpi-grid" style="margin-bottom:16px">
      ${kpiCard('最新结果', evalStatus?.latest?.file?.replace('.json', '') || '未跑', evalStatus?.latest ? 'accent' : 'warn', evalStatus?.latest?.mtime?.slice(0, 16) || '请运行 run_v7.sh')}
      ${kpiCard('Open Issues', evalStatus?.open_issues ? '有文档' : '—', '', '看板内可读')}
    </div>
    <article class="card md-body">${mdToHtml(evalReadme?.content || '')}</article>
    <div class="action-row">
      <button class="action-btn secondary" type="button" onclick="navigate('open_issues')">⚠ Open Issues</button>
      <button class="action-btn secondary" type="button" onclick="navigate('yhf_readme')">📐 Harness 说明</button>
    </div>`;
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
    if (!c.pass) items.push({ kind: 'gate', id: c.case_id, text: (c.failures || []).join('；') || '案卷未通过' });
  }
  if (!d.yhf?.engine?.gates?.G0_clean_zero_fp) {
    items.push({ kind: 'gate', id: 'G0', text: '干净件存在误报 — 红线未过' });
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
  const g0 = d.yhf?.engine?.gates?.G0_clean_zero_fp;
  const l3AllPass = (d.yhf?.engine?.cases || []).every(c => c.pass);
  if (!g0 || blockers.some(b => b.kind === 'gate')) return { level: 'fail', label: '有阻塞项', blockers };
  if (blockers.length) return { level: 'warn', label: '可运行 · 有待办', blockers };
  return { level: 'pass', label: '评测就绪', blockers: [] };
}

function statusHeroHTML(d) {
  const st = heroStatus(d);
  const g0 = d.yhf?.engine?.gates?.G0_clean_zero_fp;
  const l3Pass = (d.yhf?.engine?.cases || []).filter(c => c.pass).length;
  const l3Total = (d.yhf?.engine?.cases || []).length;
  const smart = d.tasks?.meta?.smart_goal || 'Phase 4 评测闭环';
  const p0Count = st.blockers.filter(b => b.kind === 'task').length;
  const headline = st.level === 'pass'
    ? `G0 零误报 PASS · L3 案卷 ${l3Pass}/${l3Total} 全绿`
    : st.level === 'warn'
      ? `G0 PASS · 尚有 ${st.blockers.length} 项待办${p0Count ? `（P0 ×${p0Count}）` : ''}`
      : `门禁未全绿 · ${st.blockers.filter(b => b.kind === 'gate').length || 1} 处需修复`;
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
    const tag = b.kind === 'gate' ? '门禁' : b.kind === 'rule' ? '规则' : 'P0';
    const cls = b.kind === 'gate' ? 'gate' : b.kind === 'task' ? 'task' : 'rule';
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
  const { bench, yhf, health, inst, gov } = d;
  const g0 = yhf?.engine?.gates?.G0_clean_zero_fp;
  return `
    ${statusHeroHTML(d)}
    ${blockersHTML(st.blockers)}
    <section class="kpi-grid kpi-compact">
      ${kpiCard('G0 零误报', g0 ? 'PASS' : 'FAIL', g0 ? 'pass' : 'fail', `误报 ${bench.meta.clean_false_positive_total}`)}
      ${kpiCard('L3 案卷', `${(yhf.engine?.cases || []).filter(c => c.pass).length}/${yhf.engine?.cases?.length || 0}`, 'accent', 'recall 对齐')}
      ${kpiCard('规则', health.rules ?? health.rules_count ?? '—', '', `shadow ${gov.summary?.shadow ?? 0}`)}
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
    ${p0TasksHTML(d.tasks)}
    <section class="card"><div class="card-head"><h2 class="section-title">迭代 Phase</h2><button type="button" class="link-sm link-btn" data-goto="roadmap">完整路线 →</button></div>
      <div class="phase-timeline">${PHASES.map(p => `<div class="phase-node ${p.status}"><div class="phase-dot"></div><div class="phase-name">${esc(p.name)}</div><div class="phase-id">${esc(p.id)}</div></div>`).join('')}</div>
    </section>
    <section class="card"><div class="card-head"><h2 class="section-title">快捷入口</h2></div>
      <div class="docs-hub">
        <button type="button" class="doc-card accent" data-goto="bench"><span class="doc-card-title">AuditBench</span><span class="doc-card-desc">10 案卷回归 · G0 红线</span></button>
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
  const rows = bench.cases.map(c => `<tr>
    <td>${c.is_clean ? '🟢 干净' : '🔴 违规'}</td>
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
      <div class="bkpi"><div class="n">${bench.meta.avg_latency_ms}</div><div class="l">均时延 ms</div></div>
    </div>
    <div class="card" style="padding:0;overflow:auto;max-height:520px">
      <table class="bench-table"><thead><tr><th>类型</th><th>案卷</th><th class="num">疑点</th><th class="num">线索</th><th class="num">误报</th><th class="num">时延</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table>
    </div>
    <div class="action-row">
      <a class="action-btn" href="/" target="_blank">🛡 打开稽核工作台</a>
      <button class="action-btn secondary" type="button" onclick="navigate('yhf')">🔒 查看 YHF 门禁</button>
    </div>`;
}

function yhfViewHTML(yhf, bench) {
  const cases = (yhf.engine?.cases || []).map(c => `<tr class="${c.pass ? '' : 'warn'}">
    <td>${esc(c.case_id)}</td><td class="num">${c.found_suspected}</td><td>${c.is_clean ? '🟢' : '🔴'}</td>
    <td>${c.failures?.length ? esc(c.failures.join('; ')) : '✓'}</td>
  </tr>`).join('');
  return `
    <div class="doc-toolbar"><h2 style="margin:0">YHF 变更门禁</h2><span class="badge teal">Oracle · 零 governance 叠加</span></div>
    <div class="grid-2"><div class="gate-rings">${gateRingsHTML(yhf)}</div>
      <div class="mini-stats">
        ${kpiCard('G0', yhf.engine?.gates?.G0_clean_zero_fp ? 'PASS' : 'FAIL', yhf.engine?.gates?.G0_clean_zero_fp ? 'pass' : 'fail', '干净件零误报')}
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
    <div class="action-row"><a class="action-btn" href="/">🏥 打开工作台 · 机构画像</a></div>`;
}

function governanceViewHTML(gov) {
  const entries = gov.entries || [];
  const cards = entries.length ? entries.map(e => {
    const cls = e.status === 'shadow' ? '' : (e.status === 'deprecated' ? 'dep' : 'active');
    const hist = (e.history || []).slice(-2).map(h => `${h.from}→${h.to} (${h.by})`).join(' · ');
    return `<div class="gov-card ${cls}"><div class="rid">${esc(e.rule_id)} · ${esc(e.rule_name || '')}</div>
      <div class="meta">状态: <b>${esc(e.status)}</b>${hist ? ' · ' + esc(hist) : ''}</div></div>`;
  }).join('') : '<p class="muted">全部规则在役（active）— 无 shadow / deprecated 条目</p>';
  return `
    <div class="doc-toolbar"><h2 style="margin:0">规则治理三态</h2><span class="badge">${esc(gov.model || '')}</span></div>
    <div class="mini-stats" style="margin-bottom:16px">
      ${kpiCard('总数', gov.summary?.total_rules, '', '')}
      ${kpiCard('shadow', gov.summary?.shadow ?? 0, 'warn', '观察期')}
      ${kpiCard('deprecated', gov.summary?.deprecated ?? 0, '', '已下线')}
    </div>
    <div class="gov-list">${cards}</div>
    <div class="action-row"><a class="action-btn" href="/">🗂 打开工作台 · 规则治理</a></div>`;
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
  const doc = await loadDoc(docId);
  let extra = '';
  if (docId === 'roadmap') extra = `<section class="card" style="margin-top:16px"><div class="task-board">${await roadmapTasksPreviewHTML()}</div></section>`;
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

async function renderView(id) {
  const root = document.getElementById('dashContent');
  root.innerHTML = '<div class="card"><p class="muted">加载中…</p></div>';
  try {
    if (!cache.bench) await loadData();
    const item = NAV.find(n => n.id === id);
    let html = '';
    if (id === 'overview') html = overviewHTML(cache);
    else if (id === 'bench') html = benchViewHTML(cache.bench);
    else if (id === 'yhf') html = yhfViewHTML(cache.yhf, cache.bench);
    else if (id === 'institution') html = institutionViewHTML(cache.inst);
    else if (id === 'governance') html = governanceViewHTML(cache.gov);
    else if (id === 'docs') html = await docsHubHTML();
    else if (id === 'eval') {
      const [readme, status] = await Promise.all([loadDoc('eval'), fetchJSON('/api/eval/status')]);
      html = evalViewHTML(readme, status);
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
      html = await tasksBoardHTML();
      root.innerHTML = `<div class="view-panel active">${html}</div>`;
      bindTasksBoard(root);
      return;
    } else if (item?.doc) html = await docViewHTML(item.doc);
    else if (id === 'open_issues') html = await docViewHTML('open_issues');
    else html = '<div class="card"><p>未知视图</p></div>';
    root.innerHTML = `<div class="view-panel active">${html}</div>`;
    bindDocCards(root);
    bindExpandDoc(root);
  } catch (e) {
    root.innerHTML = `<div class="card"><p style="color:var(--red)">加载失败：${esc(e.message)}</p><p class="muted">请确认 node server.js 已从 prototype/app 启动</p></div>`;
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
  // #region agent log
  fetch('http://127.0.0.1:7664/ingest/82cc9e84-dfb6-4801-8348-532350165d81',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2726bf'},body:JSON.stringify({sessionId:'2726bf',location:'dashboard.js:refreshAll',message:'refreshAll',data:{currentView,editing:!!editing,tag:document.activeElement?.tagName},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
  // #endregion
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
  // #region agent log
  fetch('http://127.0.0.1:7664/ingest/82cc9e84-dfb6-4801-8348-532350165d81',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2726bf'},body:JSON.stringify({sessionId:'2726bf',location:'dashboard.js:navigateFromHash',message:'hash route',data:{hash,id,currentView,booted},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
  // #endregion
  if (!booted || id !== currentView) {
    booted = true;
    navigate(id);
  }
}

window.addEventListener('hashchange', navigateFromHash);
window.addEventListener('popstate', navigateFromHash);

navigateFromHash();
setInterval(refreshAll, 60000);
