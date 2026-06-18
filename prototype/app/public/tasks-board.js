'use strict';

/** 任务台账 · 打勾清单 + 可选看板（/api/tasks） */

const TASK_COLS = [
  { id: 'todo', label: '待办', icon: '📋' },
  { id: 'doing', label: '进行中', icon: '⚡' },
  { id: 'done', label: '已完成', icon: '✅' },
  { id: 'deferred', label: '搁置', icon: '⏸' },
];

let tasksFilter = { phase: 'all', priority: 'all', hideDone: false };
let tasksViewMode = 'list'; // list | kanban

function askDeferReason() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'tk-modal-overlay';
    overlay.innerHTML = `
      <div class="tk-modal" role="dialog">
        <h3 style="margin:0 0 8px;font-size:16px">⏸ 搁置理由（必填）</h3>
        <p class="muted" style="margin:0 0 10px;font-size:12px">写入任务台账，便于后续恢复时追溯。</p>
        <textarea id="tkDeferInput" rows="4" style="width:100%;padding:10px;border:1px solid var(--yy-line);border-radius:8px;font:inherit"></textarea>
        <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">
          <button type="button" class="action-btn secondary" id="tkDeferCancel">取消</button>
          <button type="button" class="action-btn" id="tkDeferOk">确认搁置</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const ta = overlay.querySelector('#tkDeferInput');
    ta?.focus();
    const close = (val) => { overlay.remove(); resolve(val); };
    overlay.querySelector('#tkDeferCancel').onclick = () => close(null);
    overlay.querySelector('#tkDeferOk').onclick = () => {
      const r = (ta?.value || '').trim();
      if (!r) { ta.style.borderColor = '#DC4A3D'; ta.focus(); return; }
      close(r);
    };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
  });
}

async function apiTasks(method = 'GET', path = '', body) {
  const r = await fetch('/api/tasks' + (path || ''), {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

function filteredTasks(tasks) {
  return tasks.filter(t => {
    if (tasksFilter.hideDone && t.status === 'done') return false;
    if (tasksFilter.phase !== 'all' && t.phase !== tasksFilter.phase) return false;
    if (tasksFilter.priority !== 'all' && t.priority !== tasksFilter.priority) return false;
    return true;
  });
}

function statusIcon(t) {
  if (t.status === 'done') return '✓';
  if (t.status === 'doing') return '◐';
  if (t.status === 'deferred') return '⏸';
  return '';
}

function taskRowHTML(t) {
  const pri = (t.priority || 'P2').toLowerCase();
  const done = t.status === 'done';
  const cls = ['tk-row', pri, t.status].join(' ');
  return `<div class="${cls}" data-id="${esc(t.id)}">
    <label class="tk-check-wrap" title="打勾 = 完成">
      <input type="checkbox" class="tk-check" data-id="${esc(t.id)}" ${done ? 'checked' : ''} aria-label="完成 ${esc(t.id)}">
      <span class="tk-check-ui">${statusIcon(t)}</span>
    </label>
    <div class="tk-body">
      <span class="tk-id">${esc(t.id)}</span>
      <span class="tk-title" contenteditable="true" spellcheck="false">${esc(t.title)}</span>
      <span class="tk-pri">${esc(t.priority || 'P2')}</span>
      ${t.acceptance ? `<span class="tk-acc-hint" title="${esc(t.acceptance)}">验收</span>` : ''}
    </div>
    <div class="tk-flags">
      <button type="button" class="tk-flag ${t.status === 'doing' ? 'on' : ''}" data-id="${esc(t.id)}" data-flag="doing" title="标记进行中">进行中</button>
      <button type="button" class="tk-flag ${t.status === 'deferred' ? 'on' : ''}" data-id="${esc(t.id)}" data-flag="deferred" title="搁置">搁置</button>
      <button type="button" class="tk-del" data-id="${esc(t.id)}" title="删除">×</button>
    </div>
  </div>`;
}

function taskCardHTML(t) {
  const pri = (t.priority || 'P2').toLowerCase();
  const done = t.status === 'done';
  return `<article class="tk-card ${pri} ${t.status}" data-id="${esc(t.id)}">
    <label class="tk-check-wrap sm">
      <input type="checkbox" class="tk-check" data-id="${esc(t.id)}" ${done ? 'checked' : ''}>
      <span class="tk-check-ui">${statusIcon(t)}</span>
    </label>
    <div class="tk-card-main">
      <div class="tk-top"><span class="tk-id">${esc(t.id)}</span><span class="tk-pri">${esc(t.priority || 'P2')}</span></div>
      <div class="tk-title" contenteditable="true" spellcheck="false">${esc(t.title)}</div>
      ${t.deferred_reason && t.status === 'deferred' ? `<div class="tk-def">${esc(t.deferred_reason)}</div>` : ''}
      <div class="tk-flags compact">
        <button type="button" class="tk-flag ${t.status === 'doing' ? 'on' : ''}" data-id="${esc(t.id)}" data-flag="doing">进行中</button>
        <button type="button" class="tk-flag ${t.status === 'deferred' ? 'on' : ''}" data-id="${esc(t.id)}" data-flag="deferred">搁置</button>
        <button type="button" class="tk-del" data-id="${esc(t.id)}">×</button>
      </div>
    </div>
  </article>`;
}

function listViewHTML(tasks) {
  const groups = {};
  for (const t of tasks) {
    const ph = t.phase || '未分组';
    (groups[ph] ||= []).push(t);
  }
  const order = Object.keys(groups).sort((a, b) => {
    if (a.startsWith('Phase 4')) return -1;
    if (b.startsWith('Phase 4')) return 1;
    return a.localeCompare(b);
  });
  if (!order.length) return '<p class="tk-empty">无任务 — 打勾管理或从路线图同步</p>';
  return order.map((ph, i) => {
    const items = groups[ph];
    const doneN = items.filter(t => t.status === 'done').length;
    return `<section class="tk-phase-group">
      <h3 class="tk-phase-head">${esc(ph)} ${i === 0 && ph.includes('iter-21') ? '<span class="tag next">NEXT</span>' : ''}
        <span class="tk-phase-prog">${doneN}/${items.length}</span></h3>
      <div class="tk-list">${items.map(taskRowHTML).join('')}</div>
    </section>`;
  }).join('');
}

function kanbanViewHTML(tasks) {
  return TASK_COLS.map(col => {
    const items = tasks.filter(t => t.status === col.id);
    return `<div class="tk-col" data-status="${col.id}">
      <div class="tk-col-head"><span>${col.icon} ${col.label}</span><span class="tk-count">${items.length}</span></div>
      <div class="tk-col-body">${items.map(taskCardHTML).join('') || '<p class="tk-empty">无</p>'}</div>
    </div>`;
  }).join('');
}

async function tasksBoardHTML() {
  const data = await apiTasks('GET');
  const allTasks = data.tasks || [];
  const tasks = filteredTasks(allTasks);
  const phases = [...new Set(allTasks.map(t => t.phase).filter(Boolean))];
  const summary = data.summary || {};
  const syncHint = data.meta?.last_roadmap_sync
    ? `上次同步 ${new Date(data.meta.last_roadmap_sync).toLocaleString('zh-CN')}`
    : '路线图任务可一键补全，不覆盖你的打勾';

  const body = tasksViewMode === 'kanban'
    ? `<div class="tk-kanban">${kanbanViewHTML(tasks)}</div>`
    : `<div class="tk-list-wrap">${listViewHTML(tasks)}</div>`;

  return `
    <div class="doc-toolbar">
      <h2 style="margin:0">任务台账</h2>
      <span class="badge-live">手动打勾 · 落盘 tasks_board.json</span>
    </div>
    <p class="tk-hint">你在本页<strong>打勾 / 取消打勾</strong>即改状态并保存。迭代路线图是规划参考；点「同步路线图」只<strong>补全新任务</strong>，不会改掉你已打勾的进度。</p>
    <div class="tk-smart">
      <label>本期 SMART 目标</label>
      <textarea id="tkSmartGoal" rows="2">${esc(data.meta?.smart_goal || '')}</textarea>
      <button type="button" class="action-btn secondary" id="tkSaveGoal">保存目标</button>
    </div>
    <div class="kpi-grid tk-stats">
      ${kpiCard('待办', summary.todo ?? 0, 'warn', '')}
      ${kpiCard('进行中', summary.doing ?? 0, 'accent', '')}
      ${kpiCard('已完成', summary.done ?? 0, 'pass', '')}
      ${kpiCard('搁置', summary.deferred ?? 0, '', '')}
    </div>
    <div class="tk-toolbar">
      <div class="tk-view-toggle">
        <button type="button" class="tk-view-btn ${tasksViewMode === 'list' ? 'on' : ''}" data-view="list">☑ 清单</button>
        <button type="button" class="tk-view-btn ${tasksViewMode === 'kanban' ? 'on' : ''}" data-view="kanban">▦ 看板</button>
      </div>
      <select id="tkFilterPhase"><option value="all">全部 Phase</option>${phases.map(p => `<option value="${esc(p)}" ${tasksFilter.phase === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
      <select id="tkFilterPri"><option value="all">全部优先级</option>${['P0','P1','P2','P3'].map(p => `<option value="${p}" ${tasksFilter.priority === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
      <label class="tk-hide-done"><input type="checkbox" id="tkHideDone" ${tasksFilter.hideDone ? 'checked' : ''}> 隐藏已完成</label>
      <button type="button" class="action-btn" id="tkAddBtn">＋ 新建</button>
      <button type="button" class="action-btn secondary" id="tkSyncRoadmap" title="${esc(syncHint)}">↻ 同步路线图</button>
      <button type="button" class="action-btn secondary" data-goto="roadmap">🗺 迭代路线</button>
    </div>
    ${body}
    <details class="tk-form-wrap" id="tkFormWrap">
      <summary>新建任务</summary>
      <form id="tkForm" class="tk-form">
        <input name="id" placeholder="ID（可空）">
        <input name="title" placeholder="任务标题 *" required>
        <select name="priority"><option>P0</option><option>P1</option><option selected>P2</option><option>P3</option></select>
        <input name="phase" placeholder="Phase" value="Phase 4 · iter-21">
        <input name="source" placeholder="U/S/R" value="U">
        <input name="acceptance" placeholder="验收标准">
        <button type="submit" class="action-btn">创建</button>
      </form>
    </details>
    <div class="action-row">
      <button type="button" class="action-btn secondary" id="tkArchiveBtn">📜 历史归档 TASKS.md</button>
      <a class="action-btn" href="/">🛡 稽核工作台</a>
    </div>
    <div id="tkArchive" class="hidden"></div>`;
}

/** 迭代路线页底部：只读打勾预览（与台账同源） */
async function roadmapTasksPreviewHTML() {
  const data = await apiTasks('GET');
  const byPhase = {};
  for (const t of data.tasks) {
    if (!t.phase || t.phase === 'BACKLOG') continue;
    (byPhase[t.phase] ||= []).push(t);
  }
  const phases = Object.keys(byPhase).sort();
  if (!phases.length) return '<p class="muted">暂无台账任务 — 去任务台账同步或新建</p>';
  return `<div class="tk-preview-head"><h3 style="margin:0">台账进度（与打勾同步）</h3>
    <button type="button" class="link-sm link-btn" data-goto="tasks">去管理 →</button></div>` +
    phases.map((ph, i) => {
      const items = byPhase[ph];
      const doneN = items.filter(t => t.status === 'done').length;
      return `<div class="tk-phase-group compact"><h4>${esc(ph)} ${i === 0 ? '<span class="tag next">NEXT</span>' : ''} <span class="tk-phase-prog">${doneN}/${items.length}</span></h4>
        <div class="tk-list preview">${items.map(t => {
          const mark = t.status === 'done' ? '✓' : t.status === 'doing' ? '◐' : t.status === 'deferred' ? '⏸' : '○';
          return `<div class="tk-row preview ${t.status}"><span class="tk-mark">${mark}</span><span class="tk-id">${esc(t.id)}</span><span class="tk-title-preview ${t.status === 'done' ? 'done' : ''}">${esc(t.title)}</span></div>`;
        }).join('')}</div></div>`;
    }).join('');
}

async function patchTaskStatus(id, status, extra) {
  await apiTasks('PATCH', '/' + encodeURIComponent(id), { status, ...extra });
}

function bindTasksBoard(root) {
  bindDocCards(root);

  root.querySelector('#tkSaveGoal')?.addEventListener('click', async () => {
    const smart_goal = root.querySelector('#tkSmartGoal')?.value || '';
    await fetch('/api/tasks/meta', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ smart_goal }) });
    toast(root, '已保存');
  });

  root.querySelectorAll('.tk-view-btn').forEach(btn => {
    btn.addEventListener('click', () => { tasksViewMode = btn.dataset.view; navigate('tasks'); });
  });

  root.querySelector('#tkFilterPhase')?.addEventListener('change', e => { tasksFilter.phase = e.target.value; navigate('tasks'); });
  root.querySelector('#tkFilterPri')?.addEventListener('change', e => { tasksFilter.priority = e.target.value; navigate('tasks'); });
  root.querySelector('#tkHideDone')?.addEventListener('change', e => { tasksFilter.hideDone = e.target.checked; navigate('tasks'); });

  root.querySelector('#tkSyncRoadmap')?.addEventListener('click', async () => {
    const r = await fetch('/api/tasks/sync-roadmap', { method: 'POST' });
    const d = await r.json();
    if (!r.ok) { toast(root, d.error || '同步失败'); return; }
    toast(root, d.added.length ? `已补全 ${d.added.length} 项` : '无新任务需同步');
    navigate('tasks');
  });

  root.querySelector('#tkAddBtn')?.addEventListener('click', () => {
    const wrap = root.querySelector('#tkFormWrap');
    if (wrap) { wrap.open = true; wrap.querySelector('[name=title]')?.focus(); }
  });

  root.querySelector('#tkForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    if (body.id === '') delete body.id;
    await apiTasks('POST', '', body);
    navigate('tasks');
  });

  root.querySelectorAll('.tk-check').forEach(cb => {
    cb.addEventListener('change', async () => {
      const id = cb.dataset.id;
      const status = cb.checked ? 'done' : 'todo';
      try {
        await patchTaskStatus(id, status);
        navigate('tasks');
      } catch (err) {
        toast(root, '保存失败：' + err.message);
        navigate('tasks');
      }
    });
  });

  root.querySelectorAll('.tk-flag').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const flag = btn.dataset.flag;
      if (flag === 'doing') {
        const row = btn.closest('.tk-row, .tk-card');
        const cur = row?.classList.contains('doing');
        await patchTaskStatus(id, cur ? 'todo' : 'doing');
      } else if (flag === 'deferred') {
        const row = btn.closest('.tk-row, .tk-card');
        const cur = row?.classList.contains('deferred');
        if (cur) {
          await patchTaskStatus(id, 'todo');
        } else {
          const reason = await askDeferReason();
          if (!reason) return;
          await patchTaskStatus(id, 'deferred', { deferred_reason: reason });
        }
      }
      navigate('tasks');
    });
  });

  root.querySelectorAll('.tk-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('删除 ' + btn.dataset.id + '？')) return;
      await apiTasks('DELETE', '/' + encodeURIComponent(btn.dataset.id));
      navigate('tasks');
    });
  });

  root.querySelectorAll('.tk-title[contenteditable]').forEach(el => {
    el.addEventListener('blur', async () => {
      const row = el.closest('[data-id]');
      const id = row?.dataset.id;
      const title = el.textContent.trim();
      if (!id || !title) return;
      await apiTasks('PATCH', '/' + encodeURIComponent(id), { title });
    });
  });

  root.querySelector('#tkArchiveBtn')?.addEventListener('click', async () => {
    const box = root.querySelector('#tkArchive');
    if (!box) return;
    if (!box.classList.contains('hidden')) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    const doc = await loadDoc('tasks', true);
    box.innerHTML = `<article class="card md-body">${mdToHtml(doc.content)}</article>`;
    bindDocCards(box);
  });
}

function toast(root, msg) {
  let t = root.querySelector('.tk-toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'tk-toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

window.DashTasks = {
  roadmapTasksPreviewHTML,
  tasksBoardHTML,
  bindTasksBoard,
};
