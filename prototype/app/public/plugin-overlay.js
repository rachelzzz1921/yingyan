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
 *   yy.footer('L1 确定性·毫秒级 · 本地运行,数据不出机');
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
    var h = { el: box, bodyEl: bodyEl, close: close, loading: loading, body: body, sub: sub, chips: chips, actions: actions, footer: footer };
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
      if (opts.hideOnClick !== false) chip.remove();
      opts.onClick && opts.onClick();
    };
    return { remove: function () { chip.remove(); } };
  }

  // 注入一次全局动画
  if (!document.getElementById('yy-overlay-kf')) {
    var st = document.createElement('style');
    st.id = 'yy-overlay-kf';
    st.textContent = '@keyframes yyspin{to{transform:rotate(360deg)}}';
    document.head.appendChild(st);
  }

  window.YY = { panel: panel, launcher: launcher, esc: esc };
})();
