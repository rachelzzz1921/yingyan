/**
 * 鹰眼扩展 content script:挂到开单页,提交医嘱前先审方。
 * 共享实现 yingyan-precheck.js 已由 manifest 先行注入(window.YingyanPrecheck)。
 * 配置(引擎地址/拦截开关/暂缓阈值)从 chrome.storage.sync 读,设置页可改。
 */
(function () {
  'use strict';
  window.__yingyanPluginActive = true;

  const DEFAULTS = { engineBase: 'http://localhost:3700', interceptSubmit: true, showCleanBadge: true, natureFilter: 'any' };
  let CFG = { ...DEFAULTS };
  try { chrome.storage.sync.get(DEFAULTS, (c) => { CFG = c || DEFAULTS; }); } catch (_) { /* 非扩展环境用默认 */ }

  // 页面右上角常驻小徽标:让"插件已挂载"可见(演示叙事点)
  const chip = document.createElement('div');
  chip.textContent = '🦅 鹰眼已挂载 · 事前提醒';
  chip.style.cssText = 'position:fixed;top:10px;right:12px;background:#0b2a4a;color:#fff;padding:4px 12px;border-radius:999px;font-size:12px;z-index:2147483647;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer;font-family:"PingFang SC","Microsoft YaHei",sans-serif';
  chip.title = '点击立即审方(不提交)';
  chip.onclick = () => window.YingyanPrecheck.run({ engineBase: CFG.engineBase });
  document.body.appendChild(chip);

  // 拦截"提交医嘱":先审方,有命中(按阈值)则弹提醒并暂缓提交(医生可复核后再提交——插件不替医生做决定)
  document.addEventListener('click', async (e) => {
    if (!CFG.interceptSubmit) return; // 设置里关了拦截 → 只保留徽标手动审方
    const btn = e.target.closest('button');
    if (!btn || !/提交医嘱/.test(btn.textContent)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const result = await window.YingyanPrecheck.run({ engineBase: CFG.engineBase, showClean: CFG.showCleanBadge });
    if (!result) return;
    const hits = result.hits || [];
    const hardHits = hits.filter(h => h.nature === '明确违规');
    const shouldHold = CFG.natureFilter === 'hard' ? hardHits.length > 0 : hits.length > 0;
    if (!shouldHold) {
      setTimeout(() => alert('鹰眼审方通过——医嘱已提交。'), 200);
    }
    // 需暂缓:浮层已展示依据,提交动作已被拦下,由医生调整或坚持提交(事前提醒不阻断诊疗)
  }, true);
})();
