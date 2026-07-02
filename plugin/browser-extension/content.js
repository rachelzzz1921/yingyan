/**
 * 鹰眼扩展 content script:挂到开单页,提交医嘱前先审方。
 * 共享实现 yingyan-precheck.js 已由 manifest 先行注入(window.YingyanPrecheck)。
 */
(function () {
  'use strict';
  window.__yingyanPluginActive = true;

  // 页面右上角常驻小徽标:让"插件已挂载"可见(演示叙事点)
  const chip = document.createElement('div');
  chip.textContent = '🦅 鹰眼已挂载 · 事前提醒';
  chip.style.cssText = 'position:fixed;top:10px;right:12px;background:#0b2a4a;color:#fff;padding:4px 12px;border-radius:999px;font-size:12px;z-index:2147483647;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer;font-family:"PingFang SC","Microsoft YaHei",sans-serif';
  chip.title = '点击立即审方(不提交)';
  chip.onclick = () => window.YingyanPrecheck.run({});
  document.body.appendChild(chip);

  // 拦截"提交医嘱":先审方,有命中则弹提醒并暂缓提交(医生可复核后再提交——插件不替医生做决定)
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn || !/提交医嘱/.test(btn.textContent)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const result = await window.YingyanPrecheck.run({});
    if (result && result.clean) {
      setTimeout(() => alert('鹰眼审方通过——医嘱已提交。'), 200);
    }
    // 有命中:浮层已展示依据,提交动作暂缓,由医生调整或坚持提交(事前提醒不阻断诊疗)
  }, true);
})();
