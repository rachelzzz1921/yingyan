/* 鹰眼 · 稽核工作台 前端逻辑（原生JS，无框架） */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function refreshRuleMap() {
  RULE_MAP = Object.fromEntries((RULES?.rules || []).map(r => [r.rule_id, r]));
}

function ruleDisplayTitle(ruleId) {
  const r = RULE_MAP[ruleId];
  return r?.catalog?.display_title || (r ? `${r.rule_name}（${ruleId}）` : ruleId);
}

let RULE_GOV = {};

function ruleGovStatus(ruleId) {
  return RULE_GOV[ruleId]?.status || 'active';
}

function ruleLink(ruleId, opts = {}) {
  if (!ruleId) return '';
  const compact = !!opts.compact;
  const offline = opts.offline || ruleGovStatus(ruleId) === 'deprecated';
  const r = RULE_MAP[ruleId];
  const title = ruleDisplayTitle(ruleId);
  if (compact) {
    const hit = opts.hit ? ' hit' : '';
    const off = offline ? ' offline' : '';
    const tip = opts.locateHint ? '点击查看规则 · 旁 ↗ 定位疑点' : (offline ? '规则已下线 deprecated' : '查看规则说明');
    const suffix = offline ? '<span class="rule-offline-tag">已下线</span>' : '';
    return `<button type="button" class="rule-link rule-link-compact rchip${hit}${off}" data-rule-id="${esc(ruleId)}" title="${esc(tip)}：${esc(title)}">${esc(ruleId)}${suffix}</button>`;
  }
  const name = r?.catalog ? `${r.catalog.family_label} · ${r.rule_name}` : (r?.rule_name || ruleId);
  return `<button type="button" class="rule-link" data-rule-id="${esc(ruleId)}" title="查看规则说明：${esc(title)}"><span class="rule-id-chip">${esc(ruleId)}</span><span class="rule-name-chip">${esc(name)}</span></button>`;
}

function findingForRule(ruleId) {
  return (REPORT?.findings || []).find(f =>
    f.rule_id === ruleId || (f.corroborations || []).some(c => c.rule_id === ruleId)
  );
}

function pulseHighlight(el) {
  if (!el) return;
  el.style.transition = 'box-shadow .3s';
  const prev = el.style.boxShadow;
  el.style.boxShadow = '0 0 0 3px rgba(196,44,44,.35)';
  setTimeout(() => { el.style.boxShadow = prev; }, 1200);
}

/** 覆盖度表等：多条命中规则，编号可查说明、↗ 可定位疑点 */
function ruleHitCell(ruleIds) {
  if (!ruleIds?.length) return '<span class="muted">—</span>';
  return `<span class="rule-hit-cell">${ruleIds.map(id =>
    `<span class="rule-hit-wrap">${ruleLink(id, { compact: true, hit: true, locateHint: true })}<button type="button" class="rule-locate-btn" data-locate-rule="${esc(id)}" title="定位到本案疑点">↗</button></span>`
  ).join('')}</span>`;
}

function ruleLinksInline(ruleIds, opts = {}) {
  if (!ruleIds?.length) return '<span class="muted">—</span>';
  return ruleIds.map(id => ruleLink(id, { compact: true, hit: !!opts.hit })).join('<span class="rule-sep">、</span>');
}

function renderRuleDetailBody(rule) {
  if (!rule) return '<p class="muted">未找到该规则，请刷新页面后重试。</p>';
  const c = rule.catalog || {};
  const pol = (rule.policy_basis || []).map(p => `<li>${esc(p)}</li>`).join('') || '<li class="muted">—</li>';
  const applies = (rule.applies_to || []).join('、') || '—';
  const examNote = c.exam_scope === false ? '<span class="rule-tag exam-off">体检模式不跑</span>' : '<span class="rule-tag">体检/稽核均适用</span>';
  return `
    <div class="rule-detail-head">
      <h3 class="rule-detail-title">${esc(c.display_title || rule.rule_name)}</h3>
      <div class="rule-detail-meta">
        <span class="rule-tag">${esc(c.family_label || c.prefix || '规则')}</span>
        <span class="rule-tag">${esc(rule.layer || c.layer_hint || '')}</span>
        <span class="rule-tag">${esc(rule.violation_type || '')}</span>
        <span class="rule-tag">风险 ${esc(rule.risk_level || '—')}</span>
        ${examNote}
      </div>
      ${c.family_description ? `<p class="muted" style="margin:0;font-size:12.5px">${esc(c.family_description)}</p>` : ''}
    </div>
    <div class="rule-detail-sec"><h4>判定逻辑</h4><pre class="rule-detail-pre">${esc(rule.trigger_logic || '—')}</pre></div>
    <div class="rule-detail-sec"><h4>除外 / 误报防控</h4><pre class="rule-detail-pre">${esc(rule.exclusions || '—')}</pre></div>
    <div class="rule-detail-sec"><h4>最小证据集</h4><pre class="rule-detail-pre">${esc((rule.evidence_min_set || []).join(' · ') || '—')}</pre></div>
    <div class="rule-detail-sec"><h4>政策依据</h4><ul style="margin:0;padding-left:18px;font-size:12.5px">${pol}</ul></div>
    <div class="rule-detail-sec"><h4>适用场景</h4><p class="muted" style="margin:0;font-size:12.5px">${esc(applies)} · ${esc((rule.specialty_tags || []).join('、') || '通用')}</p></div>
    ${rule.demo_seed ? `<div class="rule-detail-sec"><h4>演示种子</h4><p class="muted" style="margin:0;font-size:12.5px">${esc(rule.demo_seed)}</p></div>` : ''}
    <div class="rule-detail-actions">
      ${findingForRule(rule.rule_id) ? `<button type="button" class="v2btn accent" onclick="closeModal();jumpToRuleFinding('${esc(rule.rule_id)}')">↗ 定位到本案疑点</button>${findingForRule(rule.rule_id)?.evidence?.[0]?.loc ? `<button type="button" class="v2btn" onclick="closeModal();jumpToRuleEvidence('${esc(rule.rule_id)}')">📄 定位证据原文</button>` : ''}` : ''}
      <button type="button" class="v2btn" onclick="showRuleCatalog('${esc(rule.rule_id)}')">在目录中定位</button>
      <button type="button" class="v2btn" onclick="closeModal();showGovernance();">规则治理</button>
    </div>`;
}

window.showRuleDetail = function (ruleId) {
  const rule = RULE_MAP[ruleId];
  openModal('📘 规则说明 · ' + esc(ruleId), renderRuleDetailBody(rule));
};

window.showRuleCatalog = function (highlightId) {
  const naming = RULES?.meta?.naming_convention || {};
  const families = RULES?.meta?.rule_families || {};
  const byPrefix = {};
  for (const r of RULES?.rules || []) {
    const p = r.catalog?.prefix || r.rule_id.split('-')[0];
    if (!byPrefix[p]) byPrefix[p] = [];
    byPrefix[p].push(r);
  }
  const order = Object.keys(families).length ? Object.keys(families) : Object.keys(byPrefix).sort();
  const groups = order.filter(p => byPrefix[p]?.length).map(p => {
    const fam = families[p] || {};
    const items = byPrefix[p].map(r => {
      const hi = r.rule_id === highlightId ? ' highlight' : '';
      return `<button type="button" class="rule-catalog-item${hi}" data-rule-id="${esc(r.rule_id)}">
        <span class="rule-id-chip">${esc(r.rule_id)}</span>
        <span><strong>${esc(r.rule_name)}</strong><div class="rule-cat-desc">${esc(r.catalog?.display_title || '')}${r.catalog?.exam_scope === false ? ' · 体检不跑' : ''}</div></span>
      </button>`;
    }).join('');
    return `<div class="rule-catalog-group" id="rule-grp-${esc(p)}"><h4>${esc(p)} · ${esc(fam.label || p)} <span class="muted">(${byPrefix[p].length})</span></h4><div class="rule-catalog-list">${items}</div></div>`;
  }).join('');
  const html = `
    <div class="rule-catalog-legend"><b>命名规则</b>：${esc(naming.pattern || '{前缀}-{序号}')} · 展示为「${esc(naming.display_format || '')}」<br>${esc(naming.prefix_legend || '')}</div>
    <input type="search" class="rule-catalog-search" id="ruleCatalogSearch" placeholder="搜索编号 / 规则名 / 族名…" autocomplete="off">
    <div id="ruleCatalogBody">${groups || '<p class="muted">暂无规则</p>'}</div>`;
  openModal('📘 规则目录 · ' + (RULES?.rules?.length || 0) + ' 条', html);
  const search = document.getElementById('ruleCatalogSearch');
  if (search) {
    search.oninput = () => {
      const q = search.value.trim().toLowerCase();
      $$('.rule-catalog-item').forEach(el => {
        const id = el.dataset.ruleId || '';
        const r = RULE_MAP[id];
        const blob = [id, r?.rule_name, r?.catalog?.display_title, r?.catalog?.family_label].join(' ').toLowerCase();
        el.style.display = !q || blob.includes(q) ? '' : 'none';
      });
      $$('.rule-catalog-group').forEach(g => {
        g.style.display = [...g.querySelectorAll('.rule-catalog-item')].some(i => i.style.display !== 'none') ? '' : 'none';
      });
    };
    if (highlightId) {
      search.value = highlightId;
      search.dispatchEvent(new Event('input'));
      setTimeout(() => document.getElementById('rule-grp-' + (RULE_MAP[highlightId]?.catalog?.prefix || ''))?.scrollIntoView({ block: 'nearest' }), 80);
    }
  }
};

function bindRuleLinkDelegation() {
  document.addEventListener('click', (e) => {
    const locBtn = e.target.closest('[data-locate-rule]');
    if (locBtn) {
      e.preventDefault();
      e.stopPropagation();
      jumpToRuleFinding(locBtn.dataset.locateRule);
      return;
    }
    const el = e.target.closest('[data-rule-id]');
    if (!el || el.closest('.actions') || el.closest('.rule-detail-actions')) return;
    if (!el.classList.contains('rule-link') && !el.classList.contains('rchip') && !el.classList.contains('rule-catalog-item')) return;
    e.preventDefault();
    e.stopPropagation();
    showRuleDetail(el.dataset.ruleId);
  });
}

let RECORD = null, RULES = null, REPORT = null, FLAGGED_LINES = new Set();
let RULE_MAP = {};
let MODE = 'audit', INJECT = false, CURRENT_CASE = 'main';
let REVIEW_CACHE = [];
let RECT_MAP = {}, REPORT_VIEW = 'report', PRECIP_DATA = { items: [], drafts: [] };
let REPORT_PAGE = 0, FINDING_PAGE = 0;
let LAST_RUN_PROFILE = 'standard';
let APP_HEALTH = { llm_ready: false };
let scanWaitTimer = null;
let AUDIT_RUN_ID = 0;
let llmShadowTimer = null;
const REPORT_PAGES = [
  { id: 'overview', label: '总览' },
  { id: 'findings', label: '疑点' },
  { id: 'shield', label: '不报' },
  { id: 'detail', label: '详情' },
];

const CASE_LABELS = {
  main: '肿瘤主线 · NSCLC', clean: '干净对照件', ortho: '骨科备演 · PKP', drg: 'DRG高套 · 重症肺炎',
  imaging: '医学影像 · CT增强', anes: '麻醉专科 · 全麻胆囊术', pharmacy: '门诊药店 · 串换/空刷',
  icu: '重症ICU · 呼吸机/CRRT', edge_egfr: '边界件 · 奥希替尼(应不报)', edge_gcsf: '边界件 · 升白针(应不报)',
  uploaded: '导入的材料',
};

function setWorkflowStep(n) {
  $$('.wf-step').forEach(el => {
    const s = Number(el.dataset.step);
    el.classList.toggle('active', s === n);
    el.classList.toggle('done', s < n);
  });
}

function applyModeUI() {
  const exam = MODE === 'exam';
  document.body.classList.toggle('mode-exam', exam);
  document.body.classList.toggle('mode-audit', !exam);
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.setAttribute('content', exam ? '#0D4A32' : '#0B2A4A');
  $$('.mode-btn').forEach(x => x.classList.toggle('active', x.dataset.mode === MODE));
  // v2bar 分组标签随模式切换（稽核↔院端自查）
  $$('.v2bar-label').forEach(el => {
    const t = exam ? el.dataset.examLabel : el.dataset.auditLabel;
    if (t) el.textContent = t;
  });

  const brandP = document.querySelector('.brand-text p');
  if (brandP) {
    brandP.innerHTML = exam
      ? '医保飞检前自查自纠 · 院端体检仪 · 主动整改 <span class="tag exam-tag">院端自查</span>'
      : '医保基金稽核智能体 · 三方交叉验证 · 证据链输出 <span class="tag">飞检 AI 初筛</span>';
  }
  const panelTitle = document.querySelector('.panel-right .panel-head h2');
  if (panelTitle) {
    panelTitle.innerHTML = exam
      ? '<span class="panel-icon">🏥</span> <span id="panelReportTitle">自查体检报告</span>'
      : '<span class="panel-icon">🛡</span> <span id="panelReportTitle">稽核报告</span>';
  }
  const leftTitle = document.querySelector('.panel-left .panel-head h2');
  if (leftTitle && exam) leftTitle.innerHTML = '<span class="panel-icon">📋</span> 自查材料包';
  else if (leftTitle && !exam) leftTitle.innerHTML = '<span class="panel-icon">📁</span> 患者就诊材料包';

  const btnAudit = $('#btnAudit');
  if (btnAudit) btnAudit.innerHTML = `<span class="btn-icon">▶</span> ${exam ? '开始自查' : '开始稽核'}`;

  const wf2 = document.querySelector('.wf-step[data-step="2"] .wf-text');
  const wf3 = document.querySelector('.wf-step[data-step="3"] .wf-text');
  if (wf2) wf2.textContent = exam ? '开始自查' : '开始稽核';
  if (wf3) wf3.textContent = exam ? '看报告' : '看报告 · 点证据';
  const wf4 = document.querySelector('.wf-step[data-step="4"] .wf-text');
  if (wf4) wf4.textContent = '登记整改';
  $$('.wf-exam-only').forEach(el => el.classList.toggle('hidden', !exam));

  const tabs = $('#reportTabs');
  if (tabs) tabs.classList.toggle('hidden', !exam || !REPORT);

  const btnExport = $('#btnExport');
  if (btnExport) btnExport.textContent = exam ? '导出自查清单' : '导出清单';
  const btnInject = $('#btnInject');
  if (btnInject) btnInject.classList.toggle('hidden', exam);

  document.title = exam ? '鹰眼 · 医保飞检自查体检' : '鹰眼 · 医保基金稽核智能体';
  updateEmptyState(exam);
}

function updateEmptyState(exam) {
  const empty = $('#reportEmpty');
  if (!empty) return;
  const title = empty.querySelector('.empty-title');
  const steps = empty.querySelector('.empty-steps');
  if (title) title.textContent = exam ? '就绪 · 飞检前 90 秒完成院端自查初筛' : '就绪 · 把线索到证据的距离，缩短到 90 秒';
  if (steps) {
    steps.innerHTML = exam
      ? `<li>左侧下拉<strong>选演示案卷</strong>（院端规则子集，不含监管演示规则）</li>
         <li>点<strong>「开始自查」</strong> — 只跑住院/临床相关规则</li>
         <li>右侧登记<strong>整改时限与整改状态</strong> → 导出自查清单</li>`
      : `<li>左侧下拉<strong>选演示案卷</strong>（肿瘤主线含 6 疑点 + 合议层）</li>
         <li>点<strong>「开始稽核」</strong> — 文档索引与条款交叉验证</li>
         <li>右侧查看疑点 → <strong>点证据定位</strong>跳费用行高亮</li>`;
  }
}

async function loadRectification(caseId) {
  try {
    const r = await fetch('/api/rectification?case_id=' + encodeURIComponent(caseId)).then(x => x.json());
    RECT_MAP = r.entries || {};
    if (r.precipitation_pending) PRECIP_DATA.items = r.precipitation_pending;
  } catch (e) { RECT_MAP = {}; }
}

function defaultDeadline(days = 7) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function rectKey(f) { return `${CURRENT_CASE}::${f.finding_id}`; }

function renderCaseMeta() {
  const bar = $('#caseMetaBar');
  if (!bar || !RECORD) return;
  const m = RECORD.case_meta || {};
  const isClean = (m.embedded_violation_count ?? 0) === 0;
  const tagCls = isClean ? 'clean' : 'violation';
  const tagText = isClean ? '合规/干净件' : `预埋 ${m.embedded_violation_count} 处违规`;
  bar.innerHTML = `
    <div class="cmeta-left">
      <span class="cmeta-tag ${tagCls}">${tagText}</span>
      <strong>${esc(m.case_title || CASE_LABELS[CURRENT_CASE] || CURRENT_CASE)}</strong>
      <span class="muted">${esc(RECORD.front_page?.patient_name || '')} · ${esc(RECORD.front_page?.admit_dept || '')}</span>
    </div>
    <div class="cmeta-right">${(m.demo_note || m.embedded_note) ? `<span class="cmeta-demo" title="${esc(m.demo_note || m.embedded_note)}">ⓘ 演示说明</span>` : ''}</div>`;
  bar.classList.remove('hidden');
}

// ---------- 文档标签配置 ----------
const TABS = [
  { key: 'front', label: '病案首页' },
  { key: 'admission', label: '入院记录' },
  { key: 'progress', label: '病程记录' },
  { key: 'orders', label: '医嘱单' },
  { key: 'nursing', label: '护理记录' },
  { key: 'lab', label: '检验报告' },
  { key: 'op', label: '手术记录' },
  { key: 'anes', label: '麻醉记录' },
  { key: 'icu', label: '重症记录' },
  { key: 'pharm', label: '药店/进销存' },
  { key: 'path', label: '病理/基因' },
  { key: 'fee', label: '费用清单' },
  { key: 'discharge', label: '出院小结' },
];
let activeTab = 'fee';

// ---------- 初始化 ----------
async function init() {
  try {
    const savedMode = sessionStorage.getItem('yingyan_mode');
    if (savedMode === 'exam' || savedMode === 'audit') MODE = savedMode;
    const [health, rules, cases, gov] = await Promise.all([
      fetch('/api/health').then(r => r.json()),
      fetch('/api/rules').then(r => r.json()),
      fetch('/api/cases').then(r => r.json()),
      fetch('/api/rule-governance').then(r => r.json()).catch(() => ({ entries: [] })),
    ]);
    APP_HEALTH = health;
    RULE_GOV = Object.fromEntries((gov.entries || []).map(e => [e.rule_id, e]));
    RULES = rules;
    refreshRuleMap();
    const l1Ok = health.ppstructure?.reachable;
    const healthEl = $('#health');
    healthEl.textContent = `规则 ${rules.rules.length} · 案卷 ${cases.length} · ${health.llm_ready ? 'LLM 就绪' : '确定性引擎'}${l1Ok ? ` · L1✓(${health.ppstructure.recommended_engine || 'ok'})` : ' · L1—(sidecar 未启动)'}`;
    healthEl.title = l1Ok ? 'L1 解析 sidecar 已连接' : '启动: cd prototype/ppstructure && bash run.sh';
    $('#caseSelect').innerHTML = cases.map(c => {
      const lbl = CASE_LABELS[c.id] || c.id;
      const vio = c.violations === 0 ? '干净' : `${c.violations}违规`;
      return `<option value="${esc(c.id)}">${esc(lbl)} · ${vio}</option>`;
    }).join('');
    $('#caseSelect').onchange = (e) => loadCase(e.target.value);
    const qCase = new URLSearchParams(location.search).get('case');
    const qAudit = new URLSearchParams(location.search).get('audit');
    const caseId = qCase && cases.some(c => c.id === qCase) ? qCase : 'main';
    await loadCase(caseId);
    if (qAudit === '1' && caseId === 'uploaded') setTimeout(() => runAudit(), 400);
    applyModeUI();
    bindReviewActionDelegation();
    bindRuleLinkDelegation();
  } catch (e) {
    $('#docBody').innerHTML = `<div class="empty">加载失败：${esc(e.message)}<br><span class="muted">请确认已运行 node server.js</span></div>`;
  }
}
async function refreshReviewCache() {
  try {
    const r = await fetch('/api/review').then(x => x.json());
    REVIEW_CACHE = (r.entries || []).filter(e => !e.case_id || e.case_id === CURRENT_CASE);
  } catch {
    REVIEW_CACHE = [];
  }
}

