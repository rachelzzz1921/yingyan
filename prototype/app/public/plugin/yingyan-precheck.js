/**
 * 鹰眼 · 开单事前提醒(共享实现)
 * 浏览器扩展 content script 与 MockHIS 内嵌演示通道共用同一份逻辑:
 *   读页面表单(患者+医嘱行) → POST /api/precheck(本地引擎) → 浮层提醒
 * 政策出处:"定点医药机构可以将两库置于本机构智能提醒等信息化系统中……将不合规行为消除在萌芽阶段"
 */
(function () {
  'use strict';

  // 所有引擎返回字段(reasoning/rule_name/policy.text/disposal…)经此转义后再进 innerHTML,
  // 防存储型 XSS(item_name 读自开单页自由文本,将来接真实 KB 数据源同样兜住)
  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

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
    return `<span style="display:inline-block;padding:1px 8px;border-radius:5px;background:${bg};color:#fff;font-size:11px;font-weight:800">${esc(nature || '可疑')}</span>`;
  }

  function hitCard(h) {
    const border = h.nature === '明确违规' ? '#b91c1c' : '#f59e0b';
    const pols = (h.policy || []).slice(0, 3);
    const polRow = (p) => {
      const vcolor = String(p.verify_status || '').indexOf('已核') >= 0 ? '#0a7a4b' : '#a97a00';
      const vtag = p.verify_status ? ` <span style="color:${vcolor}">${esc(p.verify_status)}</span>` : '';
      const ptext = p.text ? '<br>' + esc(String(p.text).slice(0, 80)) : '';
      return `<div style="margin-top:4px;font-size:11.5px;color:#5b6d82;background:#f6f9fc;border-left:3px solid ${border};padding:5px 8px">${esc(p.ref)}${vtag}${ptext}</div>`;
    };
    const polBlock = pols.length
      ? `<details style="margin-top:5px"><summary style="font-size:11.5px;color:#4a7fb5;cursor:pointer;list-style:none">📖 依据 ${pols.length} 条 ›</summary>${pols.map(polRow).join('')}</details>`
      : '';
    return `<div style="padding:10px 14px;border-bottom:1px solid #f2f5f9;border-left:4px solid ${border}">
        <div style="margin-bottom:4px">${badge(h.nature)} <b>${esc(h.rule_id)} ${esc(h.rule_name)}</b></div>
        <div style="color:#3c4d61;line-height:1.55">${esc(h.reasoning)}</div>
        ${polBlock}
        ${h.disposal_suggestion ? `<div style="margin-top:5px;font-size:12px;color:#0a7a4b">✎ ${esc(h.disposal_suggestion)}</div>` : ''}
      </div>`;
  }

  function showOverlay(result) {
    document.getElementById('yy-precheck-overlay')?.remove();
    const box = document.createElement('div');
    box.id = 'yy-precheck-overlay';
    box.style.cssText = 'position:fixed;right:18px;bottom:18px;width:412px;max-height:74vh;overflow:auto;background:#fff;border:1px solid #d3dce6;border-radius:12px;box-shadow:0 12px 40px rgba(10,30,60,.28);z-index:2147483647;font-family:"PingFang SC","Microsoft YaHei",sans-serif;font-size:13px;color:#1a2b3c';
    const hits = result.hits || [];
    const hard = hits.filter(h => h.nature === '明确违规');
    const susp = hits.filter(h => h.nature !== '明确违规');
    const countChip = (n, txt, bg) => n ? `<span style="background:${bg};color:#fff;font-size:11px;font-weight:800;padding:1px 8px;border-radius:20px">${txt} ${n}</span>` : '';
    const head = `<div style="padding:10px 14px;border-bottom:1px solid #edf1f6;display:flex;align-items:center;gap:8px">
      <b style="font-size:14px">🦅 鹰眼 · 开单事前提醒</b>
      ${countChip(hard.length, '明确违规', '#b91c1c')} ${countChip(susp.length, '可疑', '#d97706')}
      <span style="flex:1"></span>
      <a href="javascript:void(0)" id="yy-close" style="text-decoration:none;color:#7a8ba0;font-size:16px">×</a></div>`;
    let body;
    if (!hits.length) {
      body = `<div style="padding:20px 14px;text-align:center">
        <div style="font-size:15px;color:#0a7a4b;font-weight:600">🟩 合规放行</div>
        <div style="font-size:12px;color:#5b6d82;margin-top:6px">本次开单未命中任何事前提醒规则。已核 ${(result.checked_rules || []).length || result.checked_rules_count || '—'} 条事前规则。</div>
      </div>`;
    } else {
      const section = (title, arr, color) => arr.length
        ? `<div style="padding:6px 14px;background:#f8fafc;font-size:12px;font-weight:700;color:${color};border-bottom:1px solid #edf1f6">${title} · ${arr.length}</div>` + arr.map(hitCard).join('')
        : '';
      body = section('🟥 明确违规(硬性交叉核验,可直接拦截)', hard, '#b91c1c')
           + section('🟨 可疑(需临床合理性合议,软提醒)', susp, '#a15c00');
    }
    const foot = `<div style="padding:8px 14px;font-size:11px;color:#8a99ab;border-top:1px solid #edf1f6">${esc(result.engine || 'L1确定性·毫秒级')} · 本地运行,数据不出机 · 依据国家医保两库与相关号令 · 违规消除在"萌芽"</div>`;
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
      // opts.showClean===false 时,合规(无命中)不弹绿浮层(设置项);有命中始终弹
      if (!(opts.showClean === false && (j.hits || []).length === 0)) showOverlay(j);
      return j;
    } catch (e) {
      showOverlay({ hits: [], engine: '引擎未连接(' + e.message + ')——请确认鹰眼本地服务已启动' });
      return null;
    }
  }

  window.YingyanPrecheck = { run, scrapePatient, scrapeOrders };
})();
