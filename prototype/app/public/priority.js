'use strict';

const $ = (s, r = document) => r.querySelector(s);
const selected = new Set();
let lastRank = null;
let examMode = false;

function fmtMoney(n) {
  return '¥' + Number(n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function queryParams() {
  const p = new URLSearchParams();
  const dept = $('#fDept').value.trim();
  const doctor = $('#fDoctor').value.trim();
  const status = $('#fStatus').value;
  const q = $('#fQ').value.trim();
  const amtMin = $('#fAmtMin').value;
  if (dept) p.set('dept', dept);
  if (doctor) p.set('doctor', doctor);
  if (status) p.set('status', status);
  if (q) p.set('q', q);
  if (amtMin) p.set('amount_min', amtMin);
  if ($('#btnRefresh').dataset.force) p.set('refresh', '1');
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

async function loadRank() {
  $('#rankMeta').textContent = '计算中…';
  try {
    const qs = queryParams();
    const r = await fetch('/api/priority/rank' + (qs ? '?' + qs : ''));
    const data = await parseJsonResponse(r, '队列加载');
    lastRank = data;
    renderQueue(data);
    const nc = {};
    for (const r of data.queue || []) nc[r.nature || '可疑'] = (nc[r.nature || '可疑'] || 0) + 1;
    const natureStat = ['明确违规', '可疑', '干净'].filter(n => nc[n]).map(n => `${n} ${nc[n]}`).join(' / ');
    $('#rankMeta').textContent = `更新于 ${new Date(data.computed_at).toLocaleTimeString()} · 队列 ${data.total} 案${natureStat ? ` · ${natureStat}` : ''}${data.boundary_count ? ` · 边界 ${data.boundary_count}` : ''}`;
  } catch (e) {
    $('#rankMeta').textContent = '加载失败';
    toast(e.message, true);
  } finally {
    delete $('#btnRefresh').dataset.force;
  }
}

function amountLabel(row) {
  if (examMode) return `<span class="exam-label">${fmtMoney(row.suspected_amount)}</span>`;
  return fmtMoney(row.suspected_amount);
}

function natureBadge(n) {
  if (!n) return '';
  const cls = n === '主观嫌疑' ? 'tier-1' : n === '非主观差错' ? 'tier-2' : 'tier-3';
  return `<span class="tier-badge ${cls}">${esc(n)}</span>`;
}

// 三档(第一层级):明确违规=政策限定类可拦截 / 可疑=合理使用类需合议 / 干净
const NATURE_CLS = { 明确违规: 'tri-hard', 可疑: 'tri-suspect', 干净: 'tri-clean' };
const NATURE_ORDER = ['明确违规', '可疑', '干净'];
const NATURE_HINT = {
  明确违规: '政策限定类 · 硬性字段交叉核验，可直接拦截',
  可疑: '合理使用类 · 需临床合理性合议，应听申诉',
  干净: '本次核验各维度未见异常',
};
function caseNatureBadge(n) {
  if (!n) return '';
  return `<span class="tri-badge ${NATURE_CLS[n] || 'tri-suspect'}" title="${esc(NATURE_HINT[n] || '')}">${esc(n)}</span>`;
}

function tierBadge(tier, label) {
  const cls = `tier-badge tier-${tier}`;
  const text = examMode && tier === 1 ? '风险点' : (label || (tier === 1 ? '疑点' : tier === 2 ? '线索' : '—'));
  return `<span class="${cls}">${text}</span>`;
}

function renderQueue(data) {
  const tbody = $('#queueBody');
  tbody.innerHTML = '';
  selected.clear();
  updateSelHint();

  // 三档=第一层级:按 nature 分节渲染(队列已由后端按 明确违规>可疑>干净 排序)
  let lastNature = null;
  const natureTotals = {};
  for (const r of data.queue || []) natureTotals[r.nature || '可疑'] = (natureTotals[r.nature || '可疑'] || 0) + 1;

  for (const row of data.queue || []) {
    const nat = row.nature || '可疑';
    if (nat !== lastNature) {
      lastNature = nat;
      const sec = document.createElement('tr');
      sec.className = 'nature-section';
      sec.innerHTML = `<td colspan="11">${caseNatureBadge(nat)} <span class="nature-section-hint">${esc(NATURE_HINT[nat] || '')}</span> <span class="muted">${natureTotals[nat]} 案</span></td>`;
      tbody.appendChild(sec);
    }
    const tr = document.createElement('tr');
    tr.dataset.caseId = row.case_id;
    tr.innerHTML = `
      <td><input type="checkbox" class="row-chk" data-id="${row.case_id}"></td>
      <td>${caseNatureBadge(nat)}<br>${tierBadge(row.tier, row.tier_label)}</td>
      <td class="num"><span class="score-pill">${row.api_score}</span></td>
      <td><strong>${esc(row.case_title || row.case_id)}</strong><br><span class="muted">${esc(row.case_id)}</span></td>
      <td>${esc(row.dept || '—')}${(row.risk_tags || []).length ? `<br><span class="muted">${row.risk_tags.slice(0,2).join('·')}</span>` : ''}</td>
      <td class="num">${row.suspected_count} / ${row.clue_count}</td>
      <td class="num">${amountLabel(row)}</td>
      <td>${natureBadge(row.violation_nature)} ${esc(row.top_violation?.violation_type?.slice(0, 20) || '—')}${(row.top_violation?.violation_type?.length || 0) > 20 ? '…' : ''}<br>${(row.risk_tags || []).map(t => `<span class="risk-tag">${esc(t)}</span>`).join('')}<span class="muted">${row.special_case_review !== '无' ? '特例:' + row.special_case_review : ''}</span></td>
      <td class="disposition">${esc(examMode && row.disposition ? row.disposition.replace(/处置建议·/g, '自查·') : (row.disposition || '—'))}</td>
      <td class="num muted">${row.history_hint?.patient ?? 0}% / ${row.history_hint?.dept ?? 0}%</td>
      <td class="pri-row-actions">
        <button type="button" class="btn sm secondary btn-bd" data-id="${row.case_id}">归因</button>
        <button type="button" class="btn sm primary btn-detail" data-id="${row.case_id}">详情</button>
        <button type="button" class="btn sm secondary btn-pkg" data-id="${row.case_id}" data-fid="${esc(row.top_violation?.rule_id || '')}">举证包</button>
      </td>`;
    tbody.appendChild(tr);
  }

  $('#queueCount').textContent = `(${data.queue?.length || 0})`;
  const legendEl = $('#queueLegend');
  if (legendEl && window.PriorityUX) legendEl.textContent = PriorityUX.scoreLegend;

  const shadowBody = $('#shadowBody');
  shadowBody.innerHTML = '';
  if (!(data.shadow_bucket || []).length) {
    shadowBody.innerHTML = '<p class="muted">当前无「仅观察期」案卷 — shadow 命中会展示证据，但不计入 api_score</p>';
  } else {
    for (const row of data.shadow_bucket) {
      const div = document.createElement('div');
      div.className = 'pri-shadow-item';
      div.innerHTML = `${esc(row.case_title || row.case_id)} · 观察期 ${row.shadow_count} 条 · <span class="amt">${fmtMoney(row.shadow_amount)}</span> <span class="muted">（展示用，不计入优先指数）</span>`;
      shadowBody.appendChild(div);
    }
  }

  const boundaryBody = $('#boundaryBody');
  if (boundaryBody) {
    boundaryBody.innerHTML = '';
    if (!(data.boundary_bucket || []).length) {
      boundaryBody.innerHTML = '<p class="muted">当前无边界基准案卷落入观测桶（tier≥3 且无 active 命中）</p>';
    } else {
      for (const row of data.boundary_bucket) {
        const div = document.createElement('div');
        div.className = 'pri-boundary-item';
        div.innerHTML = `${esc(row.case_title || row.case_id)} · <span class="muted">${esc(row.case_id)}</span> · 完整度 ${Math.round((row.completeness || 0) * 100)}% <span class="muted">（G0 观测，不参与批量优先入队）</span>`;
        boundaryBody.appendChild(div);
      }
    }
  }
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function updateSelHint() {
  $('#selHint').textContent = selected.size ? `已选 ${selected.size} 个案卷` : '未选择案卷';
  $('#btnBatch').disabled = selected.size === 0;
}

async function runBatch() {
  if (!selected.size) return;
  $('#btnBatch').disabled = true;
  $('#btnBatch').textContent = '入队中…';
  const r = await fetch('/api/audit/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caseIds: [...selected], mode: 'live', priority: true, concurrency: 3 }),
  });
  let data;
  try {
    data = await parseJsonResponse(r, '批量入队');
  } catch (e) {
    alert(e.message);
    $('#btnBatch').textContent = '加入批量稽核';
    $('#btnBatch').disabled = false;
    return;
  }
  $('#btnBatch').textContent = '加入批量稽核';
  if (data.ok) {
    alert(`已入队 ${data.job?.id}\n进度可在看板「批量初筛」或 GET /api/audit/batch/${data.job?.id} 查看`);
    selected.clear();
    updateSelHint();
    await loadRank();
  } else {
    alert(data.error || '入队失败');
    $('#btnBatch').disabled = false;
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
  btn.textContent = '入队中…';
  const r = await fetch('/api/audit/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ priority: true, top_n, mode: 'live', skip: ['uploaded'], concurrency: 3 }),
  });
  let data;
  try {
    data = await parseJsonResponse(r, '队首入队');
  } catch (e) {
    alert(e.message);
    btn.textContent = '🎯 队首 N 入队';
    btn.disabled = false;
    return;
  }
  btn.textContent = '🎯 队首 N 入队';
  btn.disabled = false;
  if (data.ok) {
    alert(`已入队队首 ${top_n} 案 · ${data.job?.id}\n首案: ${data.job?.case_ids?.[0] || '—'}`);
    await loadRank();
  } else {
    alert(data.error || '入队失败');
  }
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

async function fetchCaseDetail(caseId, { refresh = false } = {}) {
  const qs = refresh ? '?refresh=1' : '';
  const r = await fetch(`/api/cases/${encodeURIComponent(caseId)}${qs}`);
  return parseJsonResponse(r, '案卷详情加载');
}

async function showDetail(caseId) {
  const panel = $('#detailPanel');
  $('#detailTitle').textContent = '加载中…';
  $('#detailContent').innerHTML = '<p class="muted">正在拉取 Findings 与 enrich 管道…</p>';
  const wb = $('#btnOpenWorkbench');
  if (wb) wb.href = '/?case=' + encodeURIComponent(caseId);
  panel.classList.remove('hidden');
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    const data = await fetchCaseDetail(caseId);
    $('#detailTitle').textContent = data.case?.case_title || caseId;
    const findings = data.findings || [];
  const suspected = findings.filter(f => f.status === '疑点' && !f.shadow);
  const clues = findings.filter(f => f.status === '线索' && !f.shadow);
  const shadowed = findings.filter(f => f.shadow);
  const c = data.case || {};
  const meta = data.record_meta?.case_meta || {};

  let html = `<p class="muted">状态 ${c.status} · 完整度 ${c.completeness ?? '—'}% · anchor ${c.anchor_coverage ?? '—'}% · DRG ${esc(c.drg_group || meta.drg_group || '—')} · 特例单议 ${esc(c.special_case_review || meta.special_case_review || '无')}</p>`;
  if ((c.risk_tags || []).length) {
    html += `<p>${c.risk_tags.map(t => `<span class="risk-tag">${esc(t)}</span>`).join('')}</p>`;
  }
  const dip = c.inpatient_metrics || meta.inpatient_metrics;
  if (dip) {
    html += `<p class="muted">DIP 辅助：${Object.entries(dip).map(([k, v]) => `${k}=${v}`).join(' · ')}</p>`;
  }
  html += `<h3>疑点 (${suspected.length})</h3>`;
  html += renderFindings(suspected, false, caseId);
  html += `<h3>线索 (${clues.length})</h3>`;
  html += renderFindings(clues, false, caseId);
  if (shadowed.length) {
    html += `<h3>🌓 shadow (${shadowed.length})</h3>`;
    html += renderFindings(shadowed, true, caseId);
  }
  const audits = data.audit_records || [];
  if (audits.length) {
    html += `<h3>法定留痕</h3>`;
    for (const ar of audits.slice(0, 3)) {
      html += `<div class="pri-finding muted"><h4>${esc(ar.audit_id)} · ${esc(ar.finished_at)}</h4>`;
      if (ar.collective_decision) html += `<div class="pri-evidence"><strong>集体决策</strong>\n${esc(JSON.stringify(ar.collective_decision, null, 2))}</div>`;
      if (ar.defense) html += `<div class="pri-evidence"><strong>申辩</strong>\n${esc(JSON.stringify(ar.defense, null, 2))}</div>`;
      if (ar.timeline?.length) html += `<div class="pri-evidence"><strong>时间线</strong>\n${ar.timeline.map(t => `${t.at} · ${t.event}`).join('\n')}</div>`;
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

function renderFindings(list, shadow, caseId) {
  if (!list.length) return '<p class="muted">无</p>';
  return list.map(f => `
    <div class="pri-finding ${f.status === '疑点' ? 'suspected' : 'clue'}${shadow ? ' muted' : ''}">
      <h4>${caseNatureBadge(f.nature)} ${esc(f.rule_id)} · ${esc(f.status)} · ${fmtMoney(f.amount_involved)} ${shadow ? '(shadow 不计分)' : ''}${f.violation_nature ? ' · ' + esc(f.violation_nature) : ''}</h4>
      <div class="muted">${esc(f.violation_type)}${f.disposition_suggestion ? ' · ' + esc(f.disposition_suggestion) : ''}</div>
      <div class="pri-evidence"><strong>证据</strong>\n${(f.evidence || []).map(e => `[${e.type}] ${e.loc}: ${e.text}`).join('\n')}</div>
      <div class="pri-evidence"><strong>条款</strong>\n${(f.policy || []).map(p => `${p.ref}: ${p.text}`).join('\n')}${examMode && (f.policy || []).length ? '\n\n【体检教育说明】以上条款原文供院端自查对照，分数/三态不因展示口径改变。' : ''}</div>
      <div class="pri-evidence"><strong>推理</strong>\n${esc(f.reasoning)}</div>
      ${(f.needs_more || []).length ? `<div class="pri-evidence"><strong>需调阅</strong>\n${f.needs_more.join('\n')}</div>` : ''}
      ${caseId && !shadow ? `<button type="button" class="btn sm ghost btn-pkg-f" data-id="${caseId}" data-fid="${f.finding_id || f.rule_id || ''}">导出举证包</button>` : ''}
    </div>`).join('');
}

function formatBreakdownText(row) {
  return (window.PriorityUX?.formatBreakdownText || ((r) => JSON.stringify(r.breakdown, null, 2)))(row);
}

async function showBreakdown(caseId) {
  let row = (lastRank?.queue || []).concat(lastRank?.shadow_bucket || []).concat(lastRank?.boundary_bucket || []).find(r => r.case_id === caseId);
  $('#bdTitle').textContent = `${caseId} · 分数归因`;
  $('#bdBody').textContent = '计算中…';
  $('#breakdownModal').classList.remove('hidden');
  if (!row?.breakdown) {
    try {
      const data = await fetchCaseDetail(caseId);
      row = data.score || row;
    } catch (e) {
      $('#bdBody').textContent = `归因加载失败：${e.message}`;
      toast(e.message, true);
      return;
    }
  }
  if (!row) {
    $('#bdBody').textContent = '未找到该案卷的排序数据';
    return;
  }
  $('#bdTitle').textContent = `${caseId} · api_score ${row.api_score ?? '—'}`;
  $('#bdBody').textContent = formatBreakdownText(row);
}

const CONFIG_FIELDS = [
  ['W_CLUE', '线索权重', 'W_CLUE'],
  ['AMT_CAP', '金额归一化上限（元）', 'AMT_CAP'],
  ['beta', '历史命中 β', 'HistoryPrior'],
  ['gamma', '规则广度 γ', 'Breadth'],
  ['delta', '金额离群 δ', 'Outlier'],
  ['R_REF', '广度参考规则数', 'R_REF'],
  ['specialty_weight', '9大领域加权', 'specialty_weight'],
  ['repeat_upgrade_threshold', '反复升级阈值（次）', 'repeat_upgrade'],
];

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
    }).join('') + `<div class="pri-profile-col"><h4>9大重点领域</h4><ul><li>肿瘤 · 麻醉 · 重症 · 心血管 · 骨科 · 血透 · 康复 · 影像 · 检验</li><li class="muted">命中 tag 的案件 specialty 加权生效</li></ul></div>`;
    el.classList.remove('muted');
  } catch (e) {
    el.textContent = '画像加载失败: ' + e.message;
  }
}

async function previewReport() {
  const groupBy = $('#reportGroupBy').value;
  const groupLabel = { violation_type: '违规类型', nature: '违规性质', dept: '科室' }[groupBy] || groupBy;
  const mode = examMode ? '&mode=exam' : '';
  try {
    const r = await fetch(`/api/report/violation-summary?group_by=${groupBy}${mode}`);
    const d = await parseJsonResponse(r, '违规统计预览');
    $('#reportBody').textContent = [
      `# 违规统计 · 按${groupLabel}分组（${groupBy}）`,
      `生成于 ${d.exported_at || new Date().toISOString()}`,
      '',
      ...(d.tables?.recognition || []).map(t => JSON.stringify(t, null, 2)),
      '',
      ...(d.tables?.amount || []).map(t => JSON.stringify(t, null, 2)),
    ].join('\n');
  } catch (e) {
    $('#reportBody').textContent = '预览失败: ' + e.message;
    toast(e.message, true);
  }
}

// 全量自查清单工作台：官方问题清单(12领域236条)逐条勾选 + 领域完成率 + 引擎命中对照
const CHECKLIST_STATUSES = ['未查', '已查无问题', '发现问题', '已整改'];
async function openChecklistModal() {
  const caseId = selected.size ? [...selected][0] : 'main';
  const r = await fetch(`/api/checklist/full?case_id=${caseId}`);
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
          ${row.engine_hit ? `⚡ 引擎命中: ${row.engine_findings.map(f => `${esc(f.rule_id)}(${esc(f.status)})`).join(' ')}` : (row.rule_profile || []).length ? `可对照规则: ${row.rule_profile.join(' ')}` : '暂无对应引擎规则（人工自查项）'}
          ${row.dept ? ` · 科室:${esc(row.dept)}` : ''}${row.note ? ` · ${esc(row.note)}` : ''}
        </div>
      </div>`).join('');
    return `
      <details class="pri-check-domain" ${st.found || st.engine_hits ? 'open' : ''}>
        <summary><b>${esc(domain)}</b> <span class="muted">${st.checked || 0}/${st.total || rows.length} 已查${st.found ? ` · 发现${st.found}` : ''}${st.engine_hits ? ` · ⚡引擎命中${st.engine_hits}` : ''}</span></summary>
        ${items}
      </details>`;
  }).join('') || '<p class="muted">清单为空</p>';
  $('#checklistBody').querySelectorAll('.pri-check-status').forEach(sel => {
    sel.addEventListener('change', async (e) => {
      const itemId = e.target.dataset.item;
      try {
        await fetch('/api/checklist/progress', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checklist_id: 'national-full-self', item_id: itemId, status: e.target.value }),
        });
        toast(`已登记：${e.target.value}`);
      } catch (err) { toast('登记失败: ' + err.message, true); }
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
      body: JSON.stringify({
        case_id: caseId,
        finding_id: findingId || undefined,
        format: 'html',
      }),
    });
    const ct = r.headers.get('content-type') || '';
    if (!r.ok) {
      const err = ct.includes('json') ? (await r.json()).error : await r.text();
      throw new Error(err || `HTTP ${r.status}`);
    }
    const html = await r.text();
    if (frame) {
      frame.srcdoc = html;
    } else {
      const w = window.open('', '_blank');
      if (!w) throw new Error('弹窗被拦截，请允许本站弹窗');
      w.document.write(html);
      w.document.close();
    }
  } catch (e) {
    if (frame) frame.srcdoc = `<p style="padding:24px;color:#b91c1c">${esc(e.message)}</p>`;
    toast('举证包：' + e.message, true);
  }
}

async function openConfig() {
  const r = await fetch('/api/priority/config');
  const { config } = await r.json();
  const form = $('#configForm');
  const hints = window.PriorityUX?.CONFIG_HINTS || {};
  form.innerHTML = CONFIG_FIELDS.map(([k, label, code]) => {
    const tip = hints[k] ? `${hints[k]}（字段名 ${code}）` : code;
    return `<label title="${esc(tip)}">${label}<span class="cfg-code">${code}</span><input name="${k}" type="number" step="any" value="${config[k] ?? ''}"></label>`;
  }).join('')
    + `<label title="EC/AMT/SEV 合成方式">core 合成<select name="core_mode"><option value="geometric" ${config.core_mode === 'geometric' ? 'selected' : ''}>几何均值（默认）</option><option value="weighted" ${config.core_mode === 'weighted' ? 'selected' : ''}>加权和</option></select></label>`
    + `<label title="PII=个人隐私；开启后列表脱敏">列表脱敏 mask_pii<select name="mask_pii"><option value="true" ${config.mask_pii !== false ? 'selected' : ''}>开启</option><option value="false" ${config.mask_pii === false ? 'selected' : ''}>关闭</option></select></label>`;
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
  await fetch('/api/priority/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config, actor: 'priority-ui' }),
  });
  $('#configModal').classList.add('hidden');
  $('#btnRefresh').dataset.force = '1';
  await loadRank();
}

document.addEventListener('click', (e) => {
  const bd = e.target.closest('.btn-bd');
  const det = e.target.closest('.btn-detail');
  const pkg = e.target.closest('.btn-pkg');
  const pkgf = e.target.closest('.btn-pkg-f');
  if (bd) showBreakdown(bd.dataset.id);
  if (det) showDetail(det.dataset.id);
  if (pkg) openEvidencePackage(pkg.dataset.id, pkg.dataset.fid);
  if (pkgf) openEvidencePackage(pkgf.dataset.id, pkgf.dataset.fid);
  if (e.target.classList.contains('row-chk')) {
    const id = e.target.dataset.id;
    if (e.target.checked) selected.add(id); else selected.delete(id);
    e.target.closest('tr')?.classList.toggle('selected', e.target.checked);
    updateSelHint();
  }
});

$('#chkAll')?.addEventListener('change', (e) => {
  document.querySelectorAll('.row-chk').forEach(chk => {
    chk.checked = e.target.checked;
    const id = chk.dataset.id;
    if (e.target.checked) selected.add(id); else selected.delete(id);
    chk.closest('tr')?.classList.toggle('selected', e.target.checked);
  });
  updateSelHint();
});

$('#btnApply').addEventListener('click', () => loadRank());
$('#btnRefresh').addEventListener('click', () => { $('#btnRefresh').dataset.force = '1'; loadRank(); });
$('#btnBatch').addEventListener('click', runBatch);
$('#btnBatchTopN').addEventListener('click', runBatchTopN);
$('#btnConfig').addEventListener('click', openConfig);
$('#btnConfigCancel').addEventListener('click', () => $('#configModal').classList.add('hidden'));
$('#btnConfigSave').addEventListener('click', saveConfig);
$('#btnReport').addEventListener('click', () => { $('#reportModal').classList.remove('hidden'); previewReport(); });
// E3 领导版一键报告:勾选了案卷则只报勾选范围,否则全库;新标签打开可打印 HTML(内含浏览器打印→PDF)
$('#btnLeaderReport').addEventListener('click', () => {
  const ids = [...selected].join(',');
  window.open(`/api/report/leader?format=html${ids ? '&case_ids=' + encodeURIComponent(ids) : ''}${examMode ? '&mode=exam' : ''}`, '_blank');
});
$('#btnReportRefresh').addEventListener('click', previewReport);
$('#btnReportExport').addEventListener('click', () => {
  const groupBy = $('#reportGroupBy').value;
  window.open(`/api/report/violation-summary?group_by=${groupBy}&format=markdown${examMode ? '&mode=exam' : ''}`, '_blank');
});
$('#btnReportClose').addEventListener('click', () => $('#reportModal').classList.add('hidden'));
$('#btnChecklist').addEventListener('click', openChecklistModal);
$('#btnChecklistClose').addEventListener('click', () => $('#checklistModal').classList.add('hidden'));
$('#btnProfileRefresh').addEventListener('click', loadProfile);
$('#btnBdClose').addEventListener('click', () => $('#breakdownModal').classList.add('hidden'));
$('#btnPkgClose')?.addEventListener('click', () => $('#pkgModal')?.classList.add('hidden'));
$('#btnPkgPrint')?.addEventListener('click', () => { try { $('#pkgFrame')?.contentWindow?.print(); } catch { /* */ } });
$('#btnCloseDetail').addEventListener('click', () => $('#detailPanel').classList.add('hidden'));
$('#examMode').addEventListener('change', (e) => { examMode = e.target.checked; if (lastRank) renderQueue(lastRank); });

const glossaryMount = $('#glossaryMount');
if (glossaryMount && window.PriorityUX) glossaryMount.innerHTML = PriorityUX.glossaryPanelHtml(false);

loadRank().catch(err => { $('#rankMeta').textContent = '加载失败: ' + err.message; });
loadProfile().catch(() => {});
