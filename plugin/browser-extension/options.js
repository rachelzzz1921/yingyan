'use strict';
// 鹰眼插件设置:chrome.storage.sync 读写引擎地址与开关
const DEFAULTS = { engineBase: 'http://localhost:3700', interceptSubmit: true, showCleanBadge: true, natureFilter: 'any' };
function isLocal(base) { return /^(http:\/\/)?(localhost|127\.0\.0\.1)(:|\/|$)/.test(String(base || '')); }
function updateGuard(base) {
  const g = document.getElementById('engineGuard');
  const local = isLocal(base);
  g.style.borderColor = local ? '#a7f3d0' : '#fed7aa';
  g.style.background = local ? '#ecfdf5' : '#fff7ed';
  g.style.color = local ? '#0a7a4b' : '#8a5a00';
  g.innerHTML = local
    ? '<b>部署边界</b>: 当前为本地回环地址,数据只发往本机鹰眼引擎。'
    : '<b>部署边界</b>: 当前不是 localhost,只应填写可信院内引擎地址。';
}

function load() {
  chrome.storage.sync.get(DEFAULTS, (cfg) => {
    document.getElementById('engineBase').value = cfg.engineBase;
    document.getElementById('interceptSubmit').checked = cfg.interceptSubmit;
    document.getElementById('showCleanBadge').checked = cfg.showCleanBadge;
    document.getElementById('natureFilter').value = cfg.natureFilter;
    updateGuard(cfg.engineBase);
  });
}

document.getElementById('btnSave').onclick = () => {
  const cfg = {
    engineBase: document.getElementById('engineBase').value.trim().replace(/\/$/, '') || DEFAULTS.engineBase,
    interceptSubmit: document.getElementById('interceptSubmit').checked,
    showCleanBadge: document.getElementById('showCleanBadge').checked,
    natureFilter: document.getElementById('natureFilter').value,
  };
  chrome.storage.sync.set(cfg, () => {
    document.getElementById('status').textContent = '已保存 ✓';
    setTimeout(() => { document.getElementById('status').textContent = ''; }, 1500);
  });
};

document.getElementById('btnTest').onclick = async () => {
  const base = document.getElementById('engineBase').value.trim().replace(/\/$/, '') || DEFAULTS.engineBase;
  updateGuard(base);
  const st = document.getElementById('status');
  st.style.color = '#7a8ba0'; st.textContent = '测试中…';
  const t0 = Date.now();
  try {
    const r = await fetch(base + '/api/precheck', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patient: {}, items: [] }),
    });
    const j = await r.json();
    st.style.color = '#0a7a4b';
    st.textContent = `连接成功 · ${Date.now() - t0}ms · ${j.engine || '引擎在线'} · ${isLocal(base) ? '本地' : '内网/远端'}`;
  } catch (e) {
    st.style.color = '#b91c1c';
    st.textContent = '连接失败:' + e.message + '(确认已启动本地引擎)';
  }
};

document.getElementById('engineBase').addEventListener('input', (e) => updateGuard(e.target.value.trim()));

load();
