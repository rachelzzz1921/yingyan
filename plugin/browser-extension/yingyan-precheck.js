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
    const isBlock = h.interaction === 'block' || (h.interaction !== 'suggest' && h.nature === '明确违规');
    const border = isBlock ? '#b91c1c' : '#f59e0b';
    const modeLabel = isBlock ? '阻断' : '建议';
    const modeBg = isBlock ? '#fef2f2' : '#fffbeb';
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
    return `<div style="padding:10px 14px;border-bottom:1px solid #f2f5f9;border-left:4px solid ${border};background:${modeBg}">
        <div style="margin-bottom:4px">${badge(h.nature)} <span style="font-size:10px;font-weight:800;color:${border};margin-left:4px">${modeLabel}</span> <b>${esc(h.rule_id)} ${esc(h.precheck_title || h.rule_name)}</b></div>
        ${h.precheck_body ? `<div style="font-size:12px;color:#5b6d82;margin-bottom:4px">${esc(h.precheck_body)}</div>` : ''}
        <div style="color:#3c4d61;line-height:1.55">${esc(h.reasoning)}</div>
        ${polBlock}
        ${h.disposal_suggestion ? `<div style="margin-top:5px;font-size:12px;color:#0a7a4b">✎ ${esc(h.disposal_suggestion)}</div>` : ''}
      </div>`;
  }

  function showOverlay(result, ctx = {}) {
    document.getElementById('yy-precheck-overlay')?.remove();
    const box = document.createElement('div');
    box.id = 'yy-precheck-overlay';
    box.style.cssText = 'position:fixed;right:18px;bottom:18px;width:412px;max-height:74vh;overflow:auto;background:#fff;border:1px solid #d3dce6;border-radius:12px;box-shadow:0 12px 40px rgba(10,30,60,.28);z-index:2147483647;font-family:"PingFang SC","Microsoft YaHei",sans-serif;font-size:13px;color:#1a2b3c';
    const hits = result.hits || [];
    const hard = hits.filter(h => h.interaction === 'block' || (h.interaction !== 'suggest' && h.nature === '明确违规'));
    const susp = hits.filter(h => !hard.includes(h));
    const countChip = (n, txt, bg) => n ? `<span style="background:${bg};color:#fff;font-size:11px;font-weight:800;padding:1px 8px;border-radius:20px">${txt} ${n}</span>` : '';
    const head = `<div style="padding:10px 14px;border-bottom:1px solid #edf1f6;display:flex;align-items:center;gap:8px">
      <b style="font-size:14px">🦅 鹰眼 · 开单事前提醒</b>
      ${countChip(hard.length, '明确违规', '#b91c1c')} ${countChip(susp.length, '可疑', '#d97706')}
      <span style="flex:1"></span>
      <a href="javascript:void(0)" id="yy-close" style="text-decoration:none;color:#7a8ba0;font-size:16px">×</a></div>`;
    let body;
    if (result.error) {
      body = `<div style="padding:20px 14px;text-align:center">
        <div style="font-size:15px;color:#b91c1c;font-weight:600">⚠ 事前预检未完成</div>
        <div style="font-size:12px;color:#5b6d82;margin-top:6px">${esc(result.error)}</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:8px">请确认鹰眼本地服务已启动并已刷新页面</div>
      </div>`;
    } else if (!hits.length) {
      body = `<div style="padding:20px 14px;text-align:center">
        <div style="font-size:15px;color:#0a7a4b;font-weight:600">🟩 合规放行</div>
        <div style="font-size:12px;color:#5b6d82;margin-top:6px">本次开单未命中任何事前提醒规则。已核 ${(result.checked_rules || []).length || result.checked_rules_count || '—'} 条事前规则。</div>
      </div>`;
    } else {
      const section = (title, arr, color) => arr.length
        ? `<div style="padding:6px 14px;background:#f8fafc;font-size:12px;font-weight:700;color:${color};border-bottom:1px solid #edf1f6">${title} · ${arr.length}</div>` + arr.map(hitCard).join('')
        : '';
      body = section('🟥 阻断（政策限定类，请核对后再开立）', hard, '#b91c1c')
           + section('🟨 建议（医疗合理类，可继续开立但请确认）', susp, '#a15c00');
    }
    // 闭环:有命中时给医生处置动作(采纳整改 / 坚持提交+理由),写入事前台账
    const actions = hits.length ? `<div id="yy-actions" style="padding:10px 14px;border-top:1px solid #edf1f6;display:flex;gap:8px;align-items:center">
        <button id="yy-heed" style="flex:1;padding:7px;border:0;border-radius:6px;background:#0a7a4b;color:#fff;font-size:12px;font-weight:700;cursor:pointer">✓ 采纳建议·整改(消灭在萌芽)</button>
        <button id="yy-override" style="padding:7px 10px;border:1px solid #d0a800;border-radius:6px;background:#fffbe6;color:#8a6d00;font-size:12px;cursor:pointer">⚠ 坚持提交</button>
      </div>` : '';
    const foot = `<div style="padding:8px 14px;font-size:11px;color:#8a99ab;border-top:1px solid #edf1f6">${esc(result.engine || '确定性规则·毫秒级')} · 本地运行,数据不出机 · 依据国家医保两库与相关号令 · 违规消除在"萌芽"</div>`;
    box.innerHTML = head + body + actions + foot;
    document.body.appendChild(box);
    box.querySelector('#yy-close').onclick = () => box.remove();
    wireActions(box, result, ctx);
  }

  // 事前台账:记录处置。ctx={patient, engineBase, scenario}
  async function logDisposition(ctx, result, action, reason) {
    try {
      await fetch((ctx.engineBase || '') + '/api/precheck/log', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: ctx.source || 'plugin', patient: ctx.patient, scenario: ctx.scenario || null, hits: result.hits || [], action, reason: reason || '' }),
      });
    } catch (_) { /* 台账写入失败不阻断 */ }
  }

  function wireActions(box, result, ctx) {
    const heed = box.querySelector('#yy-heed');
    const override = box.querySelector('#yy-override');
    if (heed) heed.onclick = async () => {
      heed.disabled = true; if (override) override.disabled = true; // 防 await 期间连点重复写台账
      // 整改留痕:记录撤销/改开了哪些医嘱行(整改=撤单/改开,非删数据蒙混)
      const corr = '整改:撤销/改开 ' + (result.hits || []).length + ' 条命中医嘱(' + (result.hits || []).map(h => h.rule_id).join('/') + ')';
      await logDisposition(ctx, result, 'heeded', corr);
      if (typeof window.__yingyanOnHeed === 'function') { try { window.__yingyanOnHeed(result.hits || []); } catch (_) {} } // 让靶站移除标注行(整改可见)
      // 整改验证闭环:移除标注行后自动重新审方,翻绿放行(开单场景 reCheck=再抓表单重审)
      box.querySelector('#yy-actions').outerHTML = '<div id="yy-recheck" style="padding:14px;text-align:center;color:#0a7a4b;font-weight:600">🟩 已采纳整改 · 正在重新审方…</div>';
      await new Promise(r => setTimeout(r, 500)); // 等靶站移除标注行的淡出动画(≈400ms)完成,再抓表单重校验
      let fresh = null;
      try { fresh = await run({ engineBase: ctx.engineBase, source: ctx.source, scenario: ctx.scenario, silent: true }); } catch (_) {}
      const slot = box.querySelector('#yy-recheck');
      if (slot) {
        const remain = (fresh && (fresh.hits || []).length) || 0;
        if (fresh && !remain) slot.innerHTML = '🟩 已整改 · 重新审方通过 · 违规消灭在萌芽<div style="font-size:11px;color:#5b6d82;font-weight:400;margin-top:4px">监管侧少处理一条 · 已计入院端看板 · 可提交医嘱</div>';
        else if (remain) {
          // 诚实:重校验仍有命中,不谎报"已整改"——把新结果重新弹出让医生继续处理或坚持提交
          slot.outerHTML = '';
          showOverlay(fresh, ctx);
        } else slot.innerHTML = '已记录采纳(重校验未完成,请手动复核后再提交)';
      }
    };
    if (override) override.onclick = () => {
      const wrap = box.querySelector('#yy-actions');
      wrap.innerHTML = `<div style="width:100%">
        <div style="font-size:12px;color:#8a6d00;margin-bottom:6px">坚持提交需记录理由(将进入监管重点审核):</div>
        <select id="yy-reason" style="width:100%;padding:6px;border:1px solid #d0a800;border-radius:5px;font-size:12px;margin-bottom:6px">
          <option value="临床确有必要,已知情告知">临床确有必要,已知情告知</option>
          <option value="外院已有检测/评估结果,待补录">外院已有检测/评估结果,待补录</option>
          <option value="患者要求且自费部分已说明">患者要求且自费部分已说明</option>
          <option value="其他(见病历记录)">其他(见病历记录)</option>
        </select>
        <button id="yy-override-confirm" style="width:100%;padding:7px;border:0;border-radius:6px;background:#b45309;color:#fff;font-size:12px;font-weight:700;cursor:pointer">确认坚持提交并记录</button>
      </div>`;
      box.querySelector('#yy-override-confirm').onclick = async (e) => {
        e.target.disabled = true; // 防连点重复写台账
        const reason = box.querySelector('#yy-reason').value;
        await logDisposition(ctx, result, 'overridden', reason);
        wrap.outerHTML = '<div style="padding:14px;text-align:center;color:#b45309;font-weight:600">⚠ 已记录:开单时已提醒·未遵从<div style="font-size:11px;color:#5b6d82;font-weight:400;margin-top:4px">该单已进入监管侧重点审核队列(事中/事后)· 理由随附</div></div>';
      };
    };
  }

  async function run(opts = {}) {
    const engineBase = opts.engineBase ?? 'http://localhost:3700';
    const patient = scrapePatient();
    const payload = { patient, items: scrapeOrders() };
    const ctx = { patient, engineBase, source: opts.source || 'plugin', scenario: opts.scenario || null };
    try {
      const r = await fetch(engineBase + '/api/precheck', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (j.error || !r.ok) {
        const msg = j.error || ('HTTP ' + r.status);
        if (opts.silent) return { hits: [], error: msg };
        showOverlay({ hits: [], error: msg, engine: '事前预检异常: ' + msg }, ctx);
        return { hits: [], error: msg };
      }
      // silent(整改验证重校验):只返回结果,不重弹浮层、不写台账(由 heed 流程更新原浮层 slot)
      if (opts.silent) return j;
      // opts.showClean===false 时,合规(无命中)不弹绿浮层(设置项);有命中始终弹
      if (!(opts.showClean === false && (j.hits || []).length === 0)) showOverlay(j, ctx);
      else if ((j.hits || []).length === 0) logDisposition(ctx, j, 'no_hit'); // 关了绿浮层时仍记合规审方一笔(no_hit 不计入遵从率分母,仅留痕)
      return j;
    } catch (e) {
      if (opts.silent) return null;
      const msg = '引擎未连接(' + e.message + ')——请确认鹰眼本地服务已启动';
      showOverlay({ hits: [], error: msg, engine: msg }, ctx);
      return { hits: [], error: msg };
    }
  }

  window.YingyanPrecheck = { run, scrapePatient, scrapeOrders };
})();
