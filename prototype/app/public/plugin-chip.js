/**
 * 鹰眼 · 插件浮标（院端演示工作站共用）
 * 老 HIS 靶站保持旧观感，本浮标扮演"扩展注入后的存在感"：
 * 一颗小胶囊固定在左下角，展开后提供回工具箱/看板的统一导航。
 * 位置避开右下角的事前提醒浮层（yingyan-precheck overlay）。
 * 另：?tour=1 时显示「院端连播」导览条（plugins.html 一键连播的载体）。
 */
(function () {
  'use strict';
  var chip = document.createElement('div');
  chip.id = 'yy-plugin-chip';
  chip.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:2147483646;font-family:"PingFang SC","Microsoft YaHei",sans-serif;font-size:12px';
  chip.innerHTML =
    '<div id="yy-chip-menu" style="display:none;margin-bottom:8px;background:#fff;border:1px solid #d3dce6;border-radius:10px;box-shadow:0 10px 30px rgba(10,30,60,.22);overflow:hidden;min-width:190px">' +
      '<div style="padding:8px 14px;font-size:11px;color:#8296A9;border-bottom:1px solid #eef2f7;line-height:1.5;max-width:230px">本页为<b style="color:#134E72">内嵌演示版</b>；生产形态为浏览器扩展 / 桌面哨兵，装上即用、数据不出机</div>' +
      '<a href="/plugins.html" style="display:block;padding:9px 14px;color:#134E72;text-decoration:none;border-bottom:1px solid #eef2f7;font-weight:700">🧰 插件 & 小工具箱</a>' +
      '<a href="/plugin-dashboard.html" style="display:block;padding:9px 14px;color:#134E72;text-decoration:none;border-bottom:1px solid #eef2f7;font-weight:700">📊 院端运营看板</a>' +
      '<a href="/coverage-map.html" style="display:block;padding:9px 14px;color:#134E72;text-decoration:none;border-bottom:1px solid #eef2f7;font-weight:700">🗺 79 条覆盖地图</a>' +
      '<a href="/agent-chain.html" style="display:block;padding:9px 14px;color:#134E72;text-decoration:none;border-bottom:1px solid #eef2f7;font-weight:700">🔗 七环节调用链</a>' +
      '<a href="/home.html" style="display:block;padding:9px 14px;color:#5C7185;text-decoration:none;font-weight:700">← 三入口</a>' +
    '</div>' +
    '<button id="yy-chip-btn" title="鹰眼插件已注入 · 点开可回工具箱 / 看板 / 三入口" style="display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(20,184,166,.55);border-radius:999px;background:linear-gradient(90deg,#0B2A4A,#134E72);color:#fff;font-weight:800;font-size:12px;padding:7px 13px;cursor:pointer;box-shadow:0 6px 18px rgba(11,42,74,.28)">🦅 鹰眼插件已注入<span style="opacity:.7">▴</span></button>';
  document.body.appendChild(chip);
  var menu = chip.querySelector('#yy-chip-menu');
  chip.querySelector('#yy-chip-btn').addEventListener('click', function () {
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
  });
  // 首次进入轻展开一次，让用户知道浮标可点（3.5s 后自动收起，不打扰）
  try {
    if (!sessionStorage.getItem('yy_chip_seen')) {
      sessionStorage.setItem('yy_chip_seen', '1');
      menu.style.display = 'block';
      setTimeout(function () { if (menu.style.display === 'block') menu.style.display = 'none'; }, 3500);
    }
  } catch (e) { /* 隐私模式等 sessionStorage 不可用时静默跳过 */ }

  // ---------- 院端连播导览（plugins.html「▶ 从医生开单开始」）----------
  var TOUR = {
    '/mockhis.html':          { i: 1, text: '选一个演示场景（如 S1 未成年+喹诺酮）→ 点「🦅 鹰眼审方」→ 浮层里「✓ 采纳·整改」，看被拦医嘱行当场消掉', next: ['/coder-station.html?tour=1', '下一站 · 编码校验'] },
    '/coder-station.html':    { i: 2, text: '点「🦅 提交编码前校验」→ 高套提示 + 第 35 条差额 → 采纳即降编、差额少结', next: ['/settle-station.html?tour=1', '下一站 · 结算自查'] },
    '/settle-station.html':   { i: 3, text: '点「🦅 结算前整单自查」→ 整单三档漏斗 → 采纳整改标注行后重校通过', next: ['/plugin-dashboard.html?tour=1', '下一站 · 运营看板'] },
    '/plugin-dashboard.html': { i: 4, text: '三个角色的提醒汇入同一台账：遵从率、萌芽拦截、未遵从待监管——坚持提交的单已流向监管预警', next: ['/priority.html', '收口 · 监管工作台'] },
  };
  var wantTour = false;
  try { wantTour = new URLSearchParams(location.search).get('tour') === '1'; } catch (e) { /* ignore */ }
  var t = wantTour && TOUR[location.pathname.replace(/\/+$/, '') || location.pathname];
  if (t) {
    var bar = document.createElement('div');
    bar.id = 'yy-tour-bar';
    bar.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:2147483646;display:flex;align-items:center;gap:12px;max-width:min(760px,calc(100vw - 24px));padding:9px 16px;border-radius:12px;background:linear-gradient(100deg,#0B2A4A,#134E72);color:#fff;box-shadow:0 12px 32px rgba(11,42,74,.4);font-family:"PingFang SC","Microsoft YaHei",sans-serif;font-size:12.5px;line-height:1.5';
    bar.innerHTML =
      '<span style="flex:none;font-size:11px;font-weight:800;letter-spacing:.08em;color:#F5C842;border:1px solid rgba(245,200,66,.55);border-radius:20px;padding:3px 10px;white-space:nowrap">院端连播 ' + t.i + '/4</span>' +
      '<span style="flex:1;min-width:0">' + t.text + '</span>' +
      '<a href="' + t.next[0] + '" style="flex:none;color:#0B2A4A;background:#F5C842;border-radius:8px;padding:5px 12px;font-weight:800;text-decoration:none;white-space:nowrap">' + t.next[1] + ' →</a>' +
      '<button id="yy-tour-close" style="flex:none;background:none;border:none;color:#ffffff99;cursor:pointer;font-size:14px;padding:0 2px">✕</button>';
    document.body.appendChild(bar);
    bar.querySelector('#yy-tour-close').addEventListener('click', function () { bar.remove(); });
  }
})();
