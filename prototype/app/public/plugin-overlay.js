/**
 * 鹰眼 · 通用插件浮窗（plugin-overlay）
 * 复用「开单事前提醒」赢下来的产品形态：宿主界面 + 右下角悬浮插件卡。
 * 任何仿真宿主页（Excel / 规则后台 / 飞检文件夹 / 文档 …）都用它把鹰眼"贴"上去。
 * 样式内联，保持"被注入的插件"质感，不依赖宿主 CSS。
 *
 * 用法：
 *   const yy = YY.panel({ title:'鹰眼 · 疑点分诊', sub:'检测到疑点清单', accent:'#DC4A3D' });
 *   yy.loading('正在粗筛 1000 条…');
 *   yy.body(html);
 *   yy.chips([{text:'A 24',bg:'#b91c1c'},{text:'B 8',bg:'#d97706'}]);
 *   yy.actions([{label:'生成上会清单',kind:'primary',onClick(){}},{label:'打开行装包',href:'/x'}]);
 *   yy.footer('确定性规则·毫秒级 · 本地运行,数据不出机');
 *   yy.close();
 *   // 未展开时的入口胶囊：
 *   YY.launcher({ label:'🦅 鹰眼监管助手 已注入', hint:'点此让鹰眼分析当前清单', onClick(){...} });
 */