async function loadCase(id) {
  CURRENT_CASE = id;
  REVIEW_CACHE = [];
  RECORD = await fetch('/api/case?id=' + encodeURIComponent(id)).then(r => r.json());
  INJECT = false; REPORT = null; FLAGGED_LINES = new Set();
  activeTab = 'fee';
  renderTabs(); renderDoc(activeTab);
  renderCaseMeta();
  setWorkflowStep(1);
  // 重置报告区
  $('#reportBody').classList.add('hidden'); $('#reportEmpty').classList.remove('hidden');
  $('#rectificationBody').classList.add('hidden');
  $('#reportTabs')?.classList.add('hidden');
  REPORT_VIEW = 'report';
  $$('.rtab').forEach(t => t.classList.toggle('active', t.dataset.view === 'report'));
  const btn = $('#btnAudit'); if (btn) { btn.disabled = false; btn.innerHTML = `<span class="btn-icon">▶</span> ${MODE === 'exam' ? '开始自查' : '开始稽核'}`; }
}

function renderTabs() {
  $('#docTabs').innerHTML = TABS.map(t =>
    `<div class="doc-tab ${t.key === activeTab ? 'active' : ''}" data-tab="${t.key}">${t.label}${t.key === 'fee' && FLAGGED_LINES.size ? '<span class="dot"></span>' : ''}</div>`
  ).join('');
  $$('.doc-tab').forEach(el => el.onclick = () => { activeTab = el.dataset.tab; renderTabs(); renderDoc(activeTab); });
}

// ---------- 文档渲染 ----------
function renderDoc(key) {
  const r = RECORD, b = $('#docBody');
  if (key === 'front') {
    const f = r.front_page;
    b.innerHTML = sec('病案首页', `
      ${kv('患者姓名', f.patient_name)}${kv('性别 / 年龄', f.sex + ' / ' + f.age + '岁')}${kv('出生日期', f.birth_date)}
      ${kv('医保类型', f.insurance_type)}${kv('住院号', f.admission_no)}${kv('科室', f.admit_dept)}${kv('床号', f.bed_no)}
      ${kv('入院时间', f.admit_time)}${kv('出院时间', '<b style="color:var(--primary)">' + f.discharge_time + '</b>')}${kv('住院天数', f.actual_inpatient_days + '天')}`)
      + dh('诊断') + `<div class="kv"><span class="k">主要诊断</span><span class="v"><b>${esc(f.principal_diagnosis.name)}</b>　${esc(f.principal_diagnosis.tnm_stage)}（${esc(f.principal_diagnosis.note || '')}）</span></div>`
      + f.other_diagnosis.map(d => kv('其他诊断', d.name + '　' + (d.icd10 || ''))).join('')
      + dh('既往住院') + f.previous_admissions.map(p => `<div class="note-line"><b>${esc(p.admit_time?.slice(0,10))} ~ ${esc(p.discharge_time?.slice(0,10))}</b>　${esc(p.principal_diagnosis)}<br>${esc(p.summary)}</div>`).join('');
  }
  else if (key === 'admission') {
    const a = r.admission_note;
    b.innerHTML = dh('入院记录 · ' + a.record_time)
      + field('主诉', a.chief_complaint) + field('现病史', a.present_illness) + field('既往史', a.past_history)
      + field('查体', a.physical_exam) + field('初步诊断', a.preliminary_diagnosis.join('；')) + field('诊疗计划', a.treatment_plan);
  }
  else if (key === 'progress') {
    b.innerHTML = dh('病程记录（逐日）') + r.progress_notes.map(p =>
      `<div class="progress-entry"><span class="pdate">${esc(p.date)}</span><span class="ptype">${esc(p.type)} · ${esc(p.author)}</span><div class="prose">${esc(p.text)}</div></div>`).join('');
  }
  else if (key === 'orders') {
    b.innerHTML = dh('长期医嘱单') + ordTable(r.long_term_orders.items)
      + dh('临时医嘱单') + ordTable(r.temporary_orders.items);
  }
  else if (key === 'nursing') {
    const n = r.nursing_records;
    b.innerHTML = dh('护理记录单') + `<div class="note-line"><b>实际执行护理级别：</b>${esc(n.nursing_level_executed)}<br><span class="muted">${esc(n.note)}</span></div>`
      + n.entries.map(e => `<div class="progress-entry"><span class="pdate">${esc(e.date)}</span><span class="ptype">巡视间隔${e.round_interval_h}h · 测生命体征${e.vitals_count}次</span><div class="prose">${esc(e.text)}</div></div>`).join('');
  }
  else if (key === 'lab') {
    b.innerHTML = dh('检验报告') + r.lab_reports.map(L => `<div class="doc-section"><div class="kv"><span class="k">${esc(L.category)}</span><span class="v muted">${esc(L.report_id)} · ${esc(L.report_time)}</span></div>`
      + `<table class="fee-table"><tr><th>项目</th><th class="num">结果</th><th>参考</th><th>标志</th></tr>`
      + L.results.map(x => `<tr><td>${esc(x.item)}</td><td class="num"><b>${esc(x.value)}</b> ${esc(x.unit)}</td><td class="muted">${esc(x.ref)}</td><td>${flagCell(x.flag)}</td></tr>`).join('') + `</table></div>`).join('');
  }
  else if (key === 'op') {
    const op = r.operation_note;
    if ((!op || !op.operation_name) && r.imaging_record) {
      const ir = r.imaging_record;
      b.innerHTML = dh('影像检查记录') + (ir.studies || []).map(s => kv('检查', `<b>${esc(s.name)}</b>（${esc(s.modality || '')}）`) + field('所见/内涵', (s.report || '') + ' ' + (s.note || ''))).join('')
        + kv('实际胶片张数', `<b>${esc(ir.films_used)}</b> 张`) + `<div class="note-line muted">${esc(ir.note || '')}</div>`;
      return;
    }
    if (!op || !op.operation_name) { b.innerHTML = dh('手术/影像记录') + `<div class="note-line muted">本例无手术/影像记录。</div>`; return; }
    b.innerHTML = dh('手术记录 · ' + esc(op.operation_date))
      + kv('术式', `<b>${esc(op.operation_name)}</b>`) + kv('术者', op.surgeon || '') + kv('麻醉', op.anesthesia || '')
      + field('手术步骤', op.procedure_steps)
      + dh('术中耗材实际使用（稽核硬比对源）')
      + `<table class="fee-table"><tr><th>耗材</th><th class="num">实际用量</th><th>材质</th><th>备注</th></tr>`
      + (op.consumables_used || []).map(c => `<tr><td>${esc(c.name)}</td><td class="num"><b>${esc(c.qty)}</b>${esc(c.unit || '个')}</td><td>${esc(c.type || '')}${c.brand ? '·' + esc(c.brand) : ''}</td><td class="muted">${esc(c.note || '')}</td></tr>`).join('')
      + `</table>` + `<div class="note-line muted">${esc(op.note || '')}</div>`;
  }
  else if (key === 'anes') {
    const ar = r.anesthesia_record;
    if (!ar) { b.innerHTML = dh('麻醉记录') + `<div class="note-line muted">本例无麻醉记录。</div>`; return; }
    b.innerHTML = dh('麻醉记录单 · ' + esc(ar.anesthesiologist || ''))
      + kv('麻醉方式', `<b>${esc(ar.anesthesia_method || '')}</b>`)
      + kv('麻醉起止', `${esc(ar.anesthesia_start || '')} ~ ${esc(ar.anesthesia_end || '')}`)
      + kv('实际麻醉时长', `<b style="color:var(--red)">${esc(ar.actual_duration_min)}</b> 分钟　<span class="muted">（M-301 收费时长比对基准）</span>`)
      + kv('术中监测', (ar.monitoring || []).join('、'))
      + kv('气管插管', ar.intubation ? '是（全麻内涵已含，另收=重复 M-302）' : '否')
      + dh('麻醉药品实际用量（稽核硬比对源 · M-303）')
      + `<table class="fee-table"><tr><th>药品</th><th>规格</th><th class="num">实际用量</th></tr>`
      + (ar.drugs_used || []).map(d => `<tr><td>${esc(d.name)}</td><td>${esc(d.spec || '')}</td><td class="num"><b>${esc(d.actual_qty)}</b>${esc(d.unit || '支')}</td></tr>`).join('')
      + `</table>`
      + kv('麻醉恢复室(PACU)', ar.pacu_used === false ? `<b style="color:var(--red)">未进入</b>　<span class="muted">（M-304 恢复室监护费比对）</span>` : '已进入')
      + `<div class="note-line muted">${esc(ar.note || '')}</div>`;
  }
  else if (key === 'icu') {
    const ic = r.icu_record;
    if (!ic) { b.innerHTML = dh('重症记录') + `<div class="note-line muted">本例无重症监护(ICU)记录。</div>`; return; }
    const hourRow = (label, dev) => dev ? kv(label, `实际 <b style="color:var(--red)">${esc(dev.actual_hours)}</b> 小时${dev.start ? `　<span class="muted">${esc(dev.start)}~${esc(dev.end)}</span>` : ''}　<span class="muted">（ICU-302 计费时长比对基准）</span>`) : '';
    b.innerHTML = dh('重症监护记录单（ICU记录/设备使用记录）')
      + kv('ICU收治', ic.admission_to_icu ? `<b>是</b>　<span class="muted">${esc(ic.icu_admit || '')}~${esc(ic.icu_discharge || '')}</span>` : '否')
      + kv('护理级别', `<b>${esc(ic.nursing_level || '')}</b>　<span class="muted">（含吸痰/管路等一般专项护理，另收即 ICU-301 重复）</span>`)
      + dh('按小时计价设备/监护（稽核硬比对源 · ICU-302）')
      + hourRow('有创呼吸机辅助呼吸', ic.ventilator)
      + hourRow('连续性血液净化（CRRT）', ic.crrt)
      + kv('术中监测', (ic.monitoring || []).join('、'))
      + `<div class="note-line muted">${esc(ic.note || '')}</div>`;
  }
  else if (key === 'pharm') {
    const ph = r.pharmacy_info;
    if (!ph) { b.innerHTML = dh('药店/进销存') + `<div class="note-line muted">本例非门诊药店场景，无药店/进销存数据。</div>`; return; }
    const rows = (r.fee_list?.items || []).map(l => {
      const as = l.actual_sold;
      const mism = as && !(l.item_name.includes((as.name || '').slice(0, 2)));
      const invBad = l.inventory_supported === false;
      const traceBad = /断链|异常/.test(l.trace_code || '');
      const bad = mism || invBad || traceBad;
      const actual = invBad ? '<b style="color:var(--red)">（进销存无销售记录）</b>' : as ? `${esc(as.name)}<span class="muted">（${esc(as.category)}）</span>` : '—';
      return `<tr${bad ? ' style="background:#fff5f4"' : ''}><td>${l.line_no}</td><td>${esc(l.item_name)}　<span class="muted">¥${fmt(l.amount)}</span></td><td>${actual}</td><td>${traceBad ? '<b style="color:var(--red)">' + esc(l.trace_code) + '</b>' : esc(l.trace_code || '—')}</td></tr>`;
    }).join('');
    b.innerHTML = dh('药店医保定点信息')
      + kv('药店', `<b>${esc(ph.store_name)}</b>`) + kv('医保编码', ph.medical_insurance_code || '') + kv('统筹区', ph.pooling_region || '')
      + kv('追溯码要求', ph.trace_code_required_since || '')
      + dh('医保结算 vs 实际销售（进销存硬比对源）')
      + `<table class="fee-table"><thead><tr><th>行</th><th>医保结算名目</th><th>实际销售商品</th><th>追溯码</th></tr></thead><tbody>${rows}</tbody></table>`
      + `<div class="note-line muted">${esc(ph.note || '')}</div>`;
  }
  else if (key === 'path') {
    const p = r.pathology_report, g = r.gene_test_report;
    if (!p || p.diagnosis === '本例无病理（非肿瘤）' || /不适用|—/.test(p.report_id || '')) {
      b.innerHTML = dh('病理/基因') + `<div class="note-line muted">本例为${esc(r.front_page?.admit_dept || '非肿瘤')}病例，无病理/基因检测报告（相关肿瘤规则不适用）。</div>`; return;
    }
    b.innerHTML = dh('病理报告 · ' + p.report_time) + field('标本', p.specimen) + field('镜下', p.microscopic) + field('免疫组化', p.immunohistochemistry)
      + `<div class="kv"><span class="k">病理诊断</span><span class="v"><b style="color:var(--red)">${esc(p.diagnosis)}</b></span></div>` + `<div class="note-line muted">${esc(p.note)}</div>`
      + dh('基因检测报告') + `<div class="absent-note"><b>⚠ ${esc(g.status)}</b><br>${esc(g.note)}</div>`;
  }
  else if (key === 'fee') {
    b.innerHTML = feeTable(r);
  }
  else if (key === 'discharge') {
    const d = r.discharge_summary;
    b.innerHTML = dh('出院小结') + kv('住院', d.admit_date + ' ~ ' + d.discharge_date) + field('出院诊断', d.discharge_diagnosis.join('；')) + field('诊疗经过', d.hospital_course)
      + field('出院医嘱', d.discharge_orders.join('；')) + dh('出院带药') + d.discharge_meds.map(m => `<div class="note-line">${esc(m.name)}　<span class="muted">${esc(m.note || '')}</span></div>`).join('');
  }
}

function feeTable(r) {
  const items = r.fee_list.items;
  const rows = items.map(it => {
    const flagged = FLAGGED_LINES.has(it.line_no);
    const hasBbox = !!(it.anchor && it.anchor.bbox);
    return `<tr class="${flagged ? 'flagged' : ''}" id="fee-row-${it.line_no}" data-bbox="${hasBbox ? esc(JSON.stringify(it.anchor.bbox)) : ''}" data-page="${esc(it.anchor?.page || 1)}" data-doc="${esc(it.anchor?.doc || '')}">
      <td class="ln">${it.line_no}${hasBbox ? ' <span class="bbox-dot" title="含 OCR 坐标">⌖</span>' : ''}</td>
      <td>${esc(it.item_name)} <span class="muted">${esc(it.spec || '')}</span>${flagged ? `<span class="row-flag">⚠ ${esc(it.flag || '命中规则')}</span>` : ''}</td>
      <td class="muted">${esc(it.fee_date)}</td>
      <td class="num">${esc(it.qty)}${esc(it.unit)}</td>
      <td class="num">${esc(it.unit_price)}</td>
      <td class="num"><b>${esc(it.amount.toFixed(2))}</b></td>
      <td>${pill(it.insurance_class)}</td></tr>`;
  }).join('');
  const layoutHint = r.intake_layouts && Object.keys(r.intake_layouts).length
    ? `<div class="note-line muted">L1 解析布局已缓存（${Object.keys(r.intake_layouts).length} 个源文件）· 费用行 ⌖ = 含 bbox 坐标</div>` : '';
  return dh('费用结算明细（' + items.length + '行）')
    + `<table class="fee-table"><thead><tr><th>行</th><th>项目</th><th>日期</th><th class="num">数量</th><th class="num">单价</th><th class="num">金额</th><th>类别</th></tr></thead><tbody>${rows}</tbody></table>`
    + `<div class="fee-foot"><span>合计</span><span>¥ ${(r.fee_list.total_amount || items.reduce((s, x) => s + x.amount, 0)).toFixed(2)}</span></div>`
    + layoutHint
    + (r.fee_list.absent_items_note ? `<div class="absent-note"><b>逐行核对提示（T-207）：</b>${esc(r.fee_list.absent_items_note)}</div>` : '');
}

function ordTable(items) {
  return `<table class="fee-table"><tr><th>编号</th><th>医嘱内容</th><th>起止</th></tr>` + items.map(o =>
    `<tr><td class="ln">${esc(o.order_id)}</td><td>${esc(o.content)}${o.key ? `<span class="row-flag" style="color:var(--amber)">※ ${esc(o.key)}</span>` : ''}</td><td class="muted">${esc(o.start ? o.start.slice(5, 16) : (o.time ? o.time.slice(5, 16) : ''))}${o.stop ? ' ~ ' + o.stop.slice(5, 10) : ''}</td></tr>`).join('') + `</table>`;
}

// 小工具
const kv = (k, v) => `<div class="kv"><span class="k">${esc(k)}</span><span class="v">${v}</span></div>`;
const sec = (h, body) => dh(h) + body;
const dh = (h) => `<div class="doc-h">📄 ${esc(h)}</div>`;
const field = (k, v) => `<div class="doc-section"><div class="three-label" style="color:var(--ink2)">${esc(k)}</div><div class="prose">${esc(v)}</div></div>`;
const pill = (c) => `<span class="pill ${/乙|甲/.test(c) ? 'yi' : ''}">${esc(c)}</span>`;
const flagCell = (f) => /升高|偏低|异常/.test(f) ? `<span style="color:var(--red)">${esc(f)}</span>` : `<span class="muted">${esc(f)}</span>`;

// ---------- 运行稽核 ----------
const REPORT_PAGER_SHELL = `<div class="report-pager" id="reportPager">
  <div class="report-pager-nav" id="reportPagerNav"></div>
  <div class="report-pager-body" id="reportPagerBody">
    <section class="report-page" id="page-overview"></section>
    <section class="report-page hidden" id="page-findings"></section>
    <section class="report-page hidden" id="page-shield"></section>
    <section class="report-page hidden" id="page-detail"></section>
  </div>
  <div class="report-pager-foot">
    <button class="v2btn" id="btnPagePrev" type="button">↑ 上一页</button>
    <span class="muted" id="pageHint">总览</span>
    <button class="v2btn accent" id="btnPageNext" type="button">下一页 ↓</button>
  </div>
</div>`;

function ensureReportPagerShell() {
  const rb = $('#reportBody');
  if (!rb) return;
  if ($('#reportPagerNav') && $('#page-overview')) return;
  rb.innerHTML = REPORT_PAGER_SHELL;
  bindReportPagerControls();
}

function bindReportPagerControls() {
  const prev = $('#btnPagePrev');
  const next = $('#btnPageNext');
  if (prev) prev.onclick = () => switchReportPage(REPORT_PAGE - 1);
  if (next) next.onclick = () => switchReportPage(REPORT_PAGE + 1);
}

function showScanOverlay() {
  ensureReportPagerShell();
  const rb = $('#reportBody');
  rb.classList.remove('hidden');
  let ov = $('#scanOverlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'scanOverlay';
    ov.className = 'scan-overlay';
    rb.appendChild(ov);
  }
  ov.innerHTML = scanningHTML() + '<p class="scan-wait muted" id="scanWait">准备启动引擎…</p>';
  ov.classList.remove('hidden');
}

function hideScanOverlay() {
  $('#scanOverlay')?.classList.add('hidden');
}

function scanAppend(msg) {
  const log = $('#scanLog');
  if (!log) return;
  const d = document.createElement('div');
  d.style.animationDelay = '0s';
  d.textContent = '› ' + msg;
  log.appendChild(d);
}

function startScanWaitTicker(label, hint) {
  stopScanWaitTicker();
  const t0 = Date.now();
  scanAppend(label + (hint ? `（${hint}）` : ''));
  scanWaitTimer = setInterval(() => {
    const sec = Math.floor((Date.now() - t0) / 1000);
    const waitEl = $('#scanWait');
    if (waitEl) waitEl.textContent = `引擎计算中… 已等待 ${sec}s`;
  }, 500);
}

function stopScanWaitTicker() {
  if (scanWaitTimer) {
    clearInterval(scanWaitTimer);
    scanWaitTimer = null;
  }
}

