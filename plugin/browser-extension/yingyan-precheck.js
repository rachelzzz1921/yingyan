/**
 * 鹰眼 · 开单事前提醒(共享实现)
 * 浏览器扩展 content script 与 MockHIS 内嵌演示通道共用同一份逻辑:
 *   读页面表单(患者+医嘱行) → POST /api/precheck(本地引擎) → 浮层提醒
 * 政策出处:"定点医药机构可以将两库置于本机构智能提醒等信息化系统中……将不合规行为消除在萌芽阶段"
 */
(function () {
  'use strict';

  function scrapePatient() {
    // 优先 data-field 标注;退化为按标签文本找相邻单元格(适配未标注的老 HIS 表格)
    const byField = (f) => document.querySelector(`[data-field="${f}"]`)?.textContent?.trim();
    const byLabel = (label) => {
      const tds = [...document.querySelectorAll('td,th,label,span')];
      const hit = tds.find(el => el.textContent.trim() === label);
      return hit?.nextElementSibling?.textContent?.trim();
    };
    const ageText = byField('age') || byLabel('年龄') || '';
    return {
      sex: byField('sex') || byLabel('性别') || '',
      age: parseInt(String(ageText).replace(/[^0-9]/g, ''), 10),
      diagnosis: byField('diagnosis') || byLabel('临床诊断') || byLabel('诊断') || '',
      insurance: byField('insurance') || byLabel('医保类型') || '',
    };
  }

  function scrapeOrders() {
    const rows = [...document.querySelectorAll('table tbody tr')];
    const items = [];
    for (const tr of rows) {
      const name = tr.querySelector('.ord-name')?.value?.trim()
        || tr.querySelector('input')?.value?.trim();
      if (!name) continue;
      const qty = Number(tr.querySelector('.ord-qty')?.value || 1);
      const unit = tr.querySelector('.ord-unit')?.value || '';
      items.push({ name, qty, unit });
    }
    return items;
  }

  function badge(nature) {
    const bg = nature === '明确违规' ? '#b91c1c' : '#f59e0b';
    return `<span style="display:inline-block;padding:1px 8px;border-radius:5px;background:${bg};color:#fff;font-size:11px;font-weight:800">${nature || '可疑'}</span>`;
  }

  function showOverlay(result) {
    document.getElementById('yy-precheck-overlay')?.remove();
    const box = document.createElement('div');
    box.id = 'yy-precheck-overlay';
    box.style.cssText = 'position:fixed;right:18px;bottom:18px;width:400px;max-height:72vh;overflow:auto;background:#fff;border:1px solid #d3dce6;border-radius:12px;box-shadow:0 12px 40px rgba(10,30,60,.28);z-index:2147483647;font-family:"PingFang SC","Microsoft YaHei",sans-serif;font-size:13px;color:#1a2b3c';
    const hits = result.hits || [];
    const head = `<div style="padding:10px 14px;border-bottom:1px solid #edf1f6;display:flex;align-items:center;gap:8px">
      <b style="font-size:14px">🦅 鹰眼 · 开单事前提醒</b>
      <span style="font-size:11px;color:#7a8ba0">${result.engine || 'L1确定性·毫秒级'} · 本地运行,数据不出机</span>
      <span style="flex:1"></span>
      <a href="javascript:void(0)" id="yy-close" style="text-decoration:none;color:#7a8ba0;font-size:16px">×</a></div>`;
    const body = hits.length
      ? hits.map(h => `<div style="padding:10px 14px;border-bottom:1px solid #f2f5f9">
          <div style="margin-bottom:4px">${badge(h.nature)} <b>${h.rule_id} ${h.rule_name || ''}</b></div>
          <div style="color:#3c4d61;line-height:1.55">${h.reasoning || ''}</div>
          ${(h.policy || []).slice(0, 2).map(p => `<div style="margin-top:5px;font-size:11.5px;color:#5b6d82;background:#f6f9fc;border-left:3px solid #4a7fb5;padding:5px 8px">📖 ${p.ref}${p.text ? ':' + String(p.text).slice(0, 70) + '…' : ''}</div>`).join('')}
          ${h.disposal_suggestion ? `<div style="margin-top:5px;font-size:12px;color:#0a7a4b">✎ ${h.disposal_suggestion}</div>` : ''}
        </div>`).join('')
      : '<div style="padding:18px 14px;color:#0a7a4b">✓ 本次开单未命中事前提醒规则——合规放行。</div>';
    const foot = `<div style="padding:8px 14px;font-size:11px;color:#8a99ab">依据国家医保两库与相关号令 · 违规消除在"萌芽" · 鹰眼引擎 ${hits.length ? `命中 ${hits.length} 条` : ''}(${result.checked_rules_count ?? '—'} 条事前规则已核)</div>`;
    box.innerHTML = head + body + foot;
    document.body.appendChild(box);
    box.querySelector('#yy-close').onclick = () => box.remove();
  }

  async function run(opts = {}) {
    const engineBase = opts.engineBase ?? 'http://localhost:3700';
    const payload = { patient: scrapePatient(), items: scrapeOrders() };
    try {
      const r = await fetch(engineBase + '/api/precheck', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const j = await r.json();
      showOverlay(j);
      return j;
    } catch (e) {
      showOverlay({ hits: [], engine: '引擎未连接(' + e.message + ')——请确认鹰眼本地服务已启动' });
      return null;
    }
  }

  window.YingyanPrecheck = { run, scrapePatient, scrapeOrders };
})();