(function () {
  'use strict';
  if (window.YY) return;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var FONT = '"PingFang SC","Microsoft YaHei",sans-serif';
  var DEFAULT_STATUS = [
    { text: '本地引擎', tone: 'ok' },
    { text: 'KB+规则版本 2026-07', tone: 'info' },
    { text: '数据不出机', tone: 'safe' },
    { text: '人工最终裁定', tone: 'info' },
  ];

  function statusHtml(items) {
    items = (items && items.length ? items : DEFAULT_STATUS);
    var tone = {
      ok: ['#ecfdf5', '#0a7a4b', '#a7f3d0'],
      safe: ['#f0fdfa', '#0f766e', '#99f6e4'],
      warn: ['#fff7ed', '#b45309', '#fed7aa'],
      danger: ['#fef2f2', '#b91c1c', '#fecaca'],
      info: ['#f1f5f9', '#41556b', '#dbe4ef'],
    };
    return items.map(function (it) {
      if (typeof it === 'string') it = { text: it, tone: 'info' };
      var c = tone[it.tone || 'info'] || tone.info;
      return '<span style="display:inline-flex;align-items:center;gap:4px;background:' + c[0] + ';color:' + c[1] + ';border:1px solid ' + c[2] + ';border-radius:999px;padding:2px 8px;font-size:10.5px;font-weight:800;white-space:nowrap">' + esc(it.text) + '</span>';
    }).join('');
  }

  function panel(opts) {
    opts = opts || {};
    var accent = opts.accent || '#0B2A4A';
    document.getElementById('yy-overlay') && document.getElementById('yy-overlay').remove();
    var box = document.createElement('div');
    box.id = 'yy-overlay';
    // 基态即为不透明终态(不靠动画落定,防某些渲染器冻结动画首帧导致半透明);滑入交给 transition
    box.style.cssText = 'position:fixed;right:20px;bottom:20px;width:420px;max-height:80vh;display:flex;flex-direction:column;background:#fff;border:1px solid #d3dce6;border-radius:14px;box-shadow:0 18px 50px rgba(10,30,60,.32);z-index:2147483647;font-family:' + FONT + ';font-size:13px;color:#1a2b3c;overflow:hidden;opacity:1;transform:translateY(0);transition:transform .24s ease-out,opacity .24s ease-out';
    box.innerHTML =
      '<div style="padding:11px 14px;border-bottom:1px solid #edf1f6;display:flex;align-items:center;gap:8px;background:linear-gradient(90deg,#0B2A4A,#134E72)">' +
        '<b style="font-size:14px;color:#fff">🦅 ' + esc(opts.title || '鹰眼助手') + '</b>' +
        '<span id="yy-chips" style="display:flex;gap:6px"></span>' +
        '<span style="flex:1"></span>' +
        '<a href="javascript:void(0)" id="yy-close" style="text-decoration:none;color:#cfe0ee;font-size:18px;line-height:1">×</a>' +
      '</div>' +
      '<div id="yy-sub" style="padding:7px 14px;background:#f6f9fc;border-bottom:1px solid #edf1f6;font-size:12px;color:#5b6d82;' + (opts.sub ? '' : 'display:none') + '">' + esc(opts.sub || '') + '</div>' +
      '<div id="yy-status" style="padding:7px 14px;background:#fff;border-bottom:1px solid #edf1f6;display:flex;gap:6px;flex-wrap:wrap">' + statusHtml(opts.status) + '</div>' +
      '<div id="yy-body" style="padding:0;overflow:auto;flex:1;background:#fff"></div>' +
      '<div id="yy-actions" style="display:none;padding:10px 14px;border-top:1px solid #edf1f6;gap:8px;flex-wrap:wrap"></div>' +
      '<div id="yy-footer" style="padding:8px 14px;font-size:11px;color:#8a99ab;border-top:1px solid #edf1f6;display:none"></div>';
    document.body.appendChild(box);
    box.querySelector('#yy-close').onclick = close;

    var bodyEl = box.querySelector('#yy-body');
    var actEl = box.querySelector('#yy-actions');
    var footEl = box.querySelector('#yy-footer');
    var chipEl = box.querySelector('#yy-chips');
    var subEl = box.querySelector('#yy-sub');
    var statusEl = box.querySelector('#yy-status');

    function close() {
      box.style.opacity = '0'; box.style.transform = 'translateY(12px)';
      setTimeout(function () { box.remove(); }, 200);
      if (opts.onClose) opts.onClose();
    }
    function loading(text) {
      bodyEl.innerHTML = '<div style="padding:26px 16px;text-align:center;color:#5b6d82">' +
        '<div class="yy-spin" style="width:22px;height:22px;border:2.5px solid #e2e9f0;border-top-color:' + accent + ';border-radius:50%;margin:0 auto 10px;animation:yyspin .7s linear infinite"></div>' +
        esc(text || '分析中…') + '</div>';
      return h;
    }
    function body(html) { bodyEl.innerHTML = html; return h; }
    function sub(text) { subEl.style.display = text ? 'block' : 'none'; subEl.textContent = text || ''; return h; }
    function status(items) { statusEl.innerHTML = statusHtml(items); return h; }
    function chips(arr) {
      chipEl.innerHTML = (arr || []).map(function (c) {
        return '<span style="background:' + (c.bg || '#334') + ';color:#fff;font-size:11px;font-weight:800;padding:1px 8px;border-radius:20px">' + esc(c.text) + '</span>';
      }).join('');
      return h;
    }
    function actions(arr) {
      if (!arr || !arr.length) { actEl.style.display = 'none'; actEl.innerHTML = ''; return h; }
      actEl.style.display = 'flex';
      actEl.innerHTML = '';
      arr.forEach(function (a) {
        var el = document.createElement(a.href ? 'a' : 'button');
        var primary = a.kind === 'primary';
        el.textContent = a.label;
        el.style.cssText = 'flex:' + (a.grow === false ? '0 0 auto' : '1') + ';text-align:center;padding:8px 12px;border-radius:8px;font-size:12.5px;font-weight:700;cursor:pointer;text-decoration:none;border:' +
          (primary ? '0' : '1px solid #d3dce6') + ';background:' + (primary ? accent : '#fff') + ';color:' + (primary ? '#fff' : '#334') + ';font-family:' + FONT;
        if (a.href) el.href = a.href;
        if (a.onClick) el.onclick = function () { a.onClick(h); };
        actEl.appendChild(el);
      });
      return h;
    }
    function footer(text) {
      if (!text) { footEl.style.display = 'none'; return h; }
      footEl.style.display = 'block';
      footEl.textContent = text;
      return h;
    }
    var h = { el: box, bodyEl: bodyEl, close: close, loading: loading, body: body, sub: sub, status: status, chips: chips, actions: actions, footer: footer,
      debate: function (debateObj, opts) { body(debateHtml(debateObj, opts)); return h; }
    };
    return h;
  }

  function launcher(opts) {
    opts = opts || {};
    document.getElementById('yy-launcher') && document.getElementById('yy-launcher').remove();
    var chip = document.createElement('div');
    chip.id = 'yy-launcher';
    chip.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483646;font-family:' + FONT;
    chip.innerHTML =
      '<button id="yy-launch-btn" style="display:flex;align-items:center;gap:9px;border:1px solid rgba(20,184,166,.5);border-radius:14px;background:linear-gradient(90deg,#0B2A4A,#134E72);color:#fff;font-family:' + FONT + ';padding:10px 15px;cursor:pointer;box-shadow:0 10px 30px rgba(11,42,74,.32);text-align:left">' +
        '<span style="font-size:18px">🦅</span>' +
        '<span><b style="font-size:12.5px;display:block">' + esc(opts.label || '鹰眼插件 已注入') + '</b>' +
        '<span style="font-size:11px;opacity:.75">' + esc(opts.hint || '点此分析当前页面') + '</span></span>' +
      '</button>';
    document.body.appendChild(chip);
    chip.querySelector('#yy-launch-btn').onclick = function () {
      // 默认常驻:浮标点后不自我移除 → 关闭 panel 后仍可反复触发,防"用一次即整页点不动"。仅显式 hideOnClick:true 才移除。
      if (opts.hideOnClick === true) chip.remove();
      opts.onClick && opts.onClick();
    };
    return { remove: function () { chip.remove(); } };
  }

  function debateHtml(debate, opts) {
    opts = opts || {};
    if (!debate || !debate.enabled) return '<p style="padding:12px 14px;color:#5b6d82;font-size:12px">暂无合议记录。</p>';
    var DF = window.DebateFormat;
    if (!DF) {
      return '<p style="padding:12px 14px;color:#8a99ab;font-size:12px">合议详情需加载 debate-format.js · <a href="/agent-chain.html?preview=appeal" style="color:#134E72">打开申诉批阅</a></p>';
    }
    var roleClass = function (role) {
      if (role === '控方') return 'yy-d-pro';
      if (role === '辩方') return 'yy-d-def';
      if (role === '裁判') return 'yy-d-judge';
      return '';
    };
    var css = '.yy-debate-exch{padding:8px 12px;border-bottom:1px solid #eef2f7;font-size:12px;line-height:1.6}'
      + '.yy-debate-role{font-size:11px;font-weight:800;margin-bottom:4px;color:#41556b}'
      + '.yy-d-pro .yy-debate-role{color:#9a2c22}.yy-d-def .yy-debate-role{color:#0E7568}.yy-d-judge .yy-debate-role{color:#5b3a9e}'
      + '.reb-item{padding:6px 0;border-top:1px dashed #e8edf3}.reb-item:first-child{border-top:0}'
      + '.reb-target{font-size:10.5px;font-weight:800;color:#41556b;margin-bottom:2px}'
      + '.exch-summary{font-weight:600;margin:0 0 6px}.exch-points{margin:0;padding-left:16px}';
    var summary = DF.renderDebateSummary(debate, esc);
    var exchanges = DF.renderExchangesHtml(debate, esc, { roleClass: roleClass });
    var cites = (debate.kb_citations || []).length
      ? '<div style="padding:6px 12px 10px;font-size:10.5px;color:#7a8ba0">依据：' + debate.kb_citations.map(function (c) { return '<code style="background:#f1f5f9;padding:1px 4px;border-radius:3px">' + esc(c) + '</code>'; }).join(' ') + '</div>'
      : '';
    return '<style>' + css + '</style>' + summary + exchanges + cites
      + (opts.linkFull ? '<div style="padding:8px 12px;border-top:1px solid #eef2f7"><a href="/agent-chain.html?preview=appeal" style="font-size:12px;font-weight:700;color:#134E72">完整七环节调用链 →</a></div>' : '');
  }

  // 注入一次全局动画
  if (!document.getElementById('yy-overlay-kf')) {
    var st = document.createElement('style');
    st.id = 'yy-overlay-kf';
    st.textContent = '@keyframes yyspin{to{transform:rotate(360deg)}}';
    document.head.appendChild(st);
  }

  window.YY = { panel: panel, launcher: launcher, esc: esc, debateHtml: debateHtml };
})();
