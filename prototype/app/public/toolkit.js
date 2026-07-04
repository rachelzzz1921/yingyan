/* ============================================================
   鹰眼 · 插件 & 小工具箱 · 统一交互层 toolkit.js
   提供：TK.esc / TK.money / TK.tierBadge / TK.toast
        TK.modes()    —— 「直接使用 / 模拟场景」切换（?scenario=1 直达场景）
        TK.scenario() —— 模拟场景播放器（golden.html 分步演示状态机的小工具版）
   依赖：toolkit.css
   ============================================================ */
(function () {
  'use strict';

  const $ = (s, p) => (p || document).querySelector(s);

  function esc(v) {
    return String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function money(n) {
    return '¥' + Number(n || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  }

  // 三档口径全局唯一出处：改文案只改这里
  const TIERS = {
    A: { cls: 'a', label: '建议重点核查' },
    B: { cls: 'b', label: '建议补材料后核查' },
    C: { cls: 'c', label: '建议暂缓 / 观察' },
  };
  function tierBadge(code) {
    const t = TIERS[code] || TIERS.C;
    return `<span class="badge ${t.cls}">${code} · ${t.label}</span>`;
  }

  function toast(msg, isErr) {
    let el = $('#tk-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'tk-toast';
      el.className = 'tk-toast hidden';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.toggle('err', !!isErr);
    el.classList.remove('hidden');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add('hidden'), 3600);
  }

  /* 「直接使用 / 模拟场景」双模式。页面约定：
     <nav class="mode"><button data-mode="use">…</button><button data-mode="sc">…</button></nav>
     <div id="pane-use">…</div> <div id="pane-sc" class="hidden">…</div>
     URL 带 ?scenario=1 时默认进入模拟场景。 */
  function modes() {
    const nav = $('.mode');
    if (!nav) return;
    const btns = [...nav.querySelectorAll('button[data-mode]')];
    function show(mode) {
      btns.forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
      for (const m of ['use', 'sc']) {
        const pane = $('#pane-' + m);
        if (pane) pane.classList.toggle('hidden', m !== mode);
      }
    }
    btns.forEach(b => b.addEventListener('click', () => show(b.dataset.mode)));
    const wantSc = new URLSearchParams(location.search).get('scenario');
    show(wantSc ? 'sc' : (btns[0]?.dataset.mode || 'use'));
  }

  /* 模拟场景播放器。
     TK.scenario({
       mount: '#scPlayer',
       role: '线索核查员 · 老陈', where: '周一 09:00 · 市医保局基金监管处',
       text: '剧情引入…',
       steps: [{ id, title, sub, btn, say, run: async (ctx) => html }],
       finale: { text, next: { label, href } },
     })
     run 返回的 html 渲染进本步 .sc-res；抛错则显示错误并允许重试；
     ctx 是场景内共享对象，可在步骤间传数据（如 Top1 案卷）。 */
  function scenario(opts) {
    const mount = typeof opts.mount === 'string' ? $(opts.mount) : opts.mount;
    if (!mount) return null;
    const ctx = {};
    const done = new Set();

    mount.innerHTML =
      `<div class="sc">
        <div class="sc-scene">
          <span class="sc-role">👤 ${esc(opts.role)}</span>
          <span class="sc-where">${esc(opts.where)}</span>
          <div class="sc-dots">${opts.steps.map(s => `<i id="scdot-${esc(s.id)}"></i>`).join('')}</div>
        </div>
        <p class="sc-text">${opts.text || ''}</p>
        <div class="sc-steps">
        ${opts.steps.map((s, i) => `
          <section class="sc-step" id="scstep-${esc(s.id)}">
            <div class="sc-h">
              <div class="sc-num">${i + 1}</div>
              <div class="sc-tt"><h3>${esc(s.title)}</h3><p>${esc(s.sub || '')}</p></div>
              <button id="scbtn-${esc(s.id)}" disabled>${esc(s.btn || '执行')}</button>
            </div>
            <div class="sc-b">
              ${s.say ? `<div class="sc-pitch">${esc(s.say)}</div>` : ''}
              <div class="sc-res" id="scres-${esc(s.id)}"></div>
            </div>
          </section>`).join('')}
        </div>
        <div class="sc-final" id="sc-final">
          <span style="font-size:22px">🏁</span>
          <div class="ftext">${esc(opts.finale?.text || '场景完成。')}</div>
          ${opts.finale?.next ? `<a class="btn gold" href="${esc(opts.finale.next.href)}">${esc(opts.finale.next.label)} →</a>` : ''}
        </div>
      </div>`;

    function unlock(id) {
      $('#scstep-' + id, mount).classList.add('unlocked', 'open');
      $('#scbtn-' + id, mount).disabled = false;
    }
    function markDone(id) {
      done.add(id);
      $('#scstep-' + id, mount).classList.add('done', 'open');
      $('#scdot-' + id, mount).classList.add('on');
      const idx = opts.steps.findIndex(s => s.id === id);
      if (idx + 1 < opts.steps.length) unlock(opts.steps[idx + 1].id);
      if (done.size === opts.steps.length) $('#sc-final', mount).classList.add('show');
    }

    opts.steps.forEach(step => {
      const btn = $('#scbtn-' + step.id, mount);
      btn.addEventListener('click', async () => {
        const res = $('#scres-' + step.id, mount);
        btn.disabled = true;
        btn.classList.add('running');
        const oldLabel = btn.textContent;
        btn.textContent = '执行中…';
        try {
          res.innerHTML = (await step.run(ctx)) || '<p class="msg ok">✓ 完成</p>';
          markDone(step.id);
          btn.textContent = '✓ 已完成';
        } catch (e) {
          res.innerHTML = `<p class="msg err">✗ ${esc(e.message)} —— 请确认本地引擎已启动（node prototype/app/server.js），然后重试。</p>`;
          btn.disabled = false;
          btn.textContent = oldLabel;
        }
        btn.classList.remove('running');
      });
    });
    unlock(opts.steps[0].id);
    return { ctx };
  }

  window.TK = { $, esc, money, tierBadge, toast, modes, scenario, TIERS };
  document.addEventListener('DOMContentLoaded', modes);
})();
