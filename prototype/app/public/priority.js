'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const selected = new Set();

let lastRank = null;
let examMode = false;
let activeTab = '';

const RISK_LABEL = { 明确违规: '重点核查', 可疑: '需要合议', 干净: '暂无异常' };
const RISK_CLS = { 明确违规: 'risk-hard', 可疑: 'risk-suspect', 干净: 'risk-clean' };
const RISK_HINT = {
  明确违规: '政策限定类 · 硬性字段交叉核验，可直接处置',
  可疑: '合理使用类 · 需人工合议，应听申诉',
  干净: '本次核验各维度未见异常',
};
const DEFAULT_CONFIG = {
  W_CLUE: 0.4,
  AMT_CAP: 100000,
  beta: 0.5,
  gamma: 0.3,
  delta: 0.2,
  R_REF: 5,
  core_mode: 'geometric',
  specialty_weight: 0.15,
  repeat_upgrade_threshold: 3,
  mask_pii: true,
};
const CONFIG_FIELDS = [
  ['beta', '历史命中加权强度', 'HistoryPrior', 'main'],
  ['gamma', '多规则加权强度', 'Breadth', 'main'],
  ['delta', '金额离群加权强度', 'Outlier', 'main'],
  ['AMT_CAP', '金额权重上限（元）', 'AMT_CAP', 'main'],
  ['specialty_weight', '重点领域加权', 'specialty_weight', 'main'],
  ['repeat_upgrade_threshold', '反复升级阈值（次）', 'repeat_upgrade', 'main'],
  ['W_CLUE', '仅线索权重', 'W_CLUE', 'advanced'],
  ['R_REF', '多规则参考数', 'R_REF', 'advanced'],
];

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtMoney(n) {
  return '¥' + Number(n || 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

function trunc(s, max = 44) {
  const t = String(s ?? '');
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function isDemoMode() {
  const p = new URLSearchParams(location.search);
  return p.get('demo') === '1' || localStorage.yy_demo === '1';
}

function queryParams() {
  const p = new URLSearchParams();
  const dept = $('#fDept')?.value.trim();
  const doctor = $('#fDoctor')?.value.trim();
  const status = $('#fStatus')?.value;
  const q = $('#fQ')?.value.trim();
  const amtMin = $('#fAmtMin')?.value;
  if (dept) p.set('dept', dept);
  if (doctor) p.set('doctor', doctor);
  if (status) p.set('status', status);
  if (q) p.set('q', q);
  if (amtMin) p.set('amount_min', amtMin);
  if ($('#btnRefresh')?.dataset.force) p.set('refresh', '1');
  return p.toString();
}

async function parseJsonResponse(r, label) {
  const ct = r.headers.get('content-type') || '';
  if (!r.ok) {
    const err = ct.includes('json') ? (await r.json()).error : await r.text();
    throw new Error(err || `${label}失败 (${r.status})`);
  }
  return r.json();
}

function toast(msg, isErr) {
  let el = $('#priToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'priToast';
    el.className = 'pri-toast hidden';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.toggle('err', !!isErr);
  el.classList.remove('hidden');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 4000);
}

function riskBadge(nature) {
  const n = nature || '可疑';
  return `<span class="risk-badge ${RISK_CLS[n] || 'risk-suspect'}" title="${esc(RISK_HINT[n] || '')}">${esc(RISK_LABEL[n] || n)}</span>`;
}

function tierHint(tier) {
  const text = examMode && tier === 1 ? '风险点' : tier === 1 ? '有疑点' : tier === 2 ? '仅线索' : '观察';
  return `<span class="tier-hint">${text}</span>`;
}

function dispositionText(row) {
  const d = row.disposition || '—';
  return examMode ? d.replace(/处置建议·/g, '自查·').replace(/疑点/g, '风险点') : d;
}

function amountLabel(row) {
  const html = fmtMoney(row.suspected_amount);
  return examMode ? `<span class="exam-label">${html}</span>` : html;
}

function scoreBar(row, maxScore) {
  const score = Number(row.api_score || 0);
  const pct = maxScore > 0 ? Math.max(4, Math.min(100, (score / maxScore) * 100)) : 4;
  return `<div class="score-line"><span>优先指数 ${esc(score)}</span><i style="width:${pct}%"></i></div>`;
}

async function loadRank() {
  $('#rankMeta').textContent = '计算中…';
  try {
    const qs = queryParams();
    const r = await fetch('/api/priority/rank' + (qs ? '?' + qs : ''));
    const data = await parseJsonResponse(r, '队列加载');
    lastRank = data;
    renderQueue(data);
    renderBuckets(data);
    renderGuide(data);
    const stat = riskStats(data.queue || []);
    $('#rankMeta').textContent = `更新于 ${new Date(data.computed_at).toLocaleTimeString()} · 队列 ${data.total} 案 · 重点核查 ${stat.hard} · 需要合议 ${stat.suspect} · 暂无异常 ${stat.clean}`;
  } catch (e) {
    $('#rankMeta').textContent = '加载失败';
    toast(e.message, true);
  } finally {
    delete $('#btnRefresh').dataset.force;
  }
}

function riskStats(queue) {
  const c = { hard: 0, suspect: 0, clean: 0 };
  for (const row of queue) {
    if ((row.nature || '可疑') === '明确违规') c.hard += 1;
    else if ((row.nature || '可疑') === '干净') c.clean += 1;
    else c.suspect += 1;
  }
  return c;
}

function renderGuide(data) {
  const queue = data.queue || [];
  const stat = riskStats(queue);
  const topN = readTopN();
  $('#guideTitle').textContent = `当前 ${queue.length} 个案卷待排查`;
  $('#guideText').textContent = `重点核查 ${stat.hard} · 需要合议 ${stat.suspect} · 暂无异常 ${stat.clean}，建议先处理前 ${Math.min(topN, queue.length || topN)} 名。`;
}

function renderQueue(data) {
  const tbody = $('#queueBody');
  tbody.innerHTML = '';
  selected.clear();
  updateSelHint();

  const queue = data.queue || [];
  const maxScore = Math.max(1, ...queue.map(r => Number(r.api_score || 0)));
  let lastNature = null;
  const totals = {};
  for (const r of queue) totals[r.nature || '可疑'] = (totals[r.nature || '可疑'] || 0) + 1;

  queue.forEach((row, idx) => {
    const nat = row.nature || '可疑';
    if (nat !== lastNature) {
      lastNature = nat;
      const sec = document.createElement('tr');
      sec.className = 'nature-section';
      sec.innerHTML = `<td colspan="7">${riskBadge(nat)} <span class="nature-section-hint">${esc(RISK_HINT[nat] || '')}</span> <span class="muted">${totals[nat]} 案</span></td>`;
      tbody.appendChild(sec);
    }

    const tr = document.createElement('tr');
    tr.dataset.caseId = row.case_id;
    tr.className = 'pri-case-row';
    const tags = (row.risk_tags || []).slice(0, 3).map(t => `<span class="risk-tag">${esc(t)}</span>`).join('');
    const problem = esc(trunc(row.top_violation?.violation_type || '—', 34));
    tr.innerHTML = `
      <td><input type="checkbox" class="row-chk" data-id="${esc(row.case_id)}" aria-label="选择案卷"></td>
      <td class="rank-cell">#${idx + 1}</td>
      <td class="risk-cell">${riskBadge(nat)} ${tierHint(row.tier)} ${scoreBar(row, maxScore)}</td>
      <td class="case-cell">
        <strong>${esc(row.case_title || row.case_id)}</strong>
        <span class="muted">${esc(row.case_id)} · ${esc(row.dept || '—')}</span>
        <span class="muted">历史命中率：患者 ${row.history_hint?.patient ?? 0}% · 科室 ${row.history_hint?.dept ?? 0}%</span>
      </td>
      <td class="num amt-cell">${amountLabel(row)}<span class="muted">${examMode ? '风险点' : '疑点'}${row.suspected_count ?? 0}/线索${row.clue_count ?? 0}</span></td>
      <td class="problem-cell">
        <strong>${problem}</strong>
        <span>${tags}</span>
        <span class="disposition">${esc(trunc(dispositionText(row), 54))}</span>
      </td>
      <td class="pri-row-actions">
        <button type="button" class="btn sm primary btn-detail" data-id="${esc(row.case_id)}">详情</button>
        <div class="pri-more">
          <button type="button" class="btn sm secondary pri-more-btn" aria-label="更多操作">⋯</button>
          <div class="pri-menu">
            <button type="button" class="btn-bd" data-id="${esc(row.case_id)}">归因</button>
            <button type="button" class="btn-pkg" data-id="${esc(row.case_id)}" data-fid="${esc(row.top_violation?.rule_id || '')}">举证包</button>
          </div>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });

  $('#queueCount').textContent = `(${queue.length})`;
  if ($('#queueLegend') && window.PriorityUX) $('#queueLegend').textContent = PriorityUX.scoreLegend;
}

function renderBuckets(data) {
  const shadow = data.shadow_bucket || [];
  const boundary = data.boundary_bucket || [];
  $('#shadowTab')?.classList.toggle('hidden', !shadow.length);
  $('#boundaryTab')?.classList.toggle('hidden', !boundary.length);

  const shadowBody = $('#shadowBody');
  if (shadowBody) {
    shadowBody.innerHTML = shadow.length
      ? shadow.map(row => `<div class="pri-shadow-item">${esc(row.case_title || row.case_id)} · 试运行命中 ${row.shadow_count} 条 · <span class="amt">${fmtMoney(row.shadow_amount)}</span> <span class="muted">（展示用，不计入优先指数）</span></div>`).join('')
      : '<p class="muted">暂无试运行规则命中</p>';
  }

  const boundaryBody = $('#boundaryBody');
  if (boundaryBody) {
    boundaryBody.innerHTML = boundary.length
      ? boundary.map(row => `<div class="pri-boundary-item">${esc(row.case_title || row.case_id)} · <span class="muted">${esc(row.case_id)}</span> · 完整度 ${Math.round((row.completeness || 0) * 100)}% <span class="muted">（仅用于零误报验证）</span></div>`).join('')
      : '<p class="muted">暂无对照组案卷</p>';
  }
}

function setTab(name) {
  activeTab = activeTab === name ? '' : name;
  $$('.pri-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === activeTab));
  $$('.pri-tab-panel').forEach(panel => panel.classList.toggle('hidden', panel.id !== `tab-${activeTab}`));
}

function updateSelHint() {
  $('#selHint').textContent = selected.size ? `已选 ${selected.size} 个案卷` : '未选择案卷';
  $('#btnBatch').disabled = selected.size === 0;
}

async function runBatch() {
  if (!selected.size) return;
  const btn = $('#btnBatch');
  btn.disabled = true;
  btn.textContent = '提交中…';
  try {
    const r = await fetch('/api/audit/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseIds: [...selected], mode: 'live', priority: true, concurrency: 3 }),
    });
    const data = await parseJsonResponse(r, '批量稽核');
    if (!data.ok) throw new Error(data.error || '提交失败');
    toast(`已提交 ${selected.size} 个案卷进入批量稽核，进度见看板`);
    selected.clear();
    await loadRank();
  } catch (e) {
    toast(e.message, true);
  } finally {
    btn.textContent = '加入批量稽核';
    btn.disabled = selected.size === 0;
    updateSelHint();
  }
}

function readTopN() {
  const v = Number($('#priTopN')?.value);
  return Number.isFinite(v) && v > 0 ? Math.min(50, Math.floor(v)) : 10;
}

async function runBatchTopN() {
  const top_n = readTopN();
  const btn = $('#btnBatchTopN');
  btn.disabled = true;
  btn.textContent = '提交中…';
  try {
    const r = await fetch('/api/audit/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority: true, top_n, mode: 'live', skip: ['uploaded'], concurrency: 3 }),
    });
    const data = await parseJsonResponse(r, '批量稽核');
    if (!data.ok) throw new Error(data.error || '提交失败');
    toast(`已提交 ${top_n} 个案卷进入批量稽核，进度见看板`);
    await loadRank();
  } catch (e) {
    toast(e.message, true);
  } finally {
    btn.textContent = '开始批量稽核';
    btn.disabled = false;
  }
}

async function fetchCaseDetail(caseId, { refresh = false } = {}) {
  const qs = refresh ? '?refresh=1' : '';
  const r = await fetch(`/api/cases/${encodeURIComponent(caseId)}${qs}`);
  return parseJsonResponse(r, '案卷详情加载');
}

function openDrawer() {
  $('#detailMask')?.classList.remove('hidden');
  const panel = $('#detailPanel');
  panel.classList.remove('hidden');
  panel.setAttribute('aria-hidden', 'false');
}

function closeDrawer() {
  $('#detailMask')?.classList.add('hidden');
  const panel = $('#detailPanel');
  panel.classList.add('hidden');
  panel.setAttribute('aria-hidden', 'true');
}

async function showDetail(caseId) {
  $('#detailTitle').textContent = '加载中…';
  $('#detailContent').innerHTML = '<p class="muted">正在加载案卷详情…</p>';
  const wb = $('#btnOpenWorkbench');
  if (wb) wb.href = '/?case=' + encodeURIComponent(caseId);
  openDrawer();
  try {
    const data = await fetchCaseDetail(caseId);
    $('#detailTitle').textContent = data.case?.case_title || caseId;
    const findings = data.findings || [];
    const suspected = findings.filter(f => f.status === '疑点' && !f.shadow);
    const clues = findings.filter(f => f.status === '线索' && !f.shadow);
    const trial = findings.filter(f => f.shadow);
    const c = data.case || {};
    const meta = data.record_meta?.case_meta || {};
    let html = `<p class="muted">状态 ${esc(c.status || '—')} · 完整度 ${c.completeness ?? '—'}% · 证据锚点覆盖 ${c.anchor_coverage ?? '—'}% · DRG ${esc(c.drg_group || meta.drg_group || '—')} · 特例单议 ${esc(c.special_case_review || meta.special_case_review || '无')}</p>`;
    if ((c.risk_tags || []).length) html += `<p>${c.risk_tags.map(t => `<span class="risk-tag">${esc(t)}</span>`).join('')}</p>`;
    const dip = c.inpatient_metrics || meta.inpatient_metrics;
    if (dip) html += `<p class="muted">DIP 辅助：${Object.entries(dip).map(([k, v]) => `${esc(k)}=${esc(v)}`).join(' · ')}</p>`;
    html += `<h3>${examMode ? '风险点' : '疑点'} (${suspected.length})</h3>${renderFindings(suspected, false, caseId)}`;
    html += `<h3>线索 (${clues.length})</h3>${renderFindings(clues, false, caseId)}`;
    if (trial.length) html += `<h3>新规则试运行 (${trial.length})</h3>${renderFindings(trial, true, caseId)}`;
    const audits = data.audit_records || [];
    if (audits.length) {
      html += '<h3>法定留痕</h3>';
      for (const ar of audits.slice(0, 3)) {
        html += `<div class="pri-finding muted"><h4>${esc(ar.audit_id)} · ${esc(ar.finished_at)}</h4>`;
        if (ar.collective_decision) html += `<div class="pri-evidence"><strong>集体决策</strong>\n${esc(JSON.stringify(ar.collective_decision, null, 2))}</div>`;
        if (ar.defense) html += `<div class="pri-evidence"><strong>申辩</strong>\n${esc(JSON.stringify(ar.defense, null, 2))}</div>`;
        if (ar.timeline?.length) html += `<div class="pri-evidence"><strong>时间线</strong>\n${ar.timeline.map(t => `${esc(t.at)} · ${esc(t.event)}`).join('\n')}</div>`;
        if (ar.appeal_channel) html += `<p class="muted">${esc(ar.appeal_channel)}</p>`;
        html += '</div>';
      }
    }
    $('#detailContent').innerHTML = html;
  } catch (e) {
    $('#detailTitle').textContent = caseId;
    $('#detailContent').innerHTML = `<p class="muted err-text">详情加载失败：${esc(e.message)}</p>`;
    toast(e.message, true);
  }
}

function renderFindings(list, trial, caseId) {
  if (!list.length) return '<p class="muted">无</p>';
  return list.map(f => {
    const status = examMode && f.status === '疑点' ? '风险点' : f.status;
    return `
      <div class="pri-finding ${f.status === '疑点' ? 'suspected' : 'clue'}${trial ? ' muted' : ''}">
        <h4>${riskBadge(f.nature)} ${esc(f.rule_id)} · ${esc(status)} · ${fmtMoney(f.amount_involved)} ${trial ? '（试运行不计分）' : ''}</h4>
        <div class="muted">${esc(f.violation_type)}${f.violation_nature ? ` · <span class="subjective">${esc(f.violation_nature)}</span>` : ''}${f.disposition_suggestion ? ' · ' + esc(examMode ? f.disposition_suggestion.replace(/处置建议·/g, '自查·') : f.disposition_suggestion) : ''}</div>
        <div class="pri-evidence"><strong>证据</strong>\n${(f.evidence || []).map(e => `[${e.type}] ${e.loc}: ${e.text}`).join('\n')}</div>
        <div class="pri-evidence"><strong>条款</strong>\n${(f.policy || []).map(p => `${p.ref}: ${p.text}`).join('\n')}${examMode && (f.policy || []).length ? '\n\n【院端自查说明】以上条款原文供院端自查对照，分数与排序不因展示口径改变。' : ''}</div>
        <div class="pri-evidence"><strong>推理</strong>\n${esc(f.reasoning)}</div>
        ${(f.needs_more || []).length ? `<div class="pri-evidence"><strong>需调阅</strong>\n${f.needs_more.join('\n')}</div>` : ''}
        ${caseId && !trial ? `<button type="button" class="btn sm ghost btn-pkg-f" data-id="${esc(caseId)}" data-fid="${esc(f.finding_id || f.rule_id || '')}">导出举证包</button>` : ''}
      </div>`;
  }).join('');
}

async function showBreakdown(caseId) {
  let row = (lastRank?.queue || []).concat(lastRank?.shadow_bucket || []).concat(lastRank?.boundary_bucket || []).find(r => r.case_id === caseId);
  $('#bdTitle').textContent = `${caseId} · 分数归因`;
  $('#bdBody').innerHTML = '<p class="muted">计算中…</p>';
  $('#breakdownModal').classList.remove('hidden');
  if (!row?.breakdown) {
    try {
      const data = await fetchCaseDetail(caseId);
      row = data.score || row;
    } catch (e) {
      $('#bdBody').innerHTML = `<p class="err-text">归因加载失败：${esc(e.message)}</p>`;
      toast(e.message, true);
      return;
    }
  }
  if (!row) {
    $('#bdBody').innerHTML = '<p class="muted">未找到该案卷的排序数据</p>';
    return;
  }
  $('#bdTitle').textContent = `${caseId} · 优先指数 ${row.api_score ?? '—'}`;
  $('#bdBody').innerHTML = window.PriorityUX?.formatBreakdownHtml
    ? PriorityUX.formatBreakdownHtml(row)
    : `<pre class="pri-pre">${esc(PriorityUX?.formatBreakdownText?.(row) || JSON.stringify(row.breakdown, null, 2))}</pre>`;
}

function showScoreHelp() {
  $('#bdTitle').textContent = '优先指数怎么读';
  $('#bdBody').innerHTML = `<div class="pri-breakdown">
    <p>排序规则：先看风险层（有疑点 > 仅线索），层内按优先指数从高到低。</p>
    <p>指数越高，越应该先安排稽核；它不是质量评分。</p>
    <p class="muted">内部字段名仅用于接口和导出，界面统一使用中文业务词。</p>
  </div>`;
  $('#breakdownModal').classList.remove('hidden');
}

async function loadProfile() {
  const el = $('#profileBody');
  try {
    const r = await fetch('/api/history');
    const d = await parseJsonResponse(r, '历史画像加载');
    const dims = ['dept', 'doctor', 'drg_group'];
    el.innerHTML = dims.map(dim => {
      const rows = (d.hit_rates?.[dim] || []).slice(0, 5);
      const title = dim === 'dept' ? '科室' : dim === 'doctor' ? '医生' : 'DRG组';
      return `<div class="pri-profile-col"><h4>${title} TOP5 命中率</h4><ul>${rows.length ? rows.map(x => `<li>${esc(x.label)} · ${Math.round(x.hit_rate * 100)}% · ${fmtMoney(x.suspected_amount)}</li>`).join('') : '<li>暂无稽核历史</li>'}</ul></div>`;
    }).join('') + '<div class="pri-profile-col"><h4>重点领域</h4><ul><li>肿瘤 · 麻醉 · 重症 · 心血管 · 骨科 · 血透 · 康复 · 影像 · 检验</li><li class="muted">命中重点领域的案卷会提高优先级</li></ul></div>';
    el.classList.remove('muted');
  } catch (e) {
    el.textContent = '画像加载失败: ' + e.message;
  }
}

function tableFromRows(title, rows) {
  if (!rows?.length) return `<h4>${esc(title)}</h4><p class="muted">暂无数据</p>`;
  const keys = Object.keys(rows[0]);
  return `<h4>${esc(title)}</h4><div class="pri-table-wrap"><table class="pri-table pri-report-table"><thead><tr>${keys.map(k => `<th>${esc(k)}</th>`).join('')}</tr></thead><tbody>${
    rows.map(row => `<tr>${keys.map(k => `<td>${typeof row[k] === 'number' ? esc(Number(row[k]).toLocaleString('zh-CN')) : esc(row[k])}</td>`).join('')}</tr>`).join('')
  }</tbody></table></div>`;
}

async function previewReport() {
  const groupBy = $('#reportGroupBy').value;
  const groupLabel = { violation_type: '违规类型', nature: '违规性质', dept: '科室' }[groupBy] || groupBy;
  const mode = examMode ? '&mode=exam' : '';
  try {
    const r = await fetch(`/api/report/violation-summary?group_by=${encodeURIComponent(groupBy)}${mode}`);
    const d = await parseJsonResponse(r, '违规统计预览');
    $('#reportBody').innerHTML = `<p class="muted">按${esc(groupLabel)}分组 · 生成于 ${esc(d.exported_at || new Date().toISOString())}</p>`
      + tableFromRows('违规点认定', d.tables?.recognition || [])
      + tableFromRows('费用统计', d.tables?.amount || []);
  } catch (e) {
    $('#reportBody').innerHTML = `<p class="err-text">预览失败：${esc(e.message)}</p>`;
    toast(e.message, true);
  }
}

const CHECKLIST_STATUSES = ['未查', '已查无问题', '发现问题', '已整改'];
async function openChecklistModal() {
  const caseId = selected.size ? [...selected][0] : 'main';
  const r = await fetch(`/api/checklist/full?case_id=${encodeURIComponent(caseId)}`);
  const d = await r.json();
  const s = d.summary || {};
  $('#checklistMeta').textContent = `官方全量 ${s.total} 条 · 已查 ${s.checked}（${s.completion}%）· 发现问题 ${s.found} · 已整改 ${s.rectified} · 对照案卷 ${caseId}`;
  const byDomain = {};
  for (const row of d.rows || []) (byDomain[row.domain] = byDomain[row.domain] || []).push(row);
  const domStats = Object.fromEntries((d.by_domain || []).map(x => [x.domain, x]));
  $('#checklistBody').innerHTML = Object.entries(byDomain).map(([domain, rows]) => {
    const st = domStats[domain] || {};
    const items = rows.map(row => `
      <div class="pri-check-item ${row.engine_hit ? 'hit' : ''}" data-item="${esc(row.id)}">
        <div class="pri-check-line">
          <span><strong>${row.no != null ? '序' + row.no : ''}</strong> [${esc(row.type)}] ${esc(row.text)}</span>
          <select class="pri-check-status" data-item="${esc(row.id)}">
            ${CHECKLIST_STATUSES.map(x => `<option ${x === row.status ? 'selected' : ''}>${x}</option>`).join('')}
          </select>
        </div>
        <div class="muted">
          ${row.engine_hit ? `引擎命中: ${row.engine_findings.map(f => `${esc(f.rule_id)}(${esc(f.status)})`).join(' ')}` : (row.rule_profile || []).length ? `可对照规则: ${row.rule_profile.join(' ')}` : '暂无对应引擎规则（人工自查项）'}
          ${row.dept ? ` · 科室:${esc(row.dept)}` : ''}${row.note ? ` · ${esc(row.note)}` : ''}
        </div>
      </div>`).join('');
    return `<details class="pri-check-domain" ${st.found || st.engine_hits ? 'open' : ''}>
      <summary><b>${esc(domain)}</b> <span class="muted">${st.checked || 0}/${st.total || rows.length} 已查${st.found ? ` · 发现${st.found}` : ''}${st.engine_hits ? ` · 引擎命中${st.engine_hits}` : ''}</span></summary>
      ${items}
    </details>`;
  }).join('') || '<p class="muted">清单为空</p>';
  $$('.pri-check-status', $('#checklistBody')).forEach(sel => {
    sel.addEventListener('change', async (e) => {
      try {
        await fetch('/api/checklist/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checklist_id: 'national-full-self', item_id: e.target.dataset.item, status: e.target.value }),
        });
        toast(`已登记：${e.target.value}`);
      } catch (err) {
        toast('登记失败: ' + err.message, true);
      }
    });
  });
  $('#checklistModal').classList.remove('hidden');
}

async function openEvidencePackage(caseId, findingId) {
  const modal = $('#pkgModal');
  const frame = $('#pkgFrame');
  modal?.classList.remove('hidden');
  if (frame) frame.srcdoc = '<p style="padding:24px;font-family:sans-serif">生成举证包…</p>';
  try {
    const r = await fetch('/api/evidence-package', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ case_id: caseId, finding_id: findingId || undefined, format: 'html' }),
    });
    const ct = r.headers.get('content-type') || '';
    if (!r.ok) {
      const err = ct.includes('json') ? (await r.json()).error : await r.text();
      throw new Error(err || `HTTP ${r.status}`);
    }
    const html = await r.text();
    if (frame) frame.srcdoc = html;
  } catch (e) {
    if (frame) frame.srcdoc = `<p style="padding:24px;color:#b91c1c">${esc(e.message)}</p>`;
    toast('举证包：' + e.message, true);
  }
}

function configInput(name) {
  return $(`[name="${name}"]`, $('#configForm'));
}

function presetConfig(type) {
  const base = { ...DEFAULT_CONFIG };
  if (type === 'amount') {
    base.AMT_CAP = 50000;
    base.delta = 0.45;
  }
  if (type === 'history') {
    base.beta = 0.85;
  }
  return base;
}

function applyPreset(type) {
  const cfg = presetConfig(type === 'reset' ? 'default' : type);
  for (const [key] of CONFIG_FIELDS) {
    const el = configInput(key);
    if (el) el.value = cfg[key] ?? '';
  }
  const core = configInput('core_mode');
  if (core) core.value = cfg.core_mode || 'geometric';
  const mask = configInput('mask_pii');
  if (mask) mask.value = cfg.mask_pii === false ? 'false' : 'true';
}

async function openConfig() {
  const r = await fetch('/api/priority/config');
  const { config = {} } = await r.json();
  const merged = { ...DEFAULT_CONFIG, ...config };
  const form = $('#configForm');
  const hints = window.PriorityUX?.CONFIG_HINTS || {};
  const fieldHtml = (group) => CONFIG_FIELDS.filter(([, , , g]) => g === group).map(([k, label, code]) => {
    const tip = hints[k] ? `${hints[k]}（字段名 ${code}）` : code;
    return `<label title="${esc(tip)}">${label}<span class="cfg-code">${code}</span><input name="${k}" type="number" step="any" value="${merged[k] ?? ''}"></label>`;
  }).join('');
  form.innerHTML = fieldHtml('main')
    + `<details class="pri-advanced"><summary>高级参数</summary><div class="pri-config-form-inner">${fieldHtml('advanced')}
      <label title="核心项合成方式">核心合成<span class="cfg-code">core_mode</span><select name="core_mode"><option value="geometric" ${merged.core_mode === 'geometric' ? 'selected' : ''}>几何均值（默认）</option><option value="weighted" ${merged.core_mode === 'weighted' ? 'selected' : ''}>加权和</option></select></label>
      <label title="隐藏患者姓名">隐藏患者姓名<span class="cfg-code">mask_pii</span><select name="mask_pii"><option value="true" ${merged.mask_pii !== false ? 'selected' : ''}>开启</option><option value="false" ${merged.mask_pii === false ? 'selected' : ''}>关闭</option></select></label>
    </div></details>`;
  $('#configModal').classList.remove('hidden');
}

async function saveConfig() {
  const form = $('#configForm');
  const config = {};
  for (const [k] of CONFIG_FIELDS) {
    const v = form.elements[k]?.value;
    if (v !== '') config[k] = Number(v);
  }
  config.core_mode = form.elements.core_mode?.value || 'geometric';
  config.mask_pii = form.elements.mask_pii?.value === 'true';
  try {
    const r = await fetch('/api/priority/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config, actor: 'priority-ui' }),
    });
    await parseJsonResponse(r, '权重保存');
    $('#configModal').classList.add('hidden');
    $('#btnRefresh').dataset.force = '1';
    await loadRank();
    toast('权重已保存，已按新权重重新排序');
  } catch (e) {
    toast(e.message, true);
  }
}

async function loadPreAlerts() {
  try {
    const d = await fetch('/api/precheck/ledger').then(r => r.json());
    const pend = d.pending_supervision || [];
    const supN = d.supervised_count || 0;
    $('#preAlertBadge')?.classList.toggle('hidden', !pend.length);
    if ($('#preAlertBadge')) $('#preAlertBadge').textContent = pend.length || '';
    $('#preAlertMeta').textContent = pend.length ? `${pend.length} 单待重点审核 · 已回执 ${supN} · 院端今日萌芽拦截 ${d.budding_intercepts || 0} 条` : '暂无未遵从（院端均采纳整改）';
    const body = $('#preAlertBody');
    if (!pend.length) {
      body.innerHTML = '<p class="muted" style="font-size:12px">暂无，院端均采纳了事前提醒。</p>';
      return;
    }
    const hhmm = (iso) => {
      try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch (_) { return String(iso).slice(11, 16); }
    };
    const dispCell = (e) => {
      if (e.supervisor_disposition) {
        const sd = e.supervisor_disposition;
        const cls = sd.verdict === '核实违规' ? 'receipt-hard' : sd.verdict === '驳回误报' ? 'receipt-muted' : 'receipt-ok';
        return `<span class="receipt ${cls}" title="${esc(sd.next_step || '')}">监管回执：${esc(sd.verdict)}</span>${sd.next_step ? `<div class="muted" style="font-size:11px;margin-top:2px">→ ${esc(sd.next_step)}</div>` : ''}`;
      }
      return `<button class="btn sm secondary sup-btn" data-id="${esc(e.id)}" data-v="核实违规">核实违规</button> <button class="btn sm secondary sup-btn" data-id="${esc(e.id)}" data-v="驳回误报">驳回</button> <button class="btn sm secondary sup-btn" data-id="${esc(e.id)}" data-v="已联系院端">已联系</button>`;
    };
    body.innerHTML = `<table class="pri-table"><thead><tr><th>时间</th><th>角色</th><th>科室</th><th>患者</th><th>命中</th><th>坚持理由</th><th>监管回执/处置</th></tr></thead><tbody>${
      pend.map(e => `<tr><td>${esc(hhmm(e.at))}</td><td>${esc(e.role || '—')}</td><td>${esc(e.dept || '—')}</td><td>${esc((e.sex || '') + (e.age != null ? e.age + '岁' : ''))} ${esc(e.diagnosis || '')}</td><td>${(e.rules || []).map(r => `<span class="risk-tag">${esc(r)}</span>`).join(' ')}</td><td class="muted">${esc(e.reason || '—')}</td><td>${dispCell(e)}</td></tr>`).join('')
    }</tbody></table>`;
    $$('.sup-btn', body).forEach(btn => btn.addEventListener('click', async () => {
      btn.disabled = true;
      await fetch('/api/precheck/supervise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: btn.dataset.id, verdict: btn.dataset.v }) });
      loadPreAlerts();
    }));
  } catch (_) {
    $('#preAlertMeta').textContent = '';
  }
}

async function runScreeningDemo() {
  $('#screeningResult').textContent = '筛查中…';
  try {
    const r = await fetch('/api/screening/run').then(x => x.json());
    if (r.error) {
      $('#screeningResult').textContent = r.error;
      return;
    }
    $('#screeningResult').textContent = `${r.elapsed_ms}ms 完成`;
    const f = r.funnel || {};
    const g = r.ground_truth_check || {};
    const fn = $('#screeningFunnel');
    fn.classList.remove('hidden');
    fn.innerHTML = `
      <div class="screening-summary">
        <span class="score-pill">${f.total_rows || 0}</span> 条明细 →
        ${riskBadge('明确违规')} <b>${f.by_nature?.['明确违规'] || 0}</b> ·
        ${riskBadge('可疑')} <b>${f.by_nature?.['可疑'] || 0}</b> ·
        ${riskBadge('干净')} <b>${f.clean_rows || 0}</b> 放行
        <span class="muted">| 命中涉及 ${fmtMoney(f.hit_amount)} · 规则分布 ${Object.entries(f.by_rule || {}).map(([k, v]) => `${k}×${v}`).join(' ')}</span>
      </div>
      <div class="muted demo-only" style="font-size:12px;margin-top:6px">真值对账：埋点 ${g.embedded || 0} 处 · 检出 ${g.detected || 0} · 漏检 ${g.missed || 0} · 误报 ${g.false_positives || 0}</div>
      <table class="pri-table" style="margin-top:8px"><thead><tr><th>行号</th><th>档位</th><th>规则</th><th>科室/医生</th><th>项目</th><th>金额</th><th>筛查理由</th></tr></thead>
      <tbody>${(r.top20 || []).slice(0, 10).map(h => `<tr><td>${esc(h.row_id)}</td><td>${riskBadge(h.nature)}</td><td>${esc(h.rule_id)}</td><td>${esc(h.dept)}·${esc(h.doctor)}</td><td>${esc(h.item_name)}</td><td class="num">¥${esc(h.amount)}</td><td class="muted">${esc(h.reason)}</td></tr>`).join('')}</tbody></table>`;
  } catch (e) {
    $('#screeningResult').textContent = '失败:' + e.message;
  }
}

function initDemoMode() {
  const demo = isDemoMode();
  $('#screeningTab')?.classList.toggle('hidden', !demo);
  document.body.classList.toggle('demo-mode', demo);
  if (demo) {
    const badge = document.createElement('span');
    badge.className = 'demo-badge';
    badge.textContent = '演示模式';
    document.querySelector('.topbar-ops')?.prepend(badge);
  }
}

document.addEventListener('click', (e) => {
  const tab = e.target.closest('.pri-tab');
  const bd = e.target.closest('.btn-bd');
  const det = e.target.closest('.btn-detail');
  const pkg = e.target.closest('.btn-pkg');
  const pkgf = e.target.closest('.btn-pkg-f');
  const moreBtn = e.target.closest('.pri-more-btn');
  const row = e.target.closest('.pri-case-row');
  const chk = e.target.closest('.row-chk');

  if (tab) setTab(tab.dataset.tab);
  if (moreBtn) {
    const box = moreBtn.closest('.pri-more');
    $$('.pri-more.open').forEach(el => { if (el !== box) el.classList.remove('open'); });
    box?.classList.toggle('open');
    e.stopPropagation();
  }
  if (bd) showBreakdown(bd.dataset.id);
  if (bd) bd.closest('.pri-more')?.classList.remove('open');
  if (det) showDetail(det.dataset.id);
  if (pkg) {
    pkg.closest('.pri-more')?.classList.remove('open');
    openEvidencePackage(pkg.dataset.id, pkg.dataset.fid);
  }
  if (pkgf) openEvidencePackage(pkgf.dataset.id, pkgf.dataset.fid);
  if (chk) {
    const id = chk.dataset.id;
    if (chk.checked) selected.add(id); else selected.delete(id);
    chk.closest('tr')?.classList.toggle('selected', chk.checked);
    updateSelHint();
    e.stopPropagation();
  } else if (row && !e.target.closest('button') && !e.target.closest('.pri-menu')) {
    showDetail(row.dataset.caseId);
  }
});

$('#chkAll')?.addEventListener('change', (e) => {
  $$('.row-chk').forEach(chk => {
    chk.checked = e.target.checked;
    const id = chk.dataset.id;
    if (e.target.checked) selected.add(id); else selected.delete(id);
    chk.closest('tr')?.classList.toggle('selected', e.target.checked);
  });
  updateSelHint();
});

$('#btnApply')?.addEventListener('click', () => loadRank());
$('#btnRefresh')?.addEventListener('click', () => { $('#btnRefresh').dataset.force = '1'; loadRank(); });
$('#priTopN')?.addEventListener('change', () => { if (lastRank) renderGuide(lastRank); });
$('#btnBatch')?.addEventListener('click', runBatch);
$('#btnBatchTopN')?.addEventListener('click', runBatchTopN);
$('#btnConfig')?.addEventListener('click', openConfig);
$('#btnConfigCancel')?.addEventListener('click', () => $('#configModal').classList.add('hidden'));
$('#btnConfigSave')?.addEventListener('click', saveConfig);
$$('.pri-preset').forEach(btn => btn.addEventListener('click', () => applyPreset(btn.dataset.preset)));
$('#btnScoreHelp')?.addEventListener('click', showScoreHelp);
$('#btnReport')?.addEventListener('click', () => { $('#reportModal').classList.remove('hidden'); previewReport(); });
$('#btnReportRefresh')?.addEventListener('click', previewReport);
$('#btnReportExport')?.addEventListener('click', () => {
  const groupBy = $('#reportGroupBy').value;
  window.open(`/api/report/violation-summary?group_by=${encodeURIComponent(groupBy)}&format=markdown${examMode ? '&mode=exam' : ''}`, '_blank');
});
$('#btnReportClose')?.addEventListener('click', () => $('#reportModal').classList.add('hidden'));
$('#btnChecklist')?.addEventListener('click', openChecklistModal);
$('#btnChecklistClose')?.addEventListener('click', () => $('#checklistModal').classList.add('hidden'));
$('#btnProfileRefresh')?.addEventListener('click', loadProfile);
$('#btnPreAlertRefresh')?.addEventListener('click', loadPreAlerts);
$('#btnScreening')?.addEventListener('click', runScreeningDemo);
$('#btnBdClose')?.addEventListener('click', () => $('#breakdownModal').classList.add('hidden'));
$('#btnPkgClose')?.addEventListener('click', () => $('#pkgModal')?.classList.add('hidden'));
$('#btnPkgPrint')?.addEventListener('click', () => { try { $('#pkgFrame')?.contentWindow?.print(); } catch { /* ignore */ } });
$('#btnCloseDetail')?.addEventListener('click', closeDrawer);
$('#detailMask')?.addEventListener('click', closeDrawer);
$('#examMode')?.addEventListener('change', (e) => {
  examMode = e.target.checked;
  if (lastRank) {
    renderQueue(lastRank);
    renderGuide(lastRank);
  }
});
$('#btnLeaderReport')?.addEventListener('click', () => {
  const ids = [...selected].join(',');
  window.open(`/api/report/leader?format=html${ids ? '&case_ids=' + encodeURIComponent(ids) : ''}${examMode ? '&mode=exam' : ''}`, '_blank');
});

initDemoMode();
loadRank().catch(err => { $('#rankMeta').textContent = '加载失败: ' + err.message; });
loadProfile().catch(() => {});
loadPreAlerts();