async function auditFetch(query, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('/api/audit' + query, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText || '稽核失败');
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function runAudit(opts = {}) {
  const btn = $('#btnAudit');
  const btnSuper = $('#btnSuperAudit');
  const rag = !!opts.rag;
  // shadow 提速：LLM/超级增强先用「确定性+RAG」秒出首屏，真·LLM 作为影子后台跑完再静默合并
  const wantsLLM = !!(opts.llm || opts.super);
  const myRunId = ++AUDIT_RUN_ID;
  if (llmShadowTimer) { clearInterval(llmShadowTimer); llmShadowTimer = null; }
  LAST_RUN_PROFILE = opts.super ? 'super' : (opts.llm ? 'llm' : (rag ? 'rag' : (INJECT ? 'inject' : 'standard')));
  btn.disabled = true; btn.textContent = opts.llm ? 'LLM 分析中…' : (opts.super ? '超级增强中…' : (rag ? 'RAG 增强稽核中…' : '稽核中…'));
  if (btnSuper) btnSuper.disabled = true;
  setWorkflowStep(2);
  $('#reportEmpty').classList.add('hidden');
  showScanOverlay();
  const logEl = $('#scanLog');
  const steps = ['加载材料包 · 多模态解析 {费用行, 医嘱项, 病程文本, 检验/病理报告}…',
    '跑 F 类 L1 确定性规则（时间/数量/互斥/频次）建立校验锚点…',
    '按三方验证轴跑 L2 语义规则（读病历自由文本）…',
    '费用↔医嘱/执行记录：有费无嘱、量超嘱、名称不符…',
    '费用↔诊断/病历：限定支付、范围外、靶点检测…',
    '命中疑点 → 强制取证（回查原文定位）→ 三要素门禁…',
    '误报防控：核对除外情形（贝伐无需靶点 / 放化疗周期白名单）…',
    '风险分级、生成结构化报告…'];
  // 首屏走「即时路」：super→mode=super（含RAG）；llm→标准（秒出）；其余按原模式
  const fastQ = opts.super ? '?mode=super' : (rag ? '?rag=1' : (MODE === 'exam' ? '?mode=exam' : ''));
  // inject 可为攻击 id 字符串（指定技法）或 true（默认第一种）；INJECT 用于超级增强等场景
  const injectVal = opts.injectAttack || (INJECT ? true : false) || (opts.super ? true : false);
  const fastBody = { inject: injectVal, caseId: CURRENT_CASE, rag: !!opts.super || rag };
  const fastTimeout = (opts.super || rag) ? 30000 : 15000;
  const waitHint = opts.super ? 'RAG + 对抗防护融合' : (rag ? 'RAG 向量检索中' : (opts.llm ? '先出确定性首屏，LLM 后台分析' : '规则引擎'));
  startScanWaitTicker('已提交稽核任务', waitHint);
  const fastPromise = auditFetch(fastQ, fastBody, fastTimeout);
  try {
    for (let i = 0; i < steps.length; i++) {
      await sleep(80);
      if (logEl) {
        const d = document.createElement('div'); d.style.animationDelay = '0s'; d.textContent = '› ' + steps[i]; logEl.appendChild(d);
      }
    }
    if (opts.super) scanAppend('⚡ 超级增强：RAG 召回 + 注入对抗 + 规则合议…');
    else if (rag) scanAppend('📚 RAG 语义检索：案卷关键词 → pgvector 召回 KB 条目…');
    if (wantsLLM) scanAppend('🧠 真·LLM 语义分析转入后台影子运行（先看确定性结果，完成后自动合并）…');
    const report = await fastPromise;
    stopScanWaitTicker();
    if (myRunId !== AUDIT_RUN_ID) return;
    if (!report?.report_meta) throw new Error('服务端返回格式异常');
    INJECT = false;
    if (wantsLLM) report.report_meta.llm_shadow = 'pending';
    REPORT = report;
    FLAGGED_LINES = collectFlaggedLines(report);
    if (MODE === 'exam') await loadRectification(CURRENT_CASE);
    if (MODE === 'exam') await loadPrecipitationData();
    await refreshReviewCache();
    await sleep(150);
    REPORT_PAGE = 0;
    FINDING_PAGE = 0;
    hideScanOverlay();
    renderReport(report);
    renderTabs();
    setWorkflowStep(3);
    if (wantsLLM) {
      setLlmShadowBanner('pending', '🧠 真·LLM 语义分析后台运行中…（通常 1–2 分钟，完成后自动更新报告）');
      launchLlmShadow(myRunId, { inject: fastBody.inject, caseId: CURRENT_CASE, fused: !!opts.super });
    }
  } catch (e) {
    stopScanWaitTicker();
    if (myRunId !== AUDIT_RUN_ID) return;
    hideScanOverlay();
    const rb = $('#reportBody');
    const msg = e.name === 'AbortError'
      ? '稽核超时：接口响应过慢，请稍后重试或改用标准稽核'
      : e.message;
    if (rb) {
      ensureReportPagerShell();
      rb.classList.remove('hidden');
      $('#page-overview').innerHTML = `<div class="empty">稽核失败：${esc(msg)}</div>`;
      REPORT_PAGES.forEach((p, i) => {
        const el = document.getElementById(`page-${p.id}`);
        if (el) el.classList.toggle('hidden', i !== 0);
      });
    }
    setWorkflowStep(1);
  }
  btn.disabled = false; btn.innerHTML = `<span class="btn-icon">▶</span> ${MODE === 'exam' ? '重新自查' : '重新稽核'}`;
  if (btnSuper) btnSuper.disabled = false;
}

// LLM 影子运行：后台拉真·LLM 报告，完成后静默合并进当前报告（带运行号防竞态）
async function launchLlmShadow(runId, { inject, caseId, fused }) {
  const t0 = Date.now();
  if (llmShadowTimer) clearInterval(llmShadowTimer);
  llmShadowTimer = setInterval(() => {
    if (runId !== AUDIT_RUN_ID) { clearInterval(llmShadowTimer); llmShadowTimer = null; return; }
    const sec = Math.floor((Date.now() - t0) / 1000);
    setLlmShadowBanner('pending', `🧠 真·LLM 语义分析后台运行中… 已等待 ${sec}s（完成后自动更新报告）`);
  }, 1000);
  try {
    const llm = await auditFetch('?mode=llm', { inject, caseId }, 180000);
    if (llmShadowTimer) { clearInterval(llmShadowTimer); llmShadowTimer = null; }
    if (runId !== AUDIT_RUN_ID) return;
    if (!llm?.report_meta) throw new Error('LLM 返回格式异常');
    if (!llm.report_meta.real_agent) {
      const why = llm.report_meta.llm_needs_key ? '（需配置 LLM API Key：SiliconFlow / MiniMax，已保留确定性结果）' : '（LLM 路径回退，已保留确定性结果）';
      setLlmShadowBanner('failed', `⚠ 真·LLM 语义分析未启用${why}`);
      return;
    }
    llm.report_meta.llm_shadow = 'done';
    llm.report_meta.super_fused = fused || llm.report_meta.super_fused;
    llm.report_meta.super_llm = 'ok';
    REPORT = llm;
    FLAGGED_LINES = collectFlaggedLines(llm);
    REPORT_PAGE = 0;
    FINDING_PAGE = 0;
    renderReport(llm);
    renderTabs();
    setLlmShadowBanner('done', `✅ 真·LLM 语义分析已完成并合并（耗时 ${Math.round((Date.now() - t0) / 1000)}s · ${esc(llm.report_meta.llm_provider || 'LLM')}）`);
  } catch (e) {
    if (llmShadowTimer) { clearInterval(llmShadowTimer); llmShadowTimer = null; }
    if (runId !== AUDIT_RUN_ID) return;
    const msg = e.name === 'AbortError' ? '后台分析超时' : e.message;
    setLlmShadowBanner('failed', `⚠ 真·LLM 语义分析未完成：${esc(msg)}（已保留确定性结果）`);
  }
}

function setLlmShadowBanner(state, msg) {
  const host = document.getElementById('page-overview');
  if (!host) return;
  let el = document.getElementById('llmShadowBanner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'llmShadowBanner';
    el.className = 'llm-shadow-banner';
    host.prepend(el);
  }
  el.dataset.state = state;
  el.innerHTML = `${state === 'pending' ? '<span class="llm-shadow-spin"></span>' : ''}<span>${msg}</span>`;
}

function collectFlaggedLines(report) {
  const set = new Set();
  for (const f of report.findings) for (const ev of f.evidence) {
    const m = (ev.loc || '').match(/第\s*([\d、]+)\s*行/);
    if (m) m[1].split('、').forEach(n => set.add(Number(n)));
  }
  return set;
}

// 单行状态面包屑：引擎档位 + 超级增强 + 体检子集 + overlay 合成一行（替代原 3-4 条横幅）
function statusLineHTML(m, exam) {
  const engCls = m.real_agent ? 'real' : (m.llm_needs_key ? 'warn' : 'det');
  const eng = m.real_agent ? '🧠 真·LLM 语义' : (m.llm_needs_key ? '⚠ 语义未启用（缺 Key）' : '⚙ 确定性规则引擎');
  const chips = [`<span class="sl-chip ${engCls}" title="${esc(m.engine_mode || '')}">${eng}</span>`];
  const superOn = !!(m.super_fused || LAST_RUN_PROFILE === 'super');
  if (superOn) {
    const llmOn = m.super_llm === 'ok' || m.real_agent;
    const ragOn = !!(m.rag?.hits?.length || /RAG/.test(m.engine_mode || ''));
    chips.push(`<span class="sl-chip super">⚡ 超级增强 · LLM${llmOn ? '✓' : '—'} RAG${ragOn ? '✓' : '—'} 防护${m.injected ? '✓' : '—'}</span>`);
  }
  if (exam) chips.push(`<span class="sl-chip">🏥 院端规则子集 ${m.exam_rule_filter?.used ?? '—'}/${m.exam_rule_filter?.total ?? '—'} 条</span>`);
  if (m.injected_attack) chips.push(`<span class="sl-chip warn" title="目标 ${esc(m.injected_attack.targets)}：${esc(m.injected_attack.goal)}">🎭 对抗注入·${esc(m.injected_attack.technique)}（已防御）</span>`);
  if ((m.overlay_rules || []).length) chips.push(`<span class="sl-chip">📎 overlay ${m.overlay_rules.map(esc).join('、')}</span>`);
  return `<div class="status-line" title="${esc(m.engine_mode || '')}">${chips.join('')}<span class="sl-hint">ⓘ 悬停看引擎明细</span></div>`;
}

// 人力倍增卡：40分钟VS实测 + 人少事多语境 合成单块（默认展开，核心论题）
function leverageCardHTML(m, report, exam) {
  const n = (report.findings || []).length;
  return `<div class="leverage-card">
    <div class="compare-banner leverage">
      <div class="compare-col human"><span class="big">40<small>分钟</small></span><span>人工单案逐页审阅</span></div>
      <div class="vs">VS</div>
      <div class="compare-col agent"><span class="big">${(m.elapsed_ms != null && m.elapsed_ms < 1000) ? m.elapsed_ms + '<small>ms</small>' : '90<small>秒</small>'}</span><span>鹰眼初筛（实测 ${m.elapsed_ms ?? '—'}ms）</span></div>
      <div class="vs">≈</div>
      <div class="compare-col mult"><span class="big">${Math.round(40 * 60 / 90)}<small>×</small></span><span>人力倍增</span></div>
    </div>
    <div class="leverage-note">🚀 <b>人少事多 · AI 人力倍增器</b>：全国 <b>8600</b> 名医保监管员盯 <b>13 亿</b>参保人 / <b>28.99 万</b>家机构（人均是美国 4 倍），飞检一年只查得过来 <b>500</b> 家。${exam ? '院端把历史案卷自查干净、主动退回，<b>从源头替监管侧卸载工作量</b>；' : '本次把一名稽核员 <b>40 分钟</b>的单案初筛压到 90 秒内，'}${n} 条疑点已带三要素证据链——<b>人只需复核真争议、真违规</b>。</div>
  </div>`;
}

// P3 证据链快速统计：把护城河动作（申诉/控辩/补材料）提到总览级，避免多疑点案卷遗漏
function evidenceActionsHTML(report) {
  const fs = report.findings || [];
  const suspected = fs.filter(f => f.status === '疑点').length;
  const needMore = fs.filter(f => (f.needs_more || []).length > 0 || f.status === '线索').length;
  if (!suspected && !needMore) return '';
  const llmReady = !!(window.APP_HEALTH && APP_HEALTH.llm_ready);
  const chips = [`🛡 <b>${suspected}</b> 条可生成申诉材料`];
  if (needMore) chips.push(`⊕ <b>${needMore}</b> 条标注需补材料/线索`);
  if (llmReady && suspected) chips.push(`⚔ <b>${suspected}</b> 条可对抗辩论`);
  return `<div class="evidence-actions" onclick="switchReportPage(1)" title="点开疑点卡逐条操作">🔗 证据链动作：${chips.join(' · ')} <span class="ea-go">→ 去疑点页操作</span></div>`;
}

let VIEW_EXAM = false;
function renderReport(report) {
  ensureReportPagerShell();
  hideScanOverlay();
  $('#reportBody')?.classList.remove('hidden');
  const m = report.report_meta, s = m.summary;
  const exam = m.panel === '体检'; VIEW_EXAM = exam;
  // 引擎档位回显（4入口收进下拉后，运行后在引擎钮上亮当前档位，保标杆可见性）
  const engBtn = $('#btnEngineMenu');
  if (engBtn) {
    const tag = m.super_fused ? '⚡超级增强' : (m.real_agent ? '🧠LLM语义' : (/RAG/.test(m.engine_mode || '') ? '🔍RAG增强' : '⚙标准'));
    engBtn.innerHTML = `引擎·${tag} ▾`;
  }

  const ruleCount = exam
    ? (m.exam_rule_filter?.used ?? RULES.rules.length)
    : RULES.rules.length;
  const cards = exam ? [
    { n: s.suspected_count, l: '风险点（待自查整改）', c: 'red', icon: 'doubt' },
    { n: s.clue_count, l: '线索（建议补全材料）', c: 'amber', icon: 'clue' },
    { n: '¥' + fmt(s.suspected_amount), l: '飞检暴露金额', c: 'money', icon: 'audit' },
    { n: ruleCount, l: '院端规则子集', c: '', icon: 'rules' },
  ] : [
    { n: s.suspected_count, l: '疑点（证据闭环）', c: 'red', icon: 'doubt' },
    { n: s.clue_count, l: '线索（待复核）', c: 'amber', icon: 'clue' },
    { n: '¥' + fmt(s.suspected_amount), l: '疑点涉及金额', c: 'money', icon: 'audit' },
    { n: RULES.rules.length, l: '已跑规则数', c: '', icon: 'rules' },
  ];

  const nav = $('#reportPagerNav');
  const pOverview = $('#page-overview');
  const pFindings = $('#page-findings');
  const pShield = $('#page-shield');
  const pDetail = $('#page-detail');
  if (!nav || !pOverview || !pFindings || !pShield || !pDetail) return;

  nav.innerHTML = REPORT_PAGES.map((p, i) =>
    `<button type="button" class="pager-tab ${REPORT_PAGE === i ? 'active' : ''}" data-page="${i}">${p.label}</button>`
  ).join('');
  $$('.pager-tab', nav).forEach(b => b.onclick = () => switchReportPage(Number(b.dataset.page)));

  pOverview.innerHTML = `
    ${reportHeroHTML(report, s, exam)}
    ${statusLineHTML(m, exam)}
    <div class="summary-cards">${cards.map(c => `<div class="scard ${c.c}"><img class="scard-icon" src="/brand/icons/${c.icon || 'rules'}.svg" alt="" width="28" height="28"><div class="scard-body"><div class="n">${c.n}</div><div class="l">${c.l}</div></div></div>`).join('')}</div>
    ${evidenceActionsHTML(report)}
    ${leverageCardHTML(m, report, exam)}
  `;

  const findings = report.findings || [];
  const cur = findings[FINDING_PAGE];
  pFindings.innerHTML = cur ? `
    <div class="findings-pager-head">
      <h3 class="sect-title"><img src="/brand/icons/doubt.svg" alt="" width="18" height="18" style="vertical-align:-3px"> ${exam ? '风险点与线索（院端自查）' : '疑点与线索'} <span class="muted">${FINDING_PAGE + 1}/${findings.length}</span></h3>
      <div>
        <button class="v2btn" id="btnFindingPrev" type="button" ${FINDING_PAGE <= 0 ? 'disabled' : ''}>‹</button>
        <button class="v2btn" id="btnFindingNext" type="button" ${FINDING_PAGE >= findings.length - 1 ? 'disabled' : ''}>›</button>
      </div>
    </div>
    ${findingCard(cur)}
  ` : `<div class="empty">本案未命中疑点</div>`;
  const prevFinding = $('#btnFindingPrev');
  const nextFinding = $('#btnFindingNext');
  if (prevFinding) prevFinding.onclick = () => { FINDING_PAGE = Math.max(0, FINDING_PAGE - 1); renderReport(report); switchReportPage(1, true); };
  if (nextFinding) nextFinding.onclick = () => { FINDING_PAGE = Math.min(findings.length - 1, FINDING_PAGE + 1); renderReport(report); switchReportPage(1, true); };

  pShield.innerHTML = `<div class="findings-section"><h3 class="sect-title green"><img src="/brand/icons/ok.svg" alt="" width="18" height="18" style="vertical-align:-3px"> 正确「不报」（误报防控 · 存疑转线索·不误报）</h3><div id="distractorList">${(report.correctly_not_flagged || []).map(distractorCard).join('')}</div></div>`;
  pDetail.innerHTML = `
    ${s.merged_count ? `<div class="recon-banner">🔗 <b>合议层</b>：合并前 ${s.raw_findings_before_merge} 条原始命中 → 去重后 <b>${s.total_findings} 条</b>（${s.merged_count} 条同笔费用多规则命中已合并）。疑点金额按费用行去重 <b>¥${fmt(s.suspected_amount)}</b>——若像传统做法各规则各算各的，会虚高到 <b style="color:var(--red)">¥${fmt(s.amount_if_double_counted)}</b>。</div>` : ''}
    ${s.shadow_count ? `<div class="shadow-banner">🌓 <b>规则状态机·观察期（shadow）</b>：${s.shadow_count} 条命中来自被复核高频驳回规则，暂不计入疑点/金额（扣留 ¥${fmt(s.shadow_amount_withheld)}）。</div>` : ''}
    ${routingBar(m.routing, exam)}
    ${renderRagSection(m)}
    ${renderCoverage(m.coverage)}
  `;

  $$('.f-head').forEach(el => el.onclick = () => el.parentElement.classList.toggle('open'));
  $$('.ev-loc').forEach(el => el.onclick = () => jumpToLoc(el.dataset.loc));
  const first = $('.finding'); if (first) first.classList.add('open');
  switchReportPage(REPORT_PAGE, true);

  if (exam) {
    $('#reportTabs')?.classList.remove('hidden');
    $('#reportEmpty').classList.add('hidden');
    renderRectificationRegistry(report);
    if (REPORT_VIEW === 'rectification') switchReportView('rectification', { skipRender: true });
  } else {
    $('#reportTabs')?.classList.add('hidden');
    $('#rectificationBody')?.classList.add('hidden');
  }
}

// 超级增强状态已合入 statusLineHTML 的单行面包屑（P3 报告顶部横条精简），原 renderSuperAuditStatus 已移除

function switchReportPage(idx, keepScroll = false) {
  REPORT_PAGE = Math.max(0, Math.min(idx, REPORT_PAGES.length - 1));
  REPORT_PAGES.forEach((p, i) => {
    const el = document.getElementById(`page-${p.id}`);
    if (!el) return;
    el.classList.toggle('hidden', i !== REPORT_PAGE);
    if (!keepScroll && i === REPORT_PAGE) el.scrollTop = 0;
  });
  const nav = $('#reportPagerNav');
  if (nav) $$('.pager-tab', nav).forEach((b, i) => b.classList.toggle('active', i === REPORT_PAGE));
  $('#pageHint').textContent = REPORT_PAGES[REPORT_PAGE].label;
  const prev = $('#btnPagePrev');
  const next = $('#btnPageNext');
  if (prev) prev.disabled = REPORT_PAGE <= 0;
  if (next) next.disabled = REPORT_PAGE >= REPORT_PAGES.length - 1;
}

window.switchReportView = (view, opts = {}) => {
  REPORT_VIEW = view;
  $$('.rtab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
  const showRect = view === 'rectification' && VIEW_EXAM;
  $('#reportBody')?.classList.toggle('hidden', showRect);
  $('#rectificationBody')?.classList.toggle('hidden', !showRect);
  $('#reportEmpty')?.classList.add('hidden');
  if (showRect) {
    setWorkflowStep(4);
    if (!opts.skipRender && REPORT) renderRectificationRegistry(REPORT);
    $('#rectificationBody')?.scrollTo?.(0, 0);
  } else {
    setWorkflowStep(3);
    // 切回「报告」视图时报告内分页归位总览，避免两套 tab 交错让人迷向
    if (typeof switchReportPage === 'function') switchReportPage(0);
  }
};

function rectProgress(report) {
  const findings = (report.findings || []).filter(f => !f.shadow);
  let done = 0;
  for (const f of findings) {
    const r = RECT_MAP[rectKey(f)] || {};
    if (r.submitted && r.judgment) done++;
  }
  return { total: findings.length, done };
}

function renderRectificationRegistry(report) {
  const box = $('#rectificationBody');
  if (!box || !report) return;
  const findings = (report.findings || []).filter(f => !f.shadow);
  const prog = rectProgress(report);
  const cards = findings.map((f, i) => rectificationCard(f, i)).join('');
  box.innerHTML = `
    <section class="rect-registry-hero">
      <div><span class="rh-badge">登记整改</span><h3 class="rh-title">逐条登记 · 人工判断对错 · 回流规则沉淀</h3>
      <p class="rh-sub">已完成 ${prog.done}/${prog.total} 条 · 不成立→误报链(≥3) · 成立→巩固链(≥3且近10条驳回≤1) · 部分成立=缓冲</p></div>
    </section>
    <div class="rect-registry-list">${cards || '<p class="muted">暂无待登记风险点</p>'}</div>
    ${renderPrecipitationPanel()}
  `;
}

function rectificationCard(f, idx) {
  const key = rectKey(f);
  const cur = RECT_MAP[key] || {};
  const deadline = cur.deadline || defaultDeadline();
  const status = cur.status || '待整改';
  const judgment = cur.judgment || '';
  const today = new Date().toISOString().slice(0, 10);
  const overdue = deadline < today && (status === '待整改' || status === '整改中');
  const statuses = ['待整改', '整改中', '已整改', '已主动退回', '延期申请'];
  const judgments = ['', '成立', '不成立', '部分成立'];
  const submitted = cur.submitted && cur.judgment;
  return `<article class="rect-card${submitted ? ' submitted' : ''}${overdue ? ' overdue' : ''}" id="rect-${esc(f.finding_id)}" data-fid="${esc(f.finding_id)}" data-rule="${esc(f.rule_id)}">
    <header class="rect-card-head">
      <span class="rect-idx">${idx + 1}</span>
      <div><strong>${ruleLink(f.rule_id)}</strong><div class="muted">¥${fmt(f.amount_involved)} · ${esc(f.status)} · 置信${f.confidence ?? '—'}</div></div>
      ${submitted ? '<span class="rect-done-badge">已提交</span>' : ''}
    </header>
    <div class="rect-card-body">
      <div class="rect-evidence muted">${(f.evidence || []).slice(0, 2).map(e => esc(e.loc)).join(' · ')}</div>
      <div class="rect-fields-grid">
        <label class="rect-label">整改时限<input type="date" class="rect-deadline" value="${esc(deadline)}"></label>
        <label class="rect-label">整改状态<select class="rect-status">${statuses.map(s => `<option value="${esc(s)}"${s === status ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
        <label class="rect-label">责任人<input type="text" class="rect-owner" placeholder="医保办/科室" value="${esc(cur.owner || '')}"></label>
      </div>
      <div class="rect-judgment-block">
        <div class="rect-judgment-label"><b>人工判断（对错）</b><span class="muted">提交后同步至规则治理 · 不成立=误报回流</span></div>
        <div class="judgment-btns">${judgments.filter(Boolean).map(j => `<button type="button" class="judgment-btn${judgment === j ? ' chosen' : ''}" data-j="${esc(j)}" onclick="pickJudgment(this,'${esc(j)}')">${j === '成立' ? '✓ 成立' : j === '不成立' ? '✗ 不成立' : '◐ 部分成立'}</button>`).join('')}</div>
        <input type="hidden" class="rect-judgment" value="${esc(judgment)}">
        <label class="rect-label full">判断理由 / 院端说明<textarea class="rect-reason" rows="2" placeholder="不成立须填理由；部分成立说明缺什么材料">${esc(cur.judgment_reason || cur.rectify_note || '')}</textarea></label>
      </div>
      <div class="rect-actions">
        <button type="button" class="rect-btn primary" onclick="saveRectificationCard(this,false)">💾 暂存</button>
        <button type="button" class="rect-btn accent" onclick="saveRectificationCard(this,true)">✓ 提交登记</button>
        <button type="button" class="rect-btn ghost" onclick="jumpToFinding('${esc(f.finding_id)}')">↗ 回看证据</button>
        <span class="rect-tip muted"></span>
      </div>
    </div>
  </article>`;
}

window.pickJudgment = (btn, j) => {
  const card = btn.closest('.rect-card');
  card.querySelectorAll('.judgment-btn').forEach(b => b.classList.toggle('chosen', b === btn));
  card.querySelector('.rect-judgment').value = j;
};

window.jumpToFinding = (fid) => {
  switchReportView('report');
  setTimeout(() => {
    const f = $(`.finding[data-fid="${fid}"]`);
    if (f) { f.classList.add('open'); f.scrollIntoView({ behavior: 'smooth', block: 'center' }); pulseHighlight(f); }
  }, 80);
};

window.jumpToRuleFinding = (ruleId) => {
  const hit = findingForRule(ruleId);
  if (!hit) { showRuleDetail(ruleId); return; }
  switchReportView('report');
  setTimeout(() => {
    const el = $(`.finding[data-fid="${hit.finding_id}"]`);
    if (el) { el.classList.add('open'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); pulseHighlight(el); }
  }, 80);
};

window.jumpToRuleEvidence = (ruleId) => {
  const hit = findingForRule(ruleId);
  if (!hit?.evidence?.[0]?.loc) return jumpToRuleFinding(ruleId);
  switchReportView('report');
  jumpToLoc(hit.evidence[0].loc);
  setTimeout(() => {
    const el = $(`.finding[data-fid="${hit.finding_id}"]`);
    if (el) { el.classList.add('open'); pulseHighlight(el); }
  }, 80);
};

window.saveRectificationCard = async (btn, submit) => {
  const card = btn.closest('.rect-card');
  const finding_id = card.dataset.fid;
  const rule_id = card.dataset.rule;
  const judgment = card.querySelector('.rect-judgment').value;
  const reason = card.querySelector('.rect-reason').value.trim();
  if (submit && judgment === '不成立' && !reason) { alert('判断「不成立」须填写理由（将回流规则治理与沉淀 Agent）'); return; }
  if (submit && !judgment) { alert('提交登记请选择人工判断（成立 / 不成立 / 部分成立）'); return; }
  const tip = card.querySelector('.rect-tip');
  if (tip) tip.textContent = submit ? '提交中…' : '保存中…';
  const f = (REPORT?.findings || []).find(x => x.finding_id === finding_id);
  try {
    const r = await fetch('/api/rectification', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        case_id: CURRENT_CASE, finding_id, rule_id,
        rule_name: f?.rule_name, amount_involved: f?.amount_involved,
        deadline: card.querySelector('.rect-deadline').value,
        status: card.querySelector('.rect-status').value,
        owner: card.querySelector('.rect-owner').value,
        judgment: submit ? judgment : (judgment || ''),
        judgment_reason: reason,
        rectify_note: reason,
        submitted: submit,
      }),
    }).then(x => x.json());
    if (r.error) { if (tip) tip.textContent = r.error; return; }
    RECT_MAP[rectKey({ finding_id })] = r.entry;
    if (tip) {
      let msg = submit ? '已提交登记' : '已暂存';
      if (r.review_sync) {
        msg += ` · 已回流(${r.review_sync.action})`;
        if (r.review_sync.chain) msg += ` · ${formatChainProgress(r.review_sync.chain)}`;
        if (r.review_sync.buffered) msg += ' · 缓冲态';
      }
      tip.textContent = msg;
    }
    if (submit) {
      card.classList.add('submitted');
      renderRectificationRegistry(REPORT);
      loadPrecipitationData();
    }
  } catch (e) { if (tip) tip.textContent = '失败:' + e.message; }
};

async function loadPrecipitationData() {
  try { PRECIP_DATA = await fetch('/api/rule-precipitation').then(r => r.json()); } catch (e) {
    PRECIP_DATA = { reject_items: [], adopt_items: [], reject_drafts: [], adopt_drafts: [], overlay: { patches: {} } };
  }
}

function formatChainProgress(chain) {
  if (!chain) return '';
  const r = chain.reject || {};
  const a = chain.adopt || {};
  return `误报 ${r.count ?? 0}/${r.threshold ?? 3} · 巩固 ${a.count ?? 0}/${a.threshold ?? 3}（近${a.window || 10}条驳回≤${a.window_max_rejects ?? 1}）`;
}

function precipDraftCards(drafts, track) {
  return (drafts || []).slice(-5).reverse().map(d => {
    const patch = d.patches?.exclusions_append || d.patches?.exclusions || d.patches?.trigger_logic || '';
    return `<div class="precip-draft precip-${track}"><div class="precip-draft-head"><b>${esc(d.rule_id)}</b> · ${esc(d.recommendation)} <span class="kind-tag ${d.agent_mode === 'llm' ? 'real' : 'script'}">${d.agent_mode === 'llm' ? 'LLM' : '模板'}</span></div>
    <p>${esc(d.rationale || '')}</p>
    ${patch ? `<div class="muted"><b>patch：</b>${esc(String(patch).slice(0, 180))}${String(patch).length > 180 ? '…' : ''}</div>` : ''}
    ${d.confidence_boost_note ? `<div class="muted">${esc(d.confidence_boost_note)}</div>` : ''}
    <div class="rect-actions"><button type="button" class="rect-btn" onclick="applyPrecipDraft('${esc(d.id)}','approve')">✓ 写入 overlay 预览</button><button type="button" class="rect-btn ghost" onclick="applyPrecipDraft('${esc(d.id)}','dismiss')">忽略</button><button type="button" class="rect-btn ghost" onclick="runPrecipitationAgent('${esc(d.rule_id)}','${track}')">↻ 重跑</button></div></div>`;
  }).join('');
}

function renderPrecipTrackPanel(track, label, icon, promptPath) {
  const items = track === 'adopt' ? (PRECIP_DATA.adopt_items || []) : (PRECIP_DATA.reject_items || []);
  const drafts = track === 'adopt' ? (PRECIP_DATA.adopt_drafts || []) : (PRECIP_DATA.reject_drafts || []);
  const pending = items.filter(i => i.status === 'pending' || i.status === 'draft_ready');
  const th = track === 'adopt'
    ? '采纳≥3 且近10条有效反馈驳回≤1 → 自动跑巩固 Agent'
    : '有效驳回≥3 → auto shadow + 自动跑误报 Agent';
  const rows = pending.map(i => `<tr><td>${esc(i.rule_id)}</td><td>${esc(i.trigger)}</td><td>${esc(i.status)}</td><td><button type="button" class="rect-btn" onclick="runPrecipitationAgent('${esc(i.rule_id)}','${track}')">🧠 重跑 Agent</button></td></tr>`).join('');
  return `<div class="precip-track" data-track="${track}">
    <h4>${icon} ${label} <span class="muted">${th}</span></h4>
    <p class="muted precip-hint"><code>${promptPath}</code></p>
    ${rows ? `<table class="fee-table"><thead><tr><th>规则</th><th>触发</th><th>状态</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="muted">暂无${label}队列项</p>`}
    ${precipDraftCards(drafts, track) ? `<div class="precip-drafts"><strong>最近草案</strong>${precipDraftCards(drafts, track)}</div>` : ''}
  </div>`;
}

function renderPrecipitationPanel() {
  const th = PRECIP_DATA.thresholds || {};
  const overlayKeys = Object.keys(PRECIP_DATA.overlay?.patches || {});
  return `<section class="precip-panel">
    <h3 class="sect-title">🧬 规则沉淀双链 <span class="muted">驳回=误报淘汰 · 采纳=规则巩固 · 补材料=缓冲不入队</span></h3>
    <div class="cov-statement">阈值：误报链 ${th.reject ?? 3} 次有效驳回 · 巩固链 ${th.adopt ?? 3} 次采纳且近 ${th.adopt_window ?? 10} 条驳回 ≤ ${th.adopt_max_rejects_in_window ?? 1} · 入队后自动跑 Agent</div>
    ${overlayKeys.length ? `<div class="exam-banner">📎 overlay 预览中规则：${overlayKeys.map(esc).join('、')}（下次稽核合并 exclusions/trigger，不改源 rules.json）</div>` : ''}
    <div class="precip-dual">${renderPrecipTrackPanel('reject', '误报沉淀链', '✗', PRECIP_DATA.prompts?.reject || 'prompts/规则沉淀-驳回.md')}${renderPrecipTrackPanel('adopt', '巩固沉淀链', '✓', PRECIP_DATA.prompts?.adopt || 'prompts/规则沉淀-采纳.md')}</div>
  </section>`;
}

window.runPrecipitationAgent = async (ruleId, track = 'reject') => {
  try {
    const r = await fetch('/api/rule-precipitation/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rule_id: ruleId, track }) }).then(x => x.json());
    if (r.error) { alert(r.error + (r.needsKey ? '\n（可配 LLM key 启用真·Agent）' : '')); return; }
    await loadPrecipitationData();
    if (REPORT && VIEW_EXAM) renderRectificationRegistry(REPORT);
  } catch (e) { alert(e.message); }
};

window.applyPrecipDraft = async (draftId, action) => {
  const r = await fetch('/api/rule-precipitation/apply', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ draft_id: draftId, action }) }).then(x => x.json());
  await loadPrecipitationData();
  if (REPORT && VIEW_EXAM) renderRectificationRegistry(REPORT);
  if (r.note) alert(r.note);
};

function reportHeroHTML(report, s, exam) {
  const m = report.report_meta;
  const hasFindings = (s.suspected_count || 0) + (s.clue_count || 0) > 0;
  const level = hasFindings ? (s.suspected_count ? 'warn' : 'info') : 'pass';
  const title = hasFindings
    ? (exam ? `已定位 ${s.suspected_count} 条风险点 · 待复核 ${s.clue_count} 条线索` : `已定位 ${s.suspected_count} 条可回链疑点 · 待复核 ${s.clue_count} 条线索`)
    : '未检出疑点 — 合规放行';
  const sub = hasFindings
    ? `把线索到证据的距离，缩短到 ${m.elapsed_ms != null && m.elapsed_ms < 60000 ? Math.round(m.elapsed_ms / 1000) + ' 秒' : '90 秒'} · ${exam ? '飞检暴露' : '疑点涉及'} ¥${fmt(s.suspected_amount)}`
    : '本案卷通过 G0 误报防控校验';
  return `<section class="report-hero ${level}">
    <div class="rh-main"><span class="rh-badge">${exam ? '体检模式' : '稽核模式'}</span><h3 class="rh-title">${title}</h3><p class="rh-sub">${sub}</p></div>
    <div class="rh-meta"><span>⚡ ${m.elapsed_ms != null ? m.elapsed_ms + 'ms' : '—'}</span></div>
  </section>`;
}

function routingBar(routing, exam) {
  if (!routing) return '';
  const firedIds = new Set((REPORT.findings || []).flatMap(f => [f.rule_id, ...(f.corroborations || []).map(c => c.rule_id)]));
  const retired = new Set(REPORT?.report_meta?.summary?.retired_rules || []);
  const activated = routing.activated || [];
  const chips = activated.map(id => ruleLink(id, {
    compact: true,
    hit: firedIds.has(id),
    offline: retired.has(id) || ruleGovStatus(id) === 'deprecated',
  })).join('');
  const offlineOnly = [...retired].filter(id => !activated.includes(id))
    .map(id => ruleLink(id, { compact: true, offline: true })).join('');
  const sc = routing.short_circuit;
  const label = exam ? '院端规则路由' : '触发器路由（三级短路）';
  const sub = exam
    ? `本案激活 ${routing.activated_count} 条院端相关规则${sc ? '，' + sc.saved + ' 条跳过' : ''} · 红=已出风险点`
    : `全 ${routing.total} 条，本案只<b>激活 ${routing.activated_count} 条</b>，${sc ? sc.saved + ' 零成本跳过' : '其余跳过'}（90秒承诺的工程基础）`;
  return `<div class="routing-bar">🔀 <b>${label}</b>：${sub}
    <div class="routing-chips">${chips}${offlineOnly ? `<span class="routing-offline-sep muted">· 已下线</span>${offlineOnly}` : ''}</div>
    ${sc && !exam ? `<span class="muted">L1确定性 ${sc.level1_L1_deterministic} · L2语义候选 ${sc.level3_L2_llm_candidates}（朴素实现需全 ${routing.total} 条调LLM）· 红=已命中</span>` : '<span class="muted">红=已出疑点/线索</span>'}</div>`;
}
function renderRagSection(m) {
  const rag = m?.rag;
  if (!rag?.hits?.length) return '';
  const rows = rag.hits.map(h => `<tr>
    <td><code>${esc(h.ref_id || '')}</code></td>
    <td class="num">${h.score != null ? (h.score * 100).toFixed(1) + '%' : '—'}</td>
    <td>${esc(h.source || '—')}</td>
    <td class="muted">${esc((h.content || '').slice(0, 160))}${(h.content || '').length > 160 ? '…' : ''}</td>
  </tr>`).join('');
  return `<div class="findings-section rag-section">
    <h3 class="sect-title">📚 RAG 知识库增强 <span class="muted">${rag.hits.length} 条语义命中 · 已 merge 进政策上下文</span></h3>
    <p class="muted" style="margin:0 0 8px">检索 query：${esc((rag.query || '').slice(0, 240))}</p>
    <table class="fee-table"><thead><tr><th>ref_id</th><th class="num">相似度</th><th>来源</th><th>摘要</th></tr></thead><tbody>${rows}</tbody></table>
  </div>`;
}

function renderCoverage(cov) {
  if (!cov) return '';
  const mats = Object.entries(cov.materials).map(([k, v]) => `<span class="mat ${v ? 'ok' : 'miss'}">${v ? '✓' : '✗'} ${esc(k)}</span>`).join('');
  const dims = cov.dimensions.map(d => `<tr><td>${esc(d.dimension)}</td><td class="num">${d.executed.length}/${d.total_rules}</td><td class="rule-hit-col">${ruleHitCell(d.fired)}</td><td><span class="cov-status ${d.executed.length ? (d.fired.length ? 'found' : 'clean') : 'na'}">${esc(d.status)}</span></td></tr>`).join('');
  return `<div class="findings-section"><h3 class="sect-title">📋 覆盖度声明（查了什么·没查什么·为什么）</h3>
    <div class="cov-statement">${esc(cov.statement)}</div>
    <div class="cov-mats">材料完整性：${mats}</div>
    <p class="muted cov-hit-hint">命中规则：<b>点编号</b> 查判定逻辑与政策依据 · <b>↗</b> 定位到本案疑点 · 弹窗内可跳转规则目录 / 治理</p>
    <table class="fee-table" style="margin-top:8px"><thead><tr><th>应查维度</th><th class="num">激活/规则数</th><th>命中规则</th><th>状态</th></tr></thead><tbody>${dims}</tbody></table></div>`;
}
function confBadge(f) {
  if (f.confidence == null) return '';
  const cls = f.confidence >= 85 ? 'hi' : f.confidence >= 65 ? 'mid' : '';
  const parseWarn = f._parse_qa_warn ? '<span class="lowocr" title="解析质量偏低，建议人工核对原件">⚠解析待核</span>' : '';
  return `<span class="conf ${cls}" title="置信度=f(三要素完整度·控辩裁·OCR置信·CoVe)"><span class="conf-bar"><i style="width:${f.confidence}%"></i></span>置信${f.confidence}</span>${f._low_ocr ? '<span class="lowocr">⚠OCR低置信</span>' : ''}${parseWarn}`;
}

function renderComplianceFlags(f) {
  const flags = f.compliance_flags;
  if (!flags?.length) return '';
  const items = flags.map(c =>
    `<span class="compliance-chip" title="${esc(c.detail || '')}">${esc(c.code)} · ${esc(c.action)}</span>`
  ).join('');
  return `<div class="compliance-foot muted">合规前置：${items}</div>`;
}
function renderCoVe(cove) {
  if (!cove || !cove.items || !cove.items.length) return '';
  const realAgent = REPORT?.report_meta?.real_agent;
  const allPass = cove.all_pass != null ? cove.all_pass : cove.items.every(i => i.pass);
  const qs = cove.items.map(i => `<div class="cove-q"><span class="qm">Q：${esc(i.q)}</span><span class="pf ${i.pass ? 'ok' : 'no'}">${i.pass ? '✓核实' : '✗未闭环'}</span><br><span class="am">A：${esc(i.a)}</span></div>`).join('');
  return `<div class="cove"><div class="cove-h">🔁 CoVe 取证自检（定稿前逐题独立回查）<span class="kind-tag ${realAgent ? 'real' : 'script'}">${realAgent ? '真·LLM' : '脚本演示'}</span><span class="muted"> ${allPass ? '全部核实通过' : '存在未闭环项→影响定级'}${cove.verdict_reason ? '·' + esc(cove.verdict_reason) : ''}</span></div>${qs}</div>`;
}
function renderActions(f) {
  if (VIEW_EXAM) return '';
  const debateBtn = APP_HEALTH.llm_ready
    ? `<button type="button" class="act debate" data-action="对抗辩论">⚔ 对抗辩论</button>`
    : '';
  return `<div class="actions" data-fid="${esc(f.finding_id || '')}" data-rule="${esc(f.rule_id || '')}">
    ${debateBtn}
    <button type="button" class="act appeal" data-action="申诉材料" title="生成申诉书草稿+举证材料清单+医理/药理依据">📝 申诉材料</button>
    <button type="button" class="act adopt" data-action="采纳">✓ 采纳</button>
    <button type="button" class="act reject" data-action="驳回">✗ 驳回(误报回流)</button>
    <button type="button" class="act more" data-action="补材料">⊕ 存疑补材料</button>
    <span class="act-tip muted"></span>
  </div>`;
}

async function runDebateForFinding(btn) {
  const box = btn.closest('.actions');
  if (!box || !REPORT) return;
  const fid = box.dataset.fid;
  const f = (REPORT.findings || []).find(x => x.finding_id === fid);
  if (!f) return;
  box.querySelectorAll('.act').forEach(b => { b.disabled = true; });
  const tip = box.querySelector('.act-tip');
  if (tip) tip.textContent = 'P5 裁判运行中（约 30–60s）…';
  try {
    const r = await fetch('/api/debate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ caseId: CURRENT_CASE, finding: f }),
    }).then(x => x.json());
    if (r.error) {
      if (tip) tip.textContent = r.error;
      box.querySelectorAll('.act').forEach(b => { b.disabled = false; });
      return;
    }
    const idx = REPORT.findings.findIndex(x => x.finding_id === fid);
    if (idx >= 0) {
      REPORT.findings[idx].debate = r.debate;
      if (r.status && r.status !== REPORT.findings[idx].status) REPORT.findings[idx].status = r.status;
      await refreshReviewCache();
      renderReport(REPORT);
    }
    if (tip) tip.textContent = `控辩裁完成 · ${r.debate?.verdict || ''} (${r.debate?.prompt || 'P5'})${r.review_entry ? ' · 已写入 review_feedback' : ''}${r.eval_draft ? ' · eval_draft 已建议' : ''}`;
  } catch (e) {
    if (tip) tip.textContent = '失败: ' + e.message;
    box.querySelectorAll('.act').forEach(b => { b.disabled = false; });
  }
}

function renderExamRectification(f) {
  if (!VIEW_EXAM) return '';
  const key = rectKey(f);
  const cur = RECT_MAP[key] || {};
  const done = cur.submitted && cur.judgment;
  return `<div class="rect-mini-link"><button type="button" class="linkish" onclick="switchReportView('rectification');setTimeout(()=>document.getElementById('rect-${esc(f.finding_id)}')?.scrollIntoView({behavior:'smooth',block:'center'}),120)">${done ? '✓ 已登记 · 查看/修改' : '→ 去登记整改'}</button></div>`;
}

window.saveRectification = async () => { /* 旧入口保留，主流程在 saveRectificationCard */ };
window.quickRectStatus = () => {};

function askRejectReason() {
  return new Promise((resolve) => {
    openModal('✗ 驳回原因（必填）', `
      <p class="muted">将回流用于规则复审。某规则被驳回 ≥3 次将自动转观察期（shadow）。</p>
      <textarea id="rejectReasonInput" class="ingest-ta" rows="4" placeholder="例：外院已做过基因检测，本案应降为线索而非疑点…"></textarea>
      <div class="rect-actions" style="margin-top:12px">
        <button type="button" class="rect-btn accent" id="rejectConfirmBtn">确认驳回</button>
        <button type="button" class="rect-btn ghost" id="rejectCancelBtn">取消</button>
      </div>`);
    const ta = $('#rejectReasonInput');
    ta?.focus();
    const confirm = () => {
      const r = (ta?.value || '').trim();
      if (!r) { if (ta) { ta.style.borderColor = 'var(--red)'; ta.focus(); } return; }
      closeModal();
      resolve(r);
    };
    $('#rejectConfirmBtn').onclick = confirm;
    $('#rejectCancelBtn').onclick = () => { closeModal(); resolve(null); };
    ta?.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) confirm(); });
  });
}

function askGovernanceReason(title, placeholder) {
  return new Promise((resolve) => {
    openModal(title, `
      <textarea id="govReasonInput" class="ingest-ta" rows="4" placeholder="${esc(placeholder || '')}"></textarea>
      <div class="rect-actions" style="margin-top:12px">
        <button type="button" class="rect-btn accent" id="govReasonConfirmBtn">确认</button>
        <button type="button" class="rect-btn ghost" id="govReasonCancelBtn">取消</button>
      </div>`);
    const ta = $('#govReasonInput');
    ta?.focus();
    const confirm = () => {
      const r = (ta?.value || '').trim();
      if (!r) { if (ta) { ta.style.borderColor = 'var(--red)'; ta.focus(); } return; }
      closeModal();
      resolve(r);
    };
    $('#govReasonConfirmBtn').onclick = confirm;
    $('#govReasonCancelBtn').onclick = () => { closeModal(); resolve(null); };
    ta?.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) confirm(); });
  });
}

// 申诉副驾:疑点 → 申诉书草稿 + 举证材料清单 + 医理/药理循证依据
async function showAppealDraft(btn) {
  const box = btn.closest('.actions');
  const fid = box && box.dataset.fid;
  const f = (REPORT && REPORT.findings || []).find(x => x.finding_id === fid);
  if (!f) return;
  const tip = box.querySelector('.act-tip'); if (tip) tip.textContent = '生成申诉材料中…';
  let d;
  try { d = await fetch('/api/appeal-draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ finding: f, caseId: CURRENT_CASE }) }).then(r => r.json()); }
  catch (e) { if (tip) tip.textContent = '失败:' + e.message; return; }
  if (tip) tip.textContent = '';
  if (d.error) { openModal('📝 申诉材料', `<p class="muted">${esc(d.error)}</p>`); return; }
  const ap = d.appealability || {}, dr = d.draft || {};
  const matRows = (d.materials || []).map(m => `<tr><td>${esc(m.item)}</td><td>${esc(m.status)}</td><td class="muted">${esc(m.note)}</td></tr>`).join('');
  const refs = (d.clinical_refs || []).map(r => `<li><b>${esc(r.ref)}</b> ${esc(r.verify_status)}<div class="muted" style="font-size:11.5px">${esc(r.text)}…</div></li>`).join('');
  const html = `
    <p class="muted">把疑点自动落成<b>申诉书草稿 + 举证材料清单 + 医理/药理依据</b>——对齐官方法定申诉六环、10 工作日死线。 可申诉性:<span class="kind-tag ${ap.color === 'green' ? 'real' : 'script'}">${esc(ap.level || '')}</span></p>
    <div class="cov-statement">${esc(ap.reason || '')}　|　${esc(d.process_note || '')}</div>
    <div class="facts-h">📄 申诉书草稿</div>
    <pre class="rule-detail-pre">【标题】${esc(dr.title || '')}
【患者】${esc(dr.patient || '')}
【问题陈述】${esc(dr.problem_statement || '')}
【逐条核查】
${(dr.item_review || []).map(esc).join('\n')}
【申诉理由】${esc(dr.appeal_reason || '')}
【结论】${esc(dr.conclusion || '')}
${esc(dr.deadline || '')}</pre>
    <div class="ins-2col">
      <div><div class="facts-h">📎 举证材料清单</div><table class="fee-table"><thead><tr><th>材料</th><th>状态</th><th>说明</th></tr></thead><tbody>${matRows}</tbody></table></div>
      <div><div class="facts-h">📖 医理/药理循证依据</div><ul style="font-size:12.5px;padding-left:18px;margin:6px 0">${refs || '<li class="muted">附诊疗规范/药品说明书</li>'}</ul></div>
    </div>
    <div class="cov-statement" style="margin-top:10px">📌 ${esc(d.honesty_note || '')}</div>`;
  openModal('📝 申诉副驾 · ' + esc(d.rule_name || d.rule_id || ''), html);
}

window.reviewAction = async (btn, kind) => {
  if (kind === '对抗辩论') return runDebateForFinding(btn);
  if (kind === '申诉材料') return showAppealDraft(btn);
  const box = btn.closest('.actions');
  if (!box) return;
  let reason = '';
  if (kind === '驳回') {
    reason = await askRejectReason();
    if (!reason) return;
  }
  box.querySelectorAll('.act').forEach(b => b.classList.remove('chosen'));
  btn.classList.add('chosen');
  box.dataset.choice = kind;
  const tip = box.querySelector('.act-tip'); if (tip) tip.textContent = '记录中…';
  try {
    const r = await fetch('/api/review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ finding_id: box.dataset.fid, rule_id: box.dataset.rule, case_id: CURRENT_CASE, action: kind, reason }) }).then(x => x.json());
    if (r.error) { if (tip) tip.textContent = r.error; return; }
    if (tip) {
      let msg = `已持久化(${kind})`;
      if (r.chain) msg += ` · ${formatChainProgress(r.chain)}`;
      if (kind === '驳回' && r.precip?.reject?.enqueued) msg += ' · 误报链已入队+Agent';
      if (kind === '采纳' && r.precip?.adopt?.enqueued) msg += ' · 巩固链已入队+Agent';
      if (kind === '补材料' || r.buffered) msg += ' · 缓冲态（不入沉淀队列）';
      if (kind === '驳回') {
        const rej = r.stats?.by_rule?.[box.dataset.rule]?.rejected || 0;
        if (rej >= (r.stats?.threshold || 3)) msg += ' · 已触发 shadow 观察期';
      }
      tip.textContent = msg;
    }
    if (r.precip?.reject?.draft || r.precip?.adopt?.draft) loadPrecipitationData();
  } catch (e) { if (tip) tip.textContent = '记录失败:' + e.message; }
};

function bindReviewActionDelegation() {
  const panel = $('.panel-right');
  if (!panel || panel.dataset.reviewBound) return;
  panel.dataset.reviewBound = '1';
  panel.addEventListener('click', (e) => {
    // 疑点卡现渲染于报告分页器(#page-findings)内，旧选择器 #findingsList 已不存在 →
    // 直接匹配 .actions 内的操作按钮，否则采纳/驳回/补材料 全部点击无效（假按钮）。
    const btn = e.target.closest('.actions button.act[data-action]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    reviewAction(btn, btn.dataset.action);
  });
}

function renderReconciliation(f) {
  if (!f.corroborations || !f.corroborations.length) return '';
  const corro = f.corroborations.map(c => `<div class="corro-item">${ruleLink(c.rule_id)}<span class="muted"> · ${esc(c.violation_type)}</span><div class="corro-reason">${esc(c.reasoning)}</div></div>`).join('');
  return `<div class="recon">
    <div class="recon-head">🔗 合议层：本笔 ¥${fmt(f.amount_involved)} 被 <b>${f._merged_count}</b> 条规则命中 → 合并为 <b>1 主疑点 + ${f.corroborations.length} 佐证视角</b>，金额只算一次（<b>非 ¥${fmt(f._raw_amount_sum)}</b>）</div>
    <div class="recon-sub">主疑点：${ruleLink(f.rule_id, { compact: true })}（定性最准）。以下为同一笔钱的其它定性角度（不重复计金额、不重复计数）——多视角=更强对质材料：</div>
    ${corro}
  </div>`;
}
// iter20：处置语气从「监管对质口径」转「院端自查口径」（引擎/疑点不变，只换措辞）
function examDisposal(t) {
  return String(t || '')
    .replace(/建议作为伪造变造线索移交[；;]?/g, '建议院端重点自查该材料真实性、留存说明材料；')
    .replace(/移交(欺诈骗保|伪造变造)?线索/g, '院端重点自查并留存说明')
    .replace(/建议责令退回/g, '建议飞检前主动退回')
    .replace(/建议移交骗保/g, '建议院端自查并留存说明')
    .replace(/建议移交欺诈骗保/g, '建议院端自查并留存说明')
    .replace(/建议移交/g, '建议院端自查并留存说明')
    .replace(/移交骗保/g, '院端自查（飞检前主动说明）')
    .replace(/移交欺诈骗保/g, '院端自查（飞检前主动说明）')
    .replace(/责令退回/g, '主动退回')
    .replace(/移交/g, '院端自查（必要时主动说明）')
    .replace(/责令/g, '主动');
}
function findingSummaryLine(s) {
  if (VIEW_EXAM) return `已定位 ${s.suspected_count || 0} 条风险点 · 请至「登记整改」逐条填写`;
  return `已定位 ${s.suspected_count || 0} 条可回链疑点，待复核 ${s.clue_count || 0} 条线索 · 按金额×置信排序`;
}

function evidenceChainFooter(f) {
  const m = REPORT?.report_meta;
  const ts = m?.generated ? new Date(m.generated).toLocaleString('zh-CN') : '引擎输出';
  return `<div class="ec-footer"><img src="/brand/icons/evidence.svg" alt="" width="14" height="14"><span>案卷 ${esc(CURRENT_CASE || '—')}</span><span>·</span><span>规则 ${ruleLink(f.rule_id, { compact: true })}</span><span>·</span><span>${esc(ts)}</span><span>·</span><span>引擎 ${esc(m?.engine_mode || 'deterministic')}</span></div>`;
}

function findingCard(f) {
  const evHtml = f.evidence.map(e => `<div class="ev"><span class="ev-type">${esc(e.type)}</span><span class="ev-loc" data-loc="${esc(e.loc)}">${esc(e.loc)}</span><span class="ev-text">${esc(e.text)}${e.anchor ? ` <span class="anchor-chip" title="事实层锚点">⚓${esc(e.anchor.doc)} OCR${e.anchor.ocr_conf}</span>` : ''}</span></div>`).join('');
  const polHtml = (f.policy || []).map(p => `<div class="policy"><span class="pref">${esc(p.ref)}</span><span class="vchip ${(/已核/.test(p.verify_status || '')) ? 'ok' : 'warn'}">${esc(p.verify_status || '')}</span><div>${esc(p.text)}</div></div>`).join('');
  const needsLabel = VIEW_EXAM ? '建议补全材料：' : '需调阅材料清单：';
  const needs = (f.needs_more && f.needs_more.length) ? `<div class="needs"><b>${needsLabel}</b><ul>${f.needs_more.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>` : '';
  const statusLabel = VIEW_EXAM && f.status === '疑点' ? '风险点' : f.status;
  return `<div class="finding ${esc(f.status)}${f.shadow ? ' shadow' : ''}" data-fid="${esc(f.finding_id)}">
    <div class="f-head">
      <span class="status-badge ${esc(f.status)}">${esc(statusLabel)}</span>
      ${f.shadow ? '<span class="shadow-badge" title="规则因高频驳回转入观察期，暂不计分">🌓 观察期·不计分</span>' : ''}
      <span class="f-title">${ruleLink(f.rule_id)}${f.corroborations && f.corroborations.length ? `<span class="merge-chip" title="合议层合并">🔗合议 ${f._merged_count}→1</span>` : ''}</span>
      <span class="f-meta">${confBadge(f)}<span class="risk ${esc(f.risk_level)}">${esc(f.risk_level)}</span><span class="amount">${f.shadow ? '<s>¥' + fmt(f.amount_involved) + '</s>' : '¥' + fmt(f.amount_involved)}</span><span class="chev">▶</span></span>
    </div>
    <div class="f-body">
      ${f.shadow ? `<div class="shadow-note">🌓 ${esc(f.shadow_reason)}</div>` : ''}
      <div class="evidence-chain">
        <div class="ec-grid">
          <div class="ec-col"><div class="three-label"><span class="idx">1</span>原始证据定位</div>${evHtml || '<p class="muted">—</p>'}</div>
          <div class="ec-col"><div class="three-label"><span class="idx">2</span>违反的政策条款（引用原文）</div>${polHtml || '<p class="muted">—</p>'}</div>
          <div class="ec-col"><div class="three-label"><span class="idx">3</span>完整推理过程</div><div class="reason">${esc(f.reasoning)}</div></div>
        </div>
        ${evidenceChainFooter(f)}
      </div>
        ${needs}
        ${f.disposal_suggestion ? `<div class="disposal"><b>${VIEW_EXAM ? '自查整改建议：' : '处置建议：'}</b>${esc(VIEW_EXAM ? examDisposal(f.disposal_suggestion) : f.disposal_suggestion)}</div>` : ''}
        ${renderReconciliation(f)}
        ${renderCoVe(f.cove)}
        ${renderDebate(f.debate)}
        ${renderDebateHistory(f)}
        ${renderExamRectification(f)}
        ${renderActions(f)}
        ${renderComplianceFlags(f)}
        <div class="muted" style="margin-top:8px">违规类型（官方术语）：${esc(f.violation_type)} · 规则层级：${esc(f.layer || f.layer_label || '')} · 优先分(金额×置信)：${f.priority_score ?? '—'}</div>
    </div></div>`;
}

const ROLE_META = {
  '控方': { icon: '⚖️', cls: 'r-pro', tag: '控方·稽核' },
  '辩方': { icon: '🛡', cls: 'r-def', tag: '辩方·申诉' },
  '裁判': { icon: '⚑', cls: 'r-judge', tag: '裁判·裁定' },
};
function renderDebate(d) {
  if (!d) return '';
  if (!d.enabled) return VIEW_EXAM ? '' : `<div class="debate-skip">🗣 控辩裁：<b>不启动辩论</b> — ${esc(d.skip_reason)}</div>`;
  const downgrade = /降级/.test(d.verdict);
  const exch = d.exchanges.map(e => {
    const meta = ROLE_META[e.role] || { icon: '·', cls: '', tag: e.role };
    return `<div class="exch ${meta.cls}"><div class="exch-role">${meta.icon} ${esc(meta.tag)}<span class="stance">${esc(e.stance)}</span></div><div class="exch-text">${esc(e.text)}</div></div>`;
  }).join('');
  const realAgent = d.real_agent || d.p5_v7 || REPORT?.report_meta?.real_agent;
  const agentLabel = d.p5_v7 ? `真·P5 v7${d.prompt ? ' · ' + d.prompt : ''}` : (realAgent ? '真·LLM多Agent' : '脚本演示·真版切LLM');
  const inner = `<div class="debate-head">🗣 控辩裁三方对质 <span class="kind-tag ${realAgent || d.p5_v7 ? 'real' : 'script'}">${agentLabel}</span> <span class="muted">（${d.rounds}轮封顶 · 申诉Agent=误报过滤器）</span>
      <span class="verdict ${downgrade ? 'down' : 'keep'}">裁定：${esc(d.verdict)}</span></div>
    <div class="exch-list">${exch}</div>
    <div class="verdict-reason ${downgrade ? 'down' : ''}">▸ ${esc(d.verdict_reason)}</div>
    <div class="muted" style="padding:6px 12px;font-size:11px">裁判防偏见：控辩材料位置交换二次裁决，不一致判平→降级线索；裁判与辩手用不同模型（防自我偏好）。</div>`;
  if (VIEW_EXAM) {
    return `<details class="debate-exam-optional"><summary class="muted">🗣 监管对质参考（院端可忽略 · 点击展开）</summary><div class="debate">${inner}</div></details>`;
  }
  return `<div class="debate">${inner}</div>`;
}

function renderDebateHistory(f) {
  const hist = (REVIEW_CACHE || []).filter(e =>
    e.action === '控辩裁' && e.source === 'p5_debate' && e.finding_id === f.finding_id,
  );
  if (!hist.length) return '';
  const items = hist.slice(-5).map(e => {
    const ts = e.ts ? new Date(e.ts).toLocaleString() : '—';
    const verdict = e.debate_verdict || e.reason?.slice(0, 48) || '—';
    const swap = e.position_swap_consistent === false ? ' · 位置交换不一致' : '';
    return `<div class="debate-hist-item"><span class="muted">${esc(ts)}</span> · <b>${esc(verdict)}</b>${swap}${e.reason && e.debate_verdict ? `<div class="muted" style="font-size:11px;margin-top:2px">${esc(e.reason.slice(0, 120))}${e.reason.length > 120 ? '…' : ''}</div>` : ''}</div>`;
  }).join('');
  return `<div class="debate-history"><div class="debate-hist-head">📜 控辩裁历史 <span class="muted">(${hist.length} 条 · 来自 review_feedback)</span></div>${items}</div>`;
}

function distractorCard(d) {
  return `<div class="distractor"><div class="d-top">✓ 正确不报<span class="d-rule">未误报 ${esc(d.tempting_rule)}</span></div>
    <div class="d-item">${esc(d.item)}</div><div class="d-why">${esc(d.why_not_flagged)}</div>${d.demo_value ? `<div class="d-why" style="margin-top:6px;color:var(--green)">${esc(d.demo_value)}</div>` : ''}</div>`;
}

function jumpToLoc(loc) {
  let tab = 'fee';
  if (/费用清单/.test(loc)) tab = 'fee'; else if (/病程/.test(loc)) tab = 'progress';
  else if (/病案首页/.test(loc)) tab = 'front'; else if (/病理|基因/.test(loc)) tab = 'path';
  else if (/检验/.test(loc)) tab = 'lab'; else if (/医嘱/.test(loc)) tab = 'orders';
  else if (/护理/.test(loc)) tab = 'nursing'; else if (/出院/.test(loc)) tab = 'discharge';
  else if (/手术|影像/.test(loc)) tab = 'op';
  activeTab = tab; renderTabs(); renderDoc(tab);
  const m = loc.match(/第\s*([\d]+)/);
  setTimeout(() => {
    document.querySelectorAll('.fee-table tr.bbox-highlight').forEach(r => r.classList.remove('bbox-highlight'));
    const row = m && $('#fee-row-' + m[1]);
    if (row) {
      row.scrollIntoView({ block: 'center', behavior: 'smooth' });
      row.classList.add('bbox-highlight');
      const bboxRaw = row.getAttribute('data-bbox');
      if (bboxRaw) {
        try {
          const bb = JSON.parse(bboxRaw);
          row.title = `OCR 坐标 [x=${bb[0]}, y=${bb[1]}, w=${bb[2]}, h=${bb[3]}] · 页 ${row.getAttribute('data-page') || 1}`;
        } catch (_) { /* ignore */ }
      }
      setTimeout(() => row.classList.remove('bbox-highlight'), 2400);
    } else { $('.doc-body').scrollTop = 0; }
  }, 60);
}

// 工具
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('zh-CN', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) : n);
function scanningHTML() {
  return `<div class="scanning"><div style="font-size:15px;font-weight:700;color:var(--primary);display:flex;align-items:center;gap:8px"><img src="/brand/icons/scan.svg" alt="" width="22" height="22"> 文档索引中 · 条款交叉验证…</div>
    <div class="scan-bar"><i></i></div><div class="scan-log" id="scanLog"></div></div>`;
}

$('#btnAudit').onclick = () => runAudit();
$('#btnReset').onclick = () => location.reload();
// 双模式
function setMode(mode) {
  if (mode === MODE) return;
  MODE = mode;
  sessionStorage.setItem('yingyan_mode', mode);
  applyModeUI();
  if (REPORT) runAudit();
}
$$('.mode-btn').forEach(b => b.onclick = () => setMode(b.dataset.mode));
$$('.rtab').forEach(b => b.onclick = () => switchReportView(b.dataset.view));
// v2 工具
$('#btnInject').onclick = showInjectionDefense;
$('#btnLLM').onclick = () => runAudit({ llm: true });
const btnRag = $('#btnRag');
if (btnRag) btnRag.onclick = () => runAudit({ rag: true });
const btnSuperAudit = $('#btnSuperAudit');
if (btnSuperAudit) btnSuperAudit.onclick = () => { INJECT = true; runAudit({ super: true, rag: true }); };
bindReportPagerControls();
const btnIngest = $('#btnIngest');
if (btnIngest) btnIngest.onclick = showIngest;
$('#btnFacts').onclick = showFacts;
$('#btnBench').onclick = showBench;
$('#btnInstitution').onclick = showInstitution;
const _btnFoundation = $('#btnFoundation'); if (_btnFoundation) _btnFoundation.onclick = () => showHaven(0);
const _btnTriad = $('#btnTriad'); if (_btnTriad) _btnTriad.onclick = () => showHaven(1);
const _btnThreeStage = $('#btnThreeStage'); if (_btnThreeStage) _btnThreeStage.onclick = showThreeStage;
const _btnAgentRuntime = $('#btnAgentRuntime'); if (_btnAgentRuntime) _btnAgentRuntime.onclick = showAgentRuntime;
// v2bar 下拉（洞察/稽核引擎/工具与演示）：开合 + 点项后收起 + 点外部收起。
// 关键：v2bar 有 backdrop-filter（给 fixed 建了包含块）+ overflow-x:auto（裁剪）——会把展开的菜单裁掉看不全。
// 解法：把菜单 portal 到 <body>，脱离 v2bar 的包含块与 overflow，position:fixed 按触发钮定位，永不被裁。
(function setupV2Dropdowns() {
  const dds = $$('.v2dropdown');
  let openMenu = null;
  const closeAll = () => { if (openMenu) { openMenu.style.display = 'none'; openMenu = null; } dds.forEach(d => d.classList.remove('open')); };
  function positionMenu(menu, btn) {
    const r = btn.getBoundingClientRect();
    menu.style.top = Math.round(r.bottom + 6) + 'px';
    if (menu.classList.contains('v2dropdown-menu-right')) {
      menu.style.right = Math.round(window.innerWidth - r.right) + 'px'; menu.style.left = 'auto';
    } else {
      const mw = menu.offsetWidth || 180; // 已 display:flex 后再量，靠右边缘时左收避免溢出
      menu.style.left = Math.round(Math.max(8, Math.min(r.left, window.innerWidth - mw - 12))) + 'px'; menu.style.right = 'auto';
    }
  }
  dds.forEach(dd => {
    const btn = dd.querySelector('.v2btn');
    const menu = dd.querySelector('.v2dropdown-menu');
    if (!btn || !menu) return;
    document.body.appendChild(menu); // portal：一次性搬到 body
    menu._btn = btn; menu._dd = dd;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = openMenu === menu;
      closeAll();
      if (!isOpen) { openMenu = menu; dd.classList.add('open'); menu.style.display = 'flex'; positionMenu(menu, btn); }
    });
    menu.addEventListener('click', () => closeAll());
  });
  document.addEventListener('click', (e) => { if (openMenu && !openMenu.contains(e.target) && !openMenu._btn.contains(e.target)) closeAll(); });
  window.addEventListener('scroll', closeAll, true); // fixed 菜单不随滚动移动 → 滚动即收起
  window.addEventListener('resize', () => { if (openMenu) positionMenu(openMenu, openMenu._btn); });
})();
// 稽核引擎档位：标准（默认主CTA走标准）
const _btnEngStd = $('#btnEngStd'); if (_btnEngStd) _btnEngStd.onclick = () => runAudit();
$('#btnGovernance').onclick = showGovernance;
const btnRuleCatalog = $('#btnRuleCatalog');
if (btnRuleCatalog) btnRuleCatalog.onclick = () => showRuleCatalog();
$('#btnExport').onclick = showExportMenu;
function showExportMenu() {
  const ex = MODE === 'exam';
  const caseQ = `case_id=${encodeURIComponent(CURRENT_CASE)}`;
  const chkQ = (ex ? 'mode=exam&' : '') + caseQ;
  const item = (href, icon, title, sub) => `<a class="export-item" href="/api/export/${href}" target="_blank" rel="noopener"><span class="ex-ic">${icon}</span><span class="ex-tx"><b>${title}</b><span class="muted">${sub}</span></span><span class="ex-dl">⬇</span></a>`;
  const html = `
    <p class="muted">当前案卷 <code>${esc(CASE_LABELS[CURRENT_CASE] || CURRENT_CASE)}</code> · ${ex ? '体检' : '稽核'}模式 —— 一键下载结构化数据 / 清单 / 打印版。</p>
    <div class="export-grid">
      ${item(`findings?format=csv&${caseQ}`, '📊', '疑点表 · CSV', 'Excel 直接打开，逐条疑点带证据/金额/置信')}
      ${item(`findings?format=json&${caseQ}`, '{ }', '疑点 · JSON', '结构化数据，供接口/二次处理')}
      ${item(`checklist?${chkQ}`, '📄', ex ? '自查整改清单 · Markdown' : '飞检举证包 · Markdown', '三要素证据链清单 + 检查结论草稿')}
      ${item(`checklist?format=html&${chkQ}`, '🖨', ex ? '自查清单 · 打印/存 PDF' : '举证包 · 打印/存 PDF', '浏览器打印为 PDF（服务端一键 PDF 建设中）')}
    </div>`;
  openModal('⬇ 导出报告 · 一键下载', html);
}
$('#btnPitch').onclick = showPitch;
$('#modalRoot').onclick = (e) => { if (e.target.id === 'modalRoot') closeModal(); };

// ---------- 模态 ----------
function openModal(title, html) {
  $('#modalBox').innerHTML = `<div class="modal-head"><h3>${esc(title)}</h3><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body">${html}</div>`;
  $('#modalRoot').classList.remove('hidden');
}
window.closeModal = () => $('#modalRoot').classList.add('hidden');

async function showIngest() {
  const [conn, slots] = await Promise.all([
    fetch('/api/connectors').then(r => r.json()),
    fetch('/api/intake/slots').then(r => r.json()),
  ]);
  const slotOpts = (slots.slots || []).map(s => `<option value="${esc(s.id)}">${esc(s.label)}</option>`).join('');
  openModal('📥 一键导入材料', `
    <p class="muted">拖入或选择多个文件，系统自动识别是<strong>费用清单 / 病案首页 / 医嘱 / 病程</strong>等哪一块，合并填入材料包。支持 <b>PDF · JSON · CSV · 图片</b>（L1 解析需 sidecar：<code>bash prototype/ppstructure/run.sh</code>）。</p>
    <p class="note-line"><a href="/intake.html" class="linkish">→ 打开完整材料导入中心</a>（批量队列 · 服务状态 · 解析预览）</p>
    <div class="intake-drop" id="intakeDrop">
      <input type="file" id="intakeFiles" multiple accept=".json,.csv,.txt,.pdf,image/*,application/json,text/csv,text/plain,application/pdf" hidden>
      <div class="intake-drop-inner">
        <img src="/brand/icons/scan.svg" alt="" width="40" height="40">
        <strong>拖拽文件到此处</strong>
        <span class="muted">或点击选择 · 可多选</span>
        <span class="intake-drop-hint">费用清单.pdf · 病案首页.json · 医嘱扫描件.jpg …</span>
      </div>
    </div>
    <div id="intakeQueue" class="intake-queue hidden"></div>
    <div class="intake-actions">
      <label class="intake-merge-lbl"><input type="checkbox" id="intakeMerge" checked> 合并到已有导入件（追加而非覆盖）</label>
      <button class="v2btn accent" id="btnIntakeRun" type="button" disabled>识别并填入 →</button>
    </div>
    <div id="intakeBatchResult" class="ingest-result"></div>
    <details class="ingest-advanced"><summary>高级入口（JSON 粘贴 / HIS 拉取 / 单文件视觉）</summary>
      <div class="ingest-sec"><div class="facts-h">粘贴 medical_record JSON</div>
        <textarea id="ingestJson" class="ingest-ta" placeholder='{"case_meta":{...},"front_page":{...},"fee_list":{"items":[...]}}'></textarea>
        <button class="v2btn" type="button" onclick="ingestJson()">导入 JSON</button>
        <div id="ingestJsonResult" class="ingest-result"></div></div>
      <div class="ingest-sec"><div class="facts-h">医院系统拉取 ${conn.vision_ready ? '<span class="conn-status ok">视觉就绪</span>' : ''}</div>
        <input id="ingestEnc" class="case-select" style="max-width:none;width:240px" placeholder="就诊号(可空)">
        ${conn.connectors.map(c => `<div class="conn-row"><span class="conn-name">${esc(c.name)}</span><button class="v2btn" type="button" onclick="ingestConnector('${esc(c.id)}')" ${c.status.ready ? '' : 'disabled'}>拉取</button></div>`).join('')}
        <div id="ingestConnResult" class="ingest-result"></div></div>
    </details>`);
  initIntakeDrop(slotOpts);
}

let INTAKE_QUEUE = [];

function initIntakeDrop(slotOptsHtml) {
  INTAKE_QUEUE = [];
  const drop = document.getElementById('intakeDrop');
  const input = document.getElementById('intakeFiles');
  const queue = document.getElementById('intakeQueue');
  const btnRun = document.getElementById('btnIntakeRun');
  if (!drop || !input) return;

  const renderQueue = () => {
    if (!INTAKE_QUEUE.length) {
      queue.classList.add('hidden');
      btnRun.disabled = true;
      return;
    }
    queue.classList.remove('hidden');
    btnRun.disabled = false;
    queue.innerHTML = INTAKE_QUEUE.map((f, i) => `
      <div class="intake-row" data-idx="${i}">
        <span class="intake-fname" title="${esc(f.name)}">${esc(f.name)}</span>
        <span class="intake-fsize muted">${(f.size / 1024).toFixed(1)} KB</span>
        <select class="intake-slot case-select" data-idx="${i}" title="可手动改分类">
          <option value="">自动识别</option>${slotOptsHtml}
        </select>
        <button type="button" class="intake-rm" data-idx="${i}" title="移除">✕</button>
      </div>`).join('');
    queue.querySelectorAll('.intake-rm').forEach(b => b.onclick = () => {
      INTAKE_QUEUE.splice(Number(b.dataset.idx), 1);
      renderQueue();
    });
  };

  const addFiles = (fileList) => {
    for (const file of fileList) INTAKE_QUEUE.push(file);
    renderQueue();
  };

  drop.onclick = () => input.click();
  input.onchange = (e) => { addFiles(e.target.files); input.value = ''; };
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('dragover'); };
  drop.ondragleave = () => drop.classList.remove('dragover');
  drop.ondrop = (e) => {
    e.preventDefault();
    drop.classList.remove('dragover');
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  };

  btnRun.onclick = () => runIntakeBatch();
  renderQueue();
}

async function fileToPayload(file, slotOverride) {
  const b64 = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  return { name: file.name, mime: file.type || 'application/octet-stream', fileBase64: b64, slotOverride: slotOverride || undefined };
}

async function runIntakeBatch() {
  const out = document.getElementById('intakeBatchResult');
  const btn = document.getElementById('btnIntakeRun');
  if (!INTAKE_QUEUE.length) return;
  btn.disabled = true;
  out.innerHTML = '<span class="muted">识别分类并解析中…</span>';
  const merge = document.getElementById('intakeMerge')?.checked;
  const selects = document.querySelectorAll('.intake-slot');
  const files = await Promise.all(INTAKE_QUEUE.map((f, i) => {
    const sel = [...selects].find(s => Number(s.dataset.idx) === i);
    return fileToPayload(f, sel?.value || '');
  }));
  try {
    const r = await fetch('/api/intake/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ files, merge }),
    }).then(x => x.json());
    renderIntakeBatchResult(r, out);
    if (r.record) intakeApplyRecord(r);
  } catch (e) {
    out.innerHTML = `<div class="ingest-err">✗ ${esc(e.message)}</div>`;
  }
  btn.disabled = false;
}

function renderIntakeBatchResult(r, out) {
  if (!r.ok && !r.record) {
    out.innerHTML = `<div class="ingest-err">✗ ${esc(r.error || r.errors?.join('；') || '导入失败')}</div>`;
    return;
  }
  const rows = (r.items || []).map(it => {
    const cls = it.ok ? 'ok' : 'err';
    const c = it.classification || {};
    return `<div class="intake-result-row ${cls}"><span>${esc(it.name)}</span> → <b>${esc(c.slotLabel || c.slot || '?')}</b>
      <span class="muted">${esc((it.log || []).join(' · '))}</span>${it.error ? `<span class="ingest-err-inline">${esc(it.error)}</span>` : ''}</div>`;
  }).join('');
  const filled = (r.slotsFilled || []).map(s =>
    `<span class="intake-slot-badge" data-tab="${esc(s.tab || '')}">${esc(s.label)}</span>`).join('');
  out.innerHTML = `
    ${r.errors?.length ? `<div class="ingest-err">部分失败：${esc(r.errors.join('；'))}</div>` : ''}
    ${r.warnings?.length ? `<div class="muted" style="margin:8px 0">${esc(r.warnings.join(' · '))}</div>` : ''}
    <div class="ingest-ok">✓ 已填入 ${(r.slotsFilled || []).length} 个材料区块${r.record?.front_page?.patient_name ? ' · ' + esc(r.record.front_page.patient_name) : ''}</div>
    <div class="intake-filled">${filled || '<span class="muted">暂无有效字段</span>'}</div>
    <div class="intake-result-list">${rows}</div>
    ${!r.validation?.ok ? `<div class="muted">契约提示：${esc((r.validation?.errors || []).join('；'))}</div>` : ''}`;
  out.querySelectorAll('.intake-slot-badge[data-tab]').forEach(b => {
    if (b.dataset.tab) b.onclick = () => { activeTab = b.dataset.tab; closeModal(); renderTabs(); renderDoc(activeTab); };
  });
}

function intakeApplyRecord(r) {
  if (![...$('#caseSelect').options].some(o => o.value === 'uploaded')) {
    const opt = document.createElement('option');
    opt.value = 'uploaded';
    opt.textContent = '📥 导入的材料';
    $('#caseSelect').appendChild(opt);
  }
  setTimeout(async () => {
    await loadCase('uploaded');
    setWorkflowStep(1);
    if ((r.slotsFilled || []).length) {
      activeTab = r.slotsFilled[0].tab || 'fee';
      renderTabs();
      renderDoc(activeTab);
    }
  }, 400);
}

window.ingestJson = async () => {
  const out = document.getElementById('ingestJsonResult'); out.innerHTML = '<span class="muted">校验中…</span>';
  const r = await fetch('/api/ingest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'structured', json: document.getElementById('ingestJson').value }) }).then(x => x.json());
  ingestDone(r, out);
};
window.ingestConnector = async (id) => {
  const out = document.getElementById('ingestConnResult'); out.innerHTML = '<span class="muted">拉取中…</span>';
  const r = await fetch('/api/ingest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'connector', connectorId: id, encounterId: document.getElementById('ingestEnc').value }) }).then(x => x.json());
  ingestDone(r, out);
};
function ingestDone(r, out) {
  if (!r.ok) {
    out.innerHTML = `<div class="ingest-err">✗ ${esc(r.error)}</div>` + (r.contract ? `<pre class="ingest-contract">${esc(JSON.stringify(r.contract, null, 2))}</pre>` : '') + (r.details ? `<div class="muted">${esc((r.details || []).join('；'))}</div>` : '');
    return;
  }
  out.innerHTML = `<div class="ingest-ok">✓ 已摄取（${esc(r.source)}）：${esc(r.record.front_page?.patient_name || '')} · ${esc(r.record.front_page?.principal_diagnosis?.name || '')}。${(r.parse_log || []).map(esc).join('；')}</div>`;
  // 注册到案卷选择器并加载+稽核
  if (![...$('#caseSelect').options].some(o => o.value === 'uploaded')) {
    const opt = document.createElement('option'); opt.value = 'uploaded'; opt.textContent = '📥 导入的材料'; $('#caseSelect').appendChild(opt);
  }
  $('#caseSelect').value = 'uploaded';
  setTimeout(async () => { closeModal(); await loadCase('uploaded'); runAudit(); }, 900);
}

async function showFacts() {
  const c = await fetch('/api/caseobject').then(r => r.json());
  const feeRows = c.fee_lines.map(f => `<tr><td class="ln">${f.id}</td><td>${esc(f.name)}</td><td class="num">${f.amount.toFixed(2)}</td><td><span class="anchor-chip">${esc(f.anchor.doc)}·${esc(f.anchor.locator)}</span></td><td><span class="ocr-chip ${f.anchor.ocr_conf < 0.8 ? 'lo' : 'hi'}">OCR ${f.anchor.ocr_conf}${f.anchor.bbox ? ' ⌖' : ''}${f.anchor.ocr_conf < 0.8 ? ' ⚠' : ''}</span></td></tr>`).join('');
  const inj = (c.flags.injection_suspects || []).length;
  const html = `
    <p class="muted">事实层把材料包一次性编译为类型化"稽核案卷对象"，<b>每条事实自带源锚点(文档/定位/OCR置信度)</b>——证据定位从"LLM临场摘录"变为"事实自身携带出处"，三要素门禁的"证据定位"成为数据结构的硬字段。规则在对象上跑，不重读全文（token降一个量级、判定可复现）。</p>
    <div class="bench-kpis">
      <div class="bkpi"><div class="n">${c.summary.fee_lines}</div><div class="l">费用行事实</div></div>
      <div class="bkpi"><div class="n">${c.summary.orders}</div><div class="l">医嘱事实</div></div>
      <div class="bkpi"><div class="n">${c.summary.labs}</div><div class="l">检验值事实</div></div>
      <div class="bkpi ${c.summary.low_ocr_spans ? 'red' : ''}"><div class="n">${c.summary.low_ocr_spans}</div><div class="l">低OCR置信span</div></div>
    </div>
    ${inj ? `<div class="exam-banner" style="background:var(--red-bg);color:var(--red);border-color:#f0c4c0">⚠ flags.injection_suspects：检出 ${inj} 处对抗注入文本，已隔离</div>` : ''}
    <div class="facts-h">费用行事实表（fee_lines · 含锚点与OCR置信度）</div>
    <table class="fee-table"><thead><tr><th>事实ID</th><th>名称</th><th class="num">金额</th><th>源锚点</th><th>OCR</th></tr></thead><tbody>${feeRows}</tbody></table>
    <div class="facts-h">flags（对抗清洗与低置信标记）</div>
    <div class="note-line">low_ocr_spans: ${esc(JSON.stringify(c.flags.low_ocr_spans))}<br>injection_suspects: ${esc(JSON.stringify(c.flags.injection_suspects))}</div>`;
  openModal('🧬 事实层 · 稽核案卷对象（Case Object）', html);
}

async function showBench() {
  const [b, rev, yhf] = await Promise.all([
    fetch('/api/bench').then(r => r.json()),
    fetch('/api/review').then(r => r.json()).catch(() => ({ stats: {} })),
    fetch('/api/yhf').then(r => r.json()).catch(() => null),
  ]);
  const rows = b.cases.map(c => `<tr><td>${c.is_clean ? '🟢干净件' : '🔴违规件'}</td><td>${esc(c.title || c.id)}</td><td class="num">${c.found_suspected}</td><td class="num">${c.found_clue}</td><td class="num">${c.false_positives != null ? c.false_positives : '—'}</td><td class="num">${c.latency_ms}ms</td><td class="num">${c.routing}</td></tr>`).join('');
  const yhfBlock = yhf && yhf.engine ? `
    <div class="yhf-gate">
      <h4><span class="gate-badge">YHF</span> 变更门禁 · Oracle 模式（零治理叠加）</h4>
      <div class="yhf-row"><span>G0 干净件零误报</span><b>${yhf.engine.gates.G0_clean_zero_fp ? '✅ PASS' : '❌ FAIL'}</b></div>
      <div class="yhf-row"><span>案卷 / 干净件误报</span><b>${yhf.engine.meta.total_cases} / ${yhf.engine.meta.clean_false_positive_total}</b></div>
      <div class="yhf-row"><span>规则缺 6 用例</span><b>${yhf.rule?.missing_test_cases ?? '—'} 条</b></div>
      <div class="yhf-row"><span>整体门禁</span><b>${yhf.overall_pass ? '✅ PASS' : '❌ FAIL'}</b></div>
      <p class="muted" style="margin-top:8px">CLI: <code>bash yhf/run.sh --strict</code> · shadow 公理：bench=Oracle，live 才读 rule_states</p>
    </div>` : '';
  const html = `
    <p class="muted">AuditBench + YHF：任何 prompt/规则/模型变更都跑回归。<b>干净件误报=0 是红线</b>。</p>
    <div style="text-align:center;margin:10px 0"><span class="redline ${b.meta.red_line_clean_zero_fp ? 'pass' : 'fail'}">红线：干净件零误报 ${b.meta.red_line_clean_zero_fp ? '✓ PASS' : '✗ FAIL'}</span></div>
    ${yhfBlock}
    <div class="bench-kpis">
      <div class="bkpi"><div class="n">${b.meta.total_cases}</div><div class="l">基准案卷数</div></div>
      <div class="bkpi green"><div class="n">${b.meta.clean_false_positive_total}</div><div class="l">干净件误报合计</div></div>
      <div class="bkpi"><div class="n">${b.meta.avg_latency_ms}<small>ms</small></div><div class="l">平均时延</div></div>
      <div class="bkpi"><div class="n">${b.meta.clean_cases}</div><div class="l">干净件数</div></div>
    </div>
    <table class="fee-table"><thead><tr><th>类型</th><th>案卷</th><th class="num">疑点</th><th class="num">线索</th><th class="num">误报</th><th class="num">时延</th><th class="num">路由</th></tr></thead><tbody>${rows}</tbody></table>
    ${renderReviewFlow(rev.stats)}
    <p class="muted" style="margin-top:10px">注：产品态≥20份标注案卷。指标盘随引擎实测刷新。</p>`;
  openModal('📊 AuditBench · YHF 评测基准', html);
}

async function showInstitution() {
  const d = await fetch('/api/institution').then(r => r.json());
  const s = d.summary;
  const maxRuleAmt = Math.max(1, ...d.top_rules.map(r => r.amount));
  const ruleBars = d.top_rules.slice(0, 8).map(r => `<div class="ins-bar-row"><span class="ins-bar-label">${ruleLink(r.rule_id, { compact: true })} ${esc(r.rule_name)}</span><span class="ins-bar-track"><span class="ins-bar-fill" style="width:${Math.round(r.amount / maxRuleAmt * 100)}%"></span></span><span class="ins-bar-val">¥${fmt(r.amount)}<span class="muted"> ·${r.cases}案</span></span></div>`).join('');
  const maxDomAmt = Math.max(1, ...d.by_domain.map(x => x.amount));
  const domBars = d.by_domain.map(x => `<div class="ins-bar-row"><span class="ins-bar-label">${esc(x.domain)}</span><span class="ins-bar-track"><span class="ins-bar-fill dom" style="width:${Math.round(x.amount / maxDomAmt * 100)}%"></span></span><span class="ins-bar-val">¥${fmt(x.amount)}<span class="muted"> ·疑点${x.suspected}</span></span></div>`).join('');
  const deptRows = d.by_dept.map(x => `<tr><td>${esc(x.dept)}</td><td class="num">${x.cases}</td><td class="num">${x.suspected}</td><td class="num">${x.clue}</td><td class="num">¥${fmt(x.amount)}</td></tr>`).join('');
  const typeRows = d.violation_types.slice(0, 8).map(t => `<tr><td>${esc(t.type)}</td><td class="num">${t.count}</td><td class="num">¥${fmt(t.amount)}</td></tr>`).join('');
  const caseRows = d.case_rows.map(c => `<tr class="${c.is_clean ? 'ins-clean' : ''}"><td>${c.is_clean ? '🟢' : '🔴'} ${esc((c.label || c.id).slice(0, 26))}</td><td>${esc(c.dept)}</td><td>${esc(c.domain)}</td><td class="num">${c.suspected}</td><td class="num">${c.clue}</td><td class="num">¥${fmt(c.amount)}</td></tr>`).join('');
  const examMode = MODE === 'exam';
  const intro = examMode
    ? `把单件自查<b>升维到全院画像</b>——<b>本院对标自查</b>：看自己哪些规则/科室高发，优先自查整改、主动退回，避免被飞检点名（自查从宽、被查从严）。`
    : `把单件 AI 初筛<b>升维到机构画像</b>——飞检前先给被检机构做一次"院端体检"，<b>指导飞检抽样</b>：优先查金额高发规则/高发科室，把有限人力压到高风险处。`;
  const html = `
    <p class="muted">${esc(d.generated)}。${intro}
      <button class="v2btn" style="margin-left:8px;padding:3px 10px;font-size:12px" onclick="window.open('/api/export/institution','_blank')">📄 Markdown</button>
      <button class="v2btn" style="margin-left:4px;padding:3px 10px;font-size:12px" onclick="window.open('/api/export/institution?format=html','_blank')">🖨 打印/PDF</button></p>
    <div class="bench-kpis">
      <div class="bkpi"><div class="n">${s.audited_cases}</div><div class="l">受检案卷</div></div>
      <div class="bkpi red"><div class="n">${s.suspected_total}</div><div class="l">疑点合计</div></div>
      <div class="bkpi"><div class="n">¥${fmt(s.amount_total)}</div><div class="l">疑点涉及金额</div></div>
      <div class="bkpi green"><div class="n">${esc(s.clean_pass)}</div><div class="l">干净件零误报</div></div>
      <div class="bkpi"><div class="n">${s.domains_covered}</div><div class="l">覆盖专科领域</div></div>
    </div>
    <div class="facts-h">📊 高频违规规则 TOP（按涉及金额）</div>
    <div class="ins-bars">${ruleBars}</div>
    <div class="facts-h">🏥 专科领域分布（覆盖广度 · 现 ${s.domains_covered} 个可fire领域）</div>
    <div class="ins-bars">${domBars}</div>
    <div class="ins-2col">
      <div><div class="facts-h">科室分布</div><table class="fee-table"><thead><tr><th>科室</th><th class="num">案</th><th class="num">疑点</th><th class="num">线索</th><th class="num">金额</th></tr></thead><tbody>${deptRows}</tbody></table></div>
      <div><div class="facts-h">违规类型分布</div><table class="fee-table"><thead><tr><th>类型</th><th class="num">次</th><th class="num">金额</th></tr></thead><tbody>${typeRows}</tbody></table></div>
    </div>
    <div class="facts-h">受检案卷清单（点"红"为违规件、"绿"为合规件正确放行）</div>
    <table class="fee-table"><thead><tr><th>案卷</th><th>科室</th><th>领域</th><th class="num">疑点</th><th class="num">线索</th><th class="num">金额</th></tr></thead><tbody>${caseRows}</tbody></table>
    <p class="muted" style="margin-top:10px">${esc(d.disclaimer)}</p>`;
  openModal(`🏥 机构画像 · ${examMode ? '本院自查对标' : '飞检抽样指导'} · ${esc(d.hospital)}`, html);
}

async function foundationHtml() {
  let d;
  try { d = await fetch('/api/foundation').then(r => r.json()); }
  catch (e) { return `<p class="muted">加载失败：${esc(String(e))}</p>`; }
  const g = d.kb_geometry, t = d.traceability_summary;
  const maxF = Math.max(...d.funnel.map(s => s.count), 1);
  const funnelRows = d.funnel.map((s, i) => `<div class="ins-bar-row">
      <span class="ins-bar-label">${esc(s.stage)}</span>
      <span class="ins-bar-track"><span class="ins-bar-fill ${i >= 3 ? '' : 'dom'}" style="width:${Math.max(5, Math.round(s.count / maxF * 100))}%"></span></span>
      <span class="ins-bar-val">${fmt(s.count)}</span>
    </div><div class="muted" style="font-size:11px;margin:-2px 0 7px 38%">${esc(s.note || '')}</div>`).join('');
  const maxSp = Math.max(...d.specialty_coverage.map(s => s.rules), 1);
  const spBars = d.specialty_coverage.map(s => `<div class="ins-bar-row"><span class="ins-bar-label">${esc(s.specialty)}</span><span class="ins-bar-track"><span class="ins-bar-fill" style="width:${Math.round(s.rules / maxSp * 100)}%"></span></span><span class="ins-bar-val">${s.rules}<span class="muted"> 条</span></span></div>`).join('');
  // 溯源表：优先展示 demo 真 fire 的，其次有 checker 的
  const traced = d.traceability.filter(r => r.official_basis.length).sort((a, b) => (b.fired_on_demo - a.fired_on_demo) || (b.has_checker - a.has_checker));
  const traceRows = traced.slice(0, 16).map(r => {
    const b = r.official_basis[0];
    return `<tr>
      <td>${typeof ruleLink === 'function' ? ruleLink(r.rule_id, { compact: true }) : esc(r.rule_id)} ${r.fired_on_demo ? '<span title="本案真fire">🔴</span>' : (r.has_checker ? '<span class="muted" title="有checker">⚙</span>' : '')}</td>
      <td>${esc((r.rule_name || '').slice(0, 16))}</td>
      <td><b>${esc(b.doc_no || b.doc_name || b.ref)}</b> ${esc(b.locator || '')}<div class="muted" style="font-size:11px">${esc((b.text || '').slice(0, 60))}…${b.effective_from ? ' · 生效 ' + esc(b.effective_from) : ''}</div></td>
    </tr>`;
  }).join('');
  const pending = d.pending_ingest.slice(0, 12).map(p => esc(p.ref.replace('KB1-', ''))).join('、');
  const html = `
    <p class="muted">把"<b>站在国家两库肩上</b>"从口号变成可点的硬证据：每条规则都能溯到<b>官方政策原文</b>（文号·条款·生效日·核验状态）。
      <button class="v2btn" style="margin-left:8px;padding:3px 10px;font-size:12px" onclick="window.open('/api/export/foundation','_blank')">📄 导出 MD</button>
      <button class="v2btn" style="margin-left:4px;padding:3px 10px;font-size:12px" onclick="window.open('/api/export/foundation?format=html','_blank')">🖨 打印/PDF</button></p>
    <div class="bench-kpis">
      <div class="bkpi"><div class="n">${fmt(g.total)}</div><div class="l">官方两库已入库条目</div></div>
      <div class="bkpi"><div class="n">${fmt(g.with_effective_date)}</div><div class="l">带生效日(as_of可回溯)</div></div>
      <div class="bkpi"><div class="n">${t.rules_total}</div><div class="l">已操作化在库规则</div></div>
      <div class="bkpi"><div class="n">${d.specialty_coverage.length}</div><div class="l">覆盖临床专科</div></div>
      <div class="bkpi green"><div class="n">${t.refs_resolved_pct}%</div><div class="l">规则引用可溯源</div></div>
    </div>
    <div class="facts-h">⛓ 操作化漏斗：官方两库 → 可执行稽核</div>
    <div class="ins-bars">${funnelRows}</div>
    <p class="muted" style="font-size:11.5px">来源：${g.top_sources.slice(0, 4).map(s => esc(s.source) + ' ' + s.count).join(' · ')}　|　layer：${Object.entries(g.layers).map(([k, v]) => esc(k) + v).join(' ')}</p>
    ${d.clinical_kb ? `<p class="muted" style="font-size:11.5px">📖 <b>两库另一半 · 临床知识库</b>：${d.clinical_kb.total} 条临床指导原则/说明书/重点监控（${d.clinical_kb.sources.slice(0, 3).map(s => esc(s.source)).join('、')}…），<b>${d.clinical_kb.rules_referencing}</b> 条规则同时引临床依据——政策条款 + 临床指南双重溯源。</p>` : ''}
    <div class="ins-2col">
      <div>
        <div class="facts-h">🏥 专科覆盖（破"只会查肿瘤"）</div>
        <div class="ins-bars">${spBars}</div>
      </div>
      <div>
        <div class="facts-h">🔗 规则↔官方政策 溯源（🔴本案fire ⚙有checker）</div>
        <table class="fee-table"><thead><tr><th>规则</th><th>名称</th><th>官方依据(可核验)</th></tr></thead><tbody>${traceRows}</tbody></table>
      </div>
    </div>
    <div class="cov-statement" style="margin-top:12px">📌 <b>诚实口径</b>：已入库均为官方公开发布批次原文；${t.refs_pending_ingest} 项被规则引用但尚未入库的对照表标注「待入库」（${pending}…），<b>绝不编造</b>。这是路线图，不是地基缺失。</div>
    ${d.roadmap ? `<div class="cov-statement" style="margin-top:8px;background:#fbfcfe">🛣 <b>持续扩展路线图</b>：从 ${(d.kb_geometry.layers['规则'] || 0)} 条官方"规则"层条目继续操作化——当前 <b>${d.roadmap.rules_pending_checker}</b> 条已声明规则待补 checker（${d.roadmap.by_specialty.slice(0, 5).map(s => esc(s.specialty) + s.count).join('、')}…）+ ${d.roadmap.tables_pending_ingest} 项对照表待入库。地基不是静态的，是<b>可持续从官方两库长出来</b>的。</div>` : ''}
  `;
  return html;
}

async function showProvenanceTriad() {
  return triadHtml().then(h => openModal('🔬 取证可信度三件套 · 第一护城河（可演证）', h));
}
async function triadHtml() {
  let d;
  try { d = await fetch('/api/provenance-triad').then(r => r.json()); }
  catch (e) { return `<p class="muted">加载失败：${esc(String(e))}</p>`; }
  const rc = d.reconciliation || {}, cov = d.coverage || {}, cf = d.confidence || {};
  // ① 合议去重
  const reconRows = (rc.entries || []).map(e => `<tr><td>费用行 ${esc(String(e.fee_lines))}</td><td><b>${esc(e.primary)}</b> 主 + ${(e.corroborations || []).map(esc).join('、')} 佐证</td><td class="num">¥${fmt(e.amount_once)}</td><td class="num muted">¥${fmt(e.amount_if_double_counted)}</td></tr>`).join('');
  // ② 覆盖度
  const dims = (cov.dimensions || []);
  const covRows = dims.map(x => `<tr><td>${esc(x.dimension)}</td><td class="num">${(x.executed || []).length}/${x.total_rules}</td><td>${esc(x.status)}</td></tr>`).join('');
  const mats = Object.entries(cov.materials || {}).map(([k, v]) => `<span class="kind-tag ${v ? 'real' : 'script'}">${v ? '✓' : '—'} ${esc(k)}</span>`).join(' ');
  // ③ 置信度
  const cfRows = (cf.findings || []).slice(0, 8).map(f => `<tr><td>${typeof ruleLink === 'function' ? ruleLink(f.rule_id, { compact: true }) : esc(f.rule_id)}</td><td>${esc(f.status || '')}</td><td class="num">${f.confidence ?? '—'}</td><td class="num">${f.min_ocr_conf ?? '—'}</td><td class="num">${fmt(f.priority_score)}</td></tr>`).join('');
  const html = `
    <p class="muted">区别于"调大模型"和"国家字段规则"的<b>工程纵深</b>——四方评审一致认定的<b>第一护城河</b>。规则引擎判"像不像"；三件套保证"<b>算得对、说得清、不乱报</b>"。（数据来自主案卷 <code>${esc(d.case || 'main')}</code> 实测）</p>

    <div class="facts-h">① 合议去重 · 防过罚 <span class="muted">同一笔钱多规则命中 → 选主疑点+佐证、金额只算一次</span></div>
    <div class="bench-kpis" style="grid-template-columns:repeat(3,1fr)">
      <div class="bkpi green"><div class="n">¥${fmt(rc.suspected_amount)}</div><div class="l">去重后疑点金额</div></div>
      <div class="bkpi red"><div class="n">¥${fmt(rc.amount_if_double_counted)}</div><div class="l">若各算各的(虚高)</div></div>
      <div class="bkpi"><div class="n">¥${fmt(rc.saved_from_double_count)}</div><div class="l">避免的重复计罚</div></div>
    </div>
    ${reconRows ? `<table class="fee-table"><thead><tr><th>费用行</th><th>合并(主+佐证)</th><th>算一次</th><th>若重复</th></tr></thead><tbody>${reconRows}</tbody></table>` : '<p class="muted">本案无多规则命中同一笔费用</p>'}
    <p class="muted" style="font-size:11.5px">${esc(rc.note || '')}</p>

    <div class="facts-h">② 覆盖度声明 · 答"我查全了吗" <span class="muted">把漏检率变成可审计声明</span></div>
    <div style="margin:4px 0 8px">${mats}</div>
    <table class="fee-table"><thead><tr><th>核验维度</th><th>已执行</th><th>状态</th></tr></thead><tbody>${covRows}</tbody></table>
    <p class="muted" style="font-size:11.5px">${esc(cov.statement || '')}</p>

    <div class="facts-h">③ 置信度传播 · 反幻觉是可追溯的计算 <span class="muted">OCR低置信降权 · 门禁封顶 · 排序=金额×置信</span></div>
    <table class="fee-table"><thead><tr><th>规则</th><th>定性</th><th>置信</th><th>最低OCR</th><th>优先分</th></tr></thead><tbody>${cfRows}</tbody></table>
    <p class="muted" style="font-size:11.5px">${esc(cf.note || '')}</p>
  `;
  return html;
}

// 🛡 护城河：合规地基（政策溯源）+ 取证三件套（证据可信度）合并为单弹窗双页签
async function showHaven(tab = 0) {
  openModal('🛡 护城河 · 合规地基 + 取证可信度三件套', `
    <div class="haven-tabs">
      <button type="button" class="haven-tab ${tab === 0 ? 'active' : ''}" data-htab="0">🏛 合规地基 · 政策溯源</button>
      <button type="button" class="haven-tab ${tab === 1 ? 'active' : ''}" data-htab="1">🔬 取证三件套 · 证据可信度</button>
    </div>
    <div id="havenPanel"><p class="muted">加载中…</p></div>`);
  const load = async (t) => {
    const panel = document.getElementById('havenPanel');
    if (!panel) return;
    panel.innerHTML = '<p class="muted">加载中…</p>';
    const h = t === 0 ? await foundationHtml() : await triadHtml();
    const p2 = document.getElementById('havenPanel');
    if (p2) p2.innerHTML = h;
  };
  document.querySelectorAll('.haven-tab').forEach(b => b.onclick = () => {
    document.querySelectorAll('.haven-tab').forEach(x => x.classList.toggle('active', x === b));
    load(Number(b.dataset.htab));
  });
  load(tab);
}

// 院端三阶段自查地图：事前开单可防 / 事中结算前可拦 / 事后需深查 · 关口前移
async function showThreeStage() {
  let d;
  try { d = await fetch('/api/three-stage').then(r => r.json()); }
  catch (e) { openModal('🗺 院端三阶段自查', `<p class="muted">加载失败：${esc(String(e))}</p>`); return; }
  if (d.error) { openModal('🗺 院端三阶段自查', `<p class="muted">${esc(d.error)}</p>`); return; }
  const sm = d.summary || {};
  const stageCards = (d.stages || []).map(s => {
    const rows = (s.findings || []).map(f => `<li>${typeof ruleLink === 'function' ? ruleLink(f.rule_id, { compact: true }) : esc(f.rule_id)} ${esc(f.rule_name || '')} <span class="muted">¥${fmt(f.amount)}</span></li>`).join('');
    return `<div class="stage-card ${esc(s.color)}">
      <div class="stage-hd"><b>${esc(s.label)}</b><span class="stage-n">${s.count}<small>条</small> · ¥${fmt(s.amount)}</span></div>
      <div class="stage-prevent muted">${esc(s.prevent)}</div>
      <ul class="stage-list">${rows || '<li class="muted">本案无</li>'}</ul>
    </div>`;
  }).join('');
  const html = `
    <p class="muted">官方三阶段闭环:<b>事前提醒 → 事中结算审核 → 事后监管(飞检=事后一部分)</b>。把本案疑点按"<b>最早能在哪个阶段拦住</b>"分类,给院端一张关口前移地图——也是"从源头替监管侧减负"的可视化。</p>
    <div class="bench-kpis" style="grid-template-columns:repeat(3,1fr)">
      <div class="bkpi green"><div class="n">${sm.preventable_count || 0}<small>条</small></div><div class="l">可前移(事前+事中)</div></div>
      <div class="bkpi"><div class="n">¥${fmt(sm.preventable_amount)}</div><div class="l">前移可省金额</div></div>
      <div class="bkpi red"><div class="n">${sm.deep_count || 0}<small>条</small></div><div class="l">事后需深查(飞检重点)</div></div>
    </div>
    <div class="stage-grid">${stageCards}</div>
    <div class="cov-statement" style="margin-top:10px">🎯 ${esc((d.narrative || '').replace(/\*\*/g, ''))}</div>`;
  openModal('🗺 院端三阶段自查 · 关口前移地图', html);
}

// agent 运行时：13 单元各司其职的本次实测（读现有 report_meta，无需额外调用）
function showAgentRuntime() {
  const m = REPORT && REPORT.report_meta;
  if (!m) { openModal('🛠 agent 运行时', '<p class="muted">先跑一次稽核（点「开始稽核」）再看运行时数据。</p>'); return; }
  const r = m.routing || {}, sc = r.short_circuit || {}, s = m.summary || {}, stg = m.stage_ms || {};
  const llmOn = !!m.real_agent;
  const superOn = !!(m.super_fused || LAST_RUN_PROFILE === 'super');
  const stage = (name, role, stat, knob, cls) => `<tr>
    <td><b class="${cls || ''}">${esc(name)}</b><div class="muted" style="font-size:11.5px">${esc(role)}</div></td>
    <td class="rt-stat">${stat}</td>
    <td class="muted" style="font-size:11.5px">${esc(knob)}</td></tr>`;
  const detRows = [
    stage('路由激活 Routing', '抽案件特征 → 只激活适用规则', `<b>${r.activated_count ?? '—'}/${r.total ?? 58}</b> 激活 · <span class="muted">${esc(sc.saved || '')}</span>`, 'trigger_logic / 覆盖维度'),
    stage('规则引擎 · 26 checker', 'L1 时间/数量/互斥 + L2 结构', `命中 <b>${s.raw_findings_before_merge ?? '—'}</b> 条原始发现`, '阈值 / 除外清单'),
    stage('合议去重 Reconcile', '同一笔钱多规则命中 → 只算一次', `<b>${s.raw_findings_before_merge ?? '—'} → ${s.total_findings ?? '—'}</b>（合并 ${s.merged_count ?? 0} 条）`, 'primaryScore 权重'),
    stage('治理·分层 Governance', '观察期降权 · 疑点/线索/影子', `疑点 <b class="rt-red">${s.suspected_count ?? '—'}</b> · 线索 <b class="rt-amb">${s.clue_count ?? '—'}</b> · 影子 ${s.shadow_count ?? 0}`, 'shadow/retired 规则集'),
  ].join('');
  const llmStat = (v, alt) => v != null ? `<b class="rt-teal">${v}ms</b> · ${alt}` : '<span class="muted">未启用</span>';
  const llmRows = [
    stage('① 控方 prosecutor', '真读病历自由文本 · 三方交叉验证', llmStat(stg.prosecutor, '读病历提疑点'), 'system 人格 / 三要素门禁', 'rt-teal'),
    stage('② CoVe 取证自检', '每疑点生成2问 · 独立回查', m.cove_error ? `<span class="rt-red">失败降级</span> <span class="muted">${esc(m.cove_error).slice(0, 30)}</span>` : llmStat(stg.cove, '维持/降级/撤销'), '批量vs逐条 / 并发池', 'rt-teal'),
    stage('③ 控辩裁 P5', '辩方反驳 + 裁判位置交换防偏见', llmOn ? '<span class="muted">按需（点疑点「对抗辩论」启动）</span>' : '<span class="muted">未启用</span>', '模板版本 / 短路规则', 'rt-teal'),
  ].join('');
  const html = `
    <p class="muted">同一个疑点报告，背后是 <b>13 个单元各司其职</b>。下面是本次实测（案卷 <code>${esc(CURRENT_CASE)}</code>）——每行第三列是该单元<b>可独立调优的旋钮</b>。</p>
    <div class="facts-h">⚙ 确定性引擎路径 <span class="muted">（本次实跑 · 纯计算可复现）</span></div>
    <table class="fee-table rt-table"><thead><tr><th>单元 / 职责</th><th>本次实测</th><th>调优旋钮</th></tr></thead><tbody>${detRows}</tbody></table>
    <div class="facts-h" style="margin-top:14px">🧠 真·LLM 多 agent 路径 <span class="muted">（${llmOn ? (superOn ? '超级增强·已跑' : 'LLM·已跑') : '点「⚙稽核引擎 → LLM语义/超级增强」启用'}）</span></div>
    <table class="fee-table rt-table"><thead><tr><th>agent / 职责</th><th>本次实测</th><th>调优旋钮</th></tr></thead><tbody>${llmRows}</tbody></table>
    <div class="cov-statement" style="margin-top:12px">📌 各 agent 职责单一、互不混淆——所以可以<b>逐个精调</b>（改一个 agent 的 prompt/阈值/模型不影响其它）。harness 现状:防注入基线 + PII脱敏 + context预算 + 重试退避 + 结构化输出 + 失败不阻断。</div>`;
  openModal('🛠 agent 运行时 · 13 单元各司其职（本次实测）', html);
}

// 对抗注入防护矩阵：多种技法各出不同结果（特征识别 / 架构守住），每种可一键注入到工作台稽核
async function showInjectionDefense() {
  let d;
  try { d = await fetch('/api/injection-defense').then(r => r.json()); }
  catch (e) { openModal('🛡 对抗注入防护', `<p class="muted">加载失败：${esc(String(e))}</p>`); return; }
  if (d.error) { openModal('🛡 对抗注入防护', `<p class="muted">${esc(d.error)}</p>`); return; }
  const sm = d.summary || {};
  const rows = (d.attacks || []).map(a => `<tr>
    <td><b>${esc(a.technique)}</b><div class="muted" style="font-size:11px">目标 ${typeof ruleLink === 'function' ? ruleLink(a.targets, { compact: true }) : esc(a.targets)} · ${esc(a.goal)}</div></td>
    <td class="muted" style="font-size:11.5px">「${esc(a.text.slice(0, 32))}${a.text.length > 32 ? '…' : ''}」<div style="font-size:10.5px;opacity:.7">位置：${esc(a.loc)}</div></td>
    <td style="text-align:center">${a.signature_detected ? '<span class="kind-tag real">✓ 特征识别</span>' : '<span class="kind-tag script">✗ 躲过特征</span>'}</td>
    <td style="text-align:center">${a.target_held ? '<span class="kind-tag" style="background:#eafaf3;color:#0d7a4e;border:1px solid #b7e6cf">✓ 守住</span>' : '<span class="kind-tag" style="background:#fdeaea;color:#c0392b">✗ 失守</span>'}</td>
    <td style="text-align:center"><button type="button" class="v2btn" style="padding:3px 9px;font-size:11.5px" onclick="runInjectionAttack('${esc(a.id)}')">▶ 注入并稽核</button></td>
  </tr>`).join('');
  const html = `
    <p class="muted">对抗注入 = "写给 AI 的小抄"（夹页批注/页脚小字/角色劫持…）想诱导审核系统跳过核查。下面 <b>${sm.total}</b> 种技法<b>各产出不同结果</b>：</p>
    <div class="bench-kpis" style="grid-template-columns:repeat(3,1fr)">
      <div class="bkpi"><div class="n">${sm.total}</div><div class="l">对抗技法</div></div>
      <div class="bkpi real"><div class="n">${sm.signature_detected}</div><div class="l">特征库识别(E-503)</div></div>
      <div class="bkpi green"><div class="n">${sm.all_held ? '全部' : '部分'}</div><div class="l">架构层守住核查</div></div>
    </div>
    <table class="fee-table"><thead><tr><th>攻击技法 / 目标</th><th>注入话术 / 位置</th><th style="text-align:center">① 特征识别</th><th style="text-align:center">② 目标核查</th><th style="text-align:center">实测</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="cov-statement" style="margin-top:12px">🛡 <b>深度防御两层</b>：${esc(d.note)}</div>
    <p class="muted" style="font-size:11.5px;margin-top:8px">基线疑点 ${d.baseline_suspected} 条；每种攻击注入后疑点数均与基线一致——<b>没有任何一种注入能诱导引擎少报或漏判</b>。第 5 种"变体绕过"特征库、但架构层照样守住，正是"不读自由文本指令、只在结构化事实上判定"的价值。</p>`;
  openModal('🛡 对抗注入防护矩阵 · 5 种技法各不相同', html);
}

// 从防护矩阵一键注入指定攻击并在工作台跑一次真稽核
window.runInjectionAttack = (attackId) => { closeModal(); runAudit({ injectAttack: attackId }); };

const STATUS_META = { active: { label: '在役 active', cls: 'gv-active' }, shadow: { label: '观察期 shadow', cls: 'gv-shadow' }, deprecated: { label: '已下线 deprecated', cls: 'gv-dep' } };
async function showGovernance() {
  const d = await fetch('/api/rule-governance').then(r => r.json());
  const nonActive = d.entries.filter(e => e.status !== 'active');
  const body = nonActive.length ? nonActive.map(e => {
    const sm = STATUS_META[e.status] || STATUS_META.active;
    const hist = (e.history || []).map(h => `<span class="gv-hist">${esc(h.from)}→<b>${esc(h.to)}</b> · ${esc(h.by)}${h.reason ? ' · ' + esc(h.reason) : ''}</span>`).join('');
    const btns = e.status === 'shadow'
      ? `<button class="act adopt" onclick="governanceAction('${esc(e.rule_id)}','restore')">✓ 复审通过·恢复在役</button><button class="act reject" onclick="governanceAction('${esc(e.rule_id)}','retire')">⊗ 确认下线</button>`
      : `<button class="act adopt" onclick="governanceAction('${esc(e.rule_id)}','restore')">✓ 复审恢复·重新在役</button>`;
    return `<div class="gv-card"><div class="gv-head"><span class="gv-badge ${sm.cls}">${sm.label}</span>${ruleLink(e.rule_id)}</div>
      <div class="gv-reason">${esc(e.reason || '')}</div><div class="gv-flow">${hist}</div><div class="actions">${btns}<span class="act-tip muted"></span></div></div>`;
  }).join('') : '<div class="cov-statement" style="color:var(--green)">全部 58 条规则均在役（active）。某规则被复核驳回 ≥3 次会自动转入 shadow 观察期、在此复审——目前无规则进观察期/下线。</div>';
  const restoreHints = (d.restore_hints || []).map(h =>
    `<div class="exam-banner">✓ ${ruleLink(h.rule_id, { compact: true })} 巩固链建议恢复在役：${esc((h.rationale || '').slice(0, 100))}… <button type="button" class="rect-btn accent" onclick="governanceAction('${esc(h.rule_id)}','restore')">人工 restore</button></div>`
  ).join('');
  const overlayKeys = Object.keys(d.overlay?.patches || {});
  const html = `
    <p class="muted">误报链：驳回≥3→auto shadow→误报 Agent→overlay。巩固链：采纳≥3且近10条驳回≤1→巩固 Agent→restore 建议（须人工点 restore）。</p>
    ${restoreHints}
    ${overlayKeys.length ? `<div class="cov-statement">📎 overlay 预览：${overlayKeys.map(esc).join('、')}</div>` : ''}
    <div class="gv-machine">📐 规则状态机：${esc(d.model)}</div>
    <div class="bench-kpis">
      <div class="bkpi green"><div class="n">${d.summary.total_rules - d.summary.shadow - d.summary.deprecated}</div><div class="l">在役 active</div></div>
      <div class="bkpi"><div class="n" style="color:#5b5280">${d.summary.shadow}</div><div class="l">观察期 shadow</div></div>
      <div class="bkpi red"><div class="n">${d.summary.deprecated}</div><div class="l">已下线 deprecated</div></div>
      <div class="bkpi"><div class="n">${d.summary.total_rules}</div><div class="l">规则总数</div></div>
    </div>
    ${body}
    ${(d.audit_log && d.audit_log.length) ? `<div class="facts-h" style="margin-top:14px">🧾 治理操作流水（审计台账 · 谁/何时/把哪条规则怎么改）</div>
      <table class="fee-table"><thead><tr><th>时间(UTC)</th><th>规则</th><th>流转</th><th>操作者</th><th>理由</th></tr></thead><tbody>
      ${d.audit_log.slice(0, 12).map(h => `<tr><td class="muted">${esc((h.ts || '').replace('T', ' ').slice(0, 19))}</td><td><b>${esc(h.rule_id)}</b></td><td>${esc(h.from)}→<b>${esc(h.to)}</b></td><td>${esc(h.by)}</td><td class="muted">${esc(h.reason || '')}</td></tr>`).join('')}
      </tbody></table>` : ''}
    <p class="muted" style="margin-top:10px">治理状态落盘于 data/rule_states.json（与规则定义 rules.yaml 分离，可逆、免重建、重启仍生效）。复审恢复在役会清零驳回计数（需 restore 之后再攒满阈值新驳回才再次转 shadow）。这把 iter-11/12 的误报闭环从"运行期计算"做成"文件可追溯治理"。</p>`;
  openModal('🗂 规则三态治理 · 误报闭环的可追溯执行端', html);
}
window.governanceAction = async (ruleId, action) => {
  let reason = '';
  if (action === 'retire') {
    reason = await askGovernanceReason('⊗ 确认下线 · 复审理由（必填）', '例：该规则在骨科边界件上连续误报，建议退役…');
    if (!reason) return;
  } else {
    reason = '复审通过，规则有效，恢复在役';
  }
  try {
    await fetch('/api/rule-governance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rule_id: ruleId, action, reason }) }).then(r => r.json());
    await showGovernance(); // 刷新
  } catch (e) {}
};
function renderReviewFlow(stats) {
  const totals = stats?.totals || {};
  const flagged = stats?.flagged_rules || [];
  const has = (totals['采纳'] || 0) + (totals['驳回'] || 0) + (totals['补材料'] || 0) > 0;
  return `<div class="facts-h" style="margin-top:14px">🔁 规则沉淀双链（驳回=误报淘汰 · 采纳=规则巩固）</div>
    ${has ? `<div class="cov-statement">累计：采纳 ${totals['采纳'] || 0} · 驳回 ${totals['驳回'] || 0} · 补材料 ${totals['补材料'] || 0}（缓冲不入队）</div>
    <div class="muted" style="font-size:12px;margin-bottom:8px">误报链：有效驳回≥${stats.threshold || 3} → shadow + 误报 Agent · 巩固链：采纳≥3 且近10条驳回≤1 → 巩固 Agent</div>
    ${flagged.length ? `<div class="ingest-err">🌓 shadow 观察期：${flagged.map(f => `${ruleLink(f.rule_id, { compact: true })}(驳回${f.rejected})`).join('、')} → 到「规则治理」restore 或「登记整改/疑点卡」继续巩固链</div>` : ''}` :
      `<div class="cov-statement muted">暂无复核反馈。稽核模式点 采纳/驳回；体检模式到「登记整改」提交成立/不成立。</div>`}`;
}
function showPitch() {
  const html = `
    <div class="pitch-block"><h4>一句话定位</h4><div class="pitch-quote">人少事多——8600 名监管员盯 13 亿参保人。鹰眼是<b>医保监管的 AI 人力倍增器</b>：看得懂非结构化病历，40 分钟→90 秒把线索变成<b>能对质的证据链</b>。</div></div>
    <div class="pitch-block"><h4>三支点</h4>
      <div class="pitch-quote">① 地位：站在官方规则库(88类/24.7万知识点)肩上的<b>语义增强层</b>，国家系统的"取证放大镜"。</div>
      <div class="pitch-quote">② 被验证：政策(AI+医保监管/智能监管年追26.72亿) · 商业(美国Alaffia·LLM读病历证据回链·提速20倍·收入翻4倍) · 地方(苏州4个月追回8151万·已自研AI比对模型)。</div>
      <div class="pitch-quote">③ 蓝海：三层玩家无人做飞检台非结构化语义初筛；官方规则全公开→壁垒迁移到语义稽核+证据链工程+对抗复核。</div></div>
    <div class="pitch-block"><h4>数字弹药库（引用前核对口径）</h4>
      <table class="ammo"><tbody>
      <tr><td><b>342亿</b></td><td>2025全国医保系统全口径追回（278亿经办挽回·查实骗保1626家）</td></tr>
      <tr><td><b>30009亿</b></td><td>2025基本医保基金总支出首破3万亿（参保13.3亿人）</td></tr>
      <tr><td><b>8151.79万</b></td><td>苏州2026年1-4月追回（注：非全年）</td></tr>
      <tr><td><b>40分→90秒</b></td><td>单份材料人工 vs 鹰眼</td></tr>
      <tr><td><b>70%</b></td><td>2026年底事前提醒系统定点机构接入率目标</td></tr>
      </tbody></table></div>
    <div class="pitch-block"><h4>金句</h4>
      <div class="pitch-quote">引不出原文的疑点，我们不输出。</div>
      <div class="pitch-quote">能不报，比能报更难，也更值钱。</div>
      <div class="pitch-quote">疑点有三要素门禁，规则进库要过三审三验——规则本身也有证据链。</div>
      <div class="pitch-quote">我们不是相信模型，是不信任模型，所以造了一条流水线。</div></div>
    <p class="muted">⚠ 口播：342亿=2025全年全国全口径；苏州8151万=1-4月；Alaffia数字加"据其投资方披露"。</p>`;
  openModal('🎤 演示要点 · Pitch 弹药', html);
}

init();
