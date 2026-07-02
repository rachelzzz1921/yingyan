'use strict';
// 弹窗:读设置里的引擎地址,拉台账汇总,给看板/设置入口
const DEFAULTS = { engineBase: 'http://localhost:3700' };
chrome.storage.sync.get(DEFAULTS, async (cfg) => {
  const base = cfg.engineBase || DEFAULTS.engineBase;
  document.getElementById('lnkDash').href = base + '/plugin-dashboard.html';
  document.getElementById('lnkDash').target = '_blank';
  document.getElementById('lnkOptions').onclick = (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); };
  try {
    const d = await fetch(base + '/api/precheck/ledger').then(r => r.json());
    document.getElementById('dot').classList.add('on');
    document.getElementById('engineState').textContent = '引擎在线 · 本地';
    const t = d.today || {};
    document.getElementById('fired').textContent = t.reminders_fired || 0;
    document.getElementById('heed').textContent = d.heed_rate == null ? '—' : d.heed_rate + '%';
    document.getElementById('budding').textContent = d.budding_intercepts || 0;
    document.getElementById('over').textContent = t.overridden || 0;
  } catch (e) {
    document.getElementById('engineState').textContent = '引擎未连接(先启动本地服务)';
  }
});
