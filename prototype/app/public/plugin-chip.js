/**
 * 鹰眼 · 插件浮标（院端演示工作站共用）
 * 老 HIS 靶站保持旧观感，本浮标扮演"扩展注入后的存在感"：
 * 一颗小胶囊固定在左下角，展开后提供回工具箱/看板的统一导航。
 * 位置避开右下角的事前提醒浮层（yingyan-precheck overlay）。
 */
(function () {
  'use strict';
  var chip = document.createElement('div');
  chip.id = 'yy-plugin-chip';
  chip.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:2147483646;font-family:"PingFang SC","Microsoft YaHei",sans-serif;font-size:12px';
  chip.innerHTML =
    '<div id="yy-chip-menu" style="display:none;margin-bottom:8px;background:#fff;border:1px solid #d3dce6;border-radius:10px;box-shadow:0 10px 30px rgba(10,30,60,.22);overflow:hidden;min-width:190px">' +
      '<a href="/plugins.html" style="display:block;padding:9px 14px;color:#134E72;text-decoration:none;border-bottom:1px solid #eef2f7;font-weight:700">🧰 插件 & 小工具箱</a>' +
      '<a href="/plugin-dashboard.html" style="display:block;padding:9px 14px;color:#134E72;text-decoration:none;border-bottom:1px solid #eef2f7;font-weight:700">📊 院端运营看板</a>' +
      '<a href="/home.html" style="display:block;padding:9px 14px;color:#5C7185;text-decoration:none;font-weight:700">← 三入口</a>' +
    '</div>' +
    '<button id="yy-chip-btn" style="display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(20,184,166,.55);border-radius:999px;background:linear-gradient(90deg,#0B2A4A,#134E72);color:#fff;font-weight:800;font-size:12px;padding:7px 13px;cursor:pointer;box-shadow:0 6px 18px rgba(11,42,74,.28)">🦅 鹰眼插件已注入<span style="opacity:.7">▴</span></button>';
  document.body.appendChild(chip);
  var menu = chip.querySelector('#yy-chip-menu');
  chip.querySelector('#yy-chip-btn').addEventListener('click', function () {
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
  });
})();
