'use strict';
// 鹰眼插件设置:chrome.storage.sync 读写引擎地址与开关
const DEFAULTS = { engineBase: 'http://localhost:3700', interceptSubmit: true, showCleanBadge: true, natureFilter: 'any' };

function load() {
  chrome.storage.sync.get(DEFAULTS, (cfg) => {
    document.getElementById('engineBase').value = cfg.engineBase;
    document.getElementById('interceptSubmit').checked = cfg.interceptSubmit;
    document.getElementById('showCleanBadge').checked = cfg.showCleanBadge;
    document.getElementById('natureFilter').value = cfg.natureFilter;
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
  const st = document.getElementById('status');
  st.style.color = '#7a8ba0'; st.textContent = '测试中…';
  const t0 = Date.now();
  try {
    const r = await fetch(base + '/api/precheck', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patient: {}, items: [] }),
    });
    const j = await r.json();
    st.style.color = '#0a7a4b';
    st.textContent = `连接成功 · ${Date.now() - t0}ms · ${j.engine || '引擎在线'}`;
  } catch (e) {
    st.style.color = '#b91c1c';
    st.textContent = '连接失败:' + e.message + '(确认已启动本地引擎)';
  }
};

load();
