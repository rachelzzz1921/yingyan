/**
 * 鹰眼 · 事前处置组件(共享)
 * 三个角色触点(医生开单/编码员/结算员)复用同一套"三档结果 + 采纳整改/坚持提交 + 入台账"闭环 UI。
 * 医生开单走 yingyan-precheck.js(表单抓取版);编码员/结算员用本组件把 hits 渲染进指定容器。
 */
(function () {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  async function logDisposition(ctx, result, action, reason) {
    try {
      await fetch((ctx.engineBase || '') + '/api/precheck/log', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: ctx.source || 'plugin', patient: ctx.patient || {}, scenario: ctx.scenario || null, hits: result.hits || [], action, reason: reason || '' }),
      });
    } catch (_) { /* 台账失败不阻断 */ }
  }

  function hitCard(h) {
    const border = h.nature === '明确违规' ? '#b91c1c' : '#f59e0b';
    const pol = (h.policy || []).slice(0, 3).map(function (p) {
      const vc = String(p.verify_status || '').indexOf('已核') >= 0 ? '#0a7a4b' : '#a97a00';
      return '<div style="margin-top:4px;font-size:11.5px;color:#5b6d82;background:#f6f9fc;border-left:3px solid ' + border + ';padding:5px 8px">' + esc(p.ref) + (p.verify_status ? ' <span style="color:' + vc + '">' + esc(p.verify_status) + '</span>' : '') + (p.text ? '<br>' + esc(String(p.text).slice(0, 90)) : '') + '</div>';
    }).join('');
    const ev = (h.evidence || []).map(function (e) { return '<div style="font-size:12px;color:#3c4d61;margin-top:3px">· <b>' + esc(e.type) + '</b> ' + esc(e.text) + (e.loc ? ' <span style="color:#94a3b8;font-size:11px">[' + esc(e.loc) + ']</span>' : '') + '</div>'; }).join('');
    return '<div style="padding:10px 12px;border:1px solid #eef2f7;border-left:4px solid ' + border + ';border-radius:8px;margin-bottom:8px">'
      + '<div style="margin-bottom:4px"><span style="background:' + border + ';color:#fff;font-size:11px;font-weight:800;padding:1px 8px;border-radius:5px">' + esc(h.nature || '可疑') + '</span> <b>' + esc(h.rule_id) + ' ' + esc(h.rule_name) + '</b>' + (h.amount_involved ? ' <span style="color:#b91c1c;font-weight:700">涉及 ¥' + Number(h.amount_involved).toLocaleString() + '</span>' : '') + '</div>'
      + '<div style="color:#3c4d61;line-height:1.5">' + esc(h.reasoning) + '</div>' + ev
      + (pol ? '<details style="margin-top:5px"><summary style="font-size:11.5px;color:#4a7fb5;cursor:pointer">📖 依据 ' + (h.policy || []).length + ' 条 ›</summary>' + pol + '</details>' : '')
      + (h.disposal_suggestion ? '<div style="margin-top:5px;font-size:12px;color:#0a7a4b">✎ ' + esc(h.disposal_suggestion) + '</div>' : '') + '</div>';
  }

  // 把结果渲染进 mountEl,带采纳/坚持处置动作,写入事前台账。ctx={engineBase,source,patient,onHeed,heedLabel,overrideLabel}
  function renderDisposition(mountEl, result, ctx) {
    const el = typeof mountEl === 'string' ? document.querySelector(mountEl) : mountEl;
    if (!el) return;
    // 引擎报错(500/{error})不伪装成绿色"校验通过",也不写假 no_hit 台账
    if (!result || result.error) {
      el.innerHTML = '<div style="padding:14px;text-align:center;color:#b91c1c;font-weight:600;border:1px solid #fecaca;background:#fef2f2;border-radius:10px">⚠ 校验未完成:' + esc((result && result.error) || '引擎未连接') + '</div>';
      return;
    }
    const hits = result.hits || [];
    if (!hits.length) {
      el.innerHTML = '<div style="padding:16px;text-align:center;color:#0a7a4b;font-weight:600;border:1px solid #a7f3d0;background:#ecfdf5;border-radius:10px">🟩 校验通过 · 未命中事前提醒规则</div>';
      logDisposition(ctx, result, 'no_hit');
      return;
    }
    const hard = hits.filter(function (h) { return h.nature === '明确违规'; });
    const susp = hits.filter(function (h) { return h.nature !== '明确违规'; });
    const chip = function (n, t, bg) { return n ? '<span style="background:' + bg + ';color:#fff;font-size:11px;font-weight:800;padding:1px 8px;border-radius:20px;margin-right:6px">' + t + ' ' + n + '</span>' : ''; };
    el.innerHTML = '<div style="border:1px solid #d3dce6;border-radius:12px;overflow:hidden">'
      + '<div style="padding:9px 12px;background:#fff;border-bottom:1px solid #edf1f6"><b>🦅 鹰眼 · 事前校验</b> ' + chip(hard.length, '明确违规', '#b91c1c') + chip(susp.length, '可疑', '#d97706') + ' <span style="font-size:11px;color:#7a8ba0">' + esc(result.engine || '') + '</span></div>'
      + '<div style="padding:10px 12px;background:#fbfcfe">' + hits.map(hitCard).join('') + '</div>'
      + '<div id="yy-d-actions" style="padding:10px 12px;border-top:1px solid #edf1f6;display:flex;gap:8px"><button id="yy-d-heed" style="flex:1;padding:8px;border:0;border-radius:6px;background:#0a7a4b;color:#fff;font-weight:700;cursor:pointer">✓ ' + esc(ctx.heedLabel || '采纳建议·整改(消灭在萌芽)') + '</button><button id="yy-d-over" style="padding:8px 12px;border:1px solid #d0a800;border-radius:6px;background:#fffbe6;color:#8a6d00;cursor:pointer">⚠ ' + esc(ctx.overrideLabel || '坚持提交') + '</button></div>'
      + '</div>';
    const heed = el.querySelector('#yy-d-heed'); const over = el.querySelector('#yy-d-over');
    heed.onclick = async function () {
      heed.disabled = true; over.disabled = true;
      await logDisposition(ctx, result, 'heeded');
      if (typeof ctx.onHeed === 'function') { try { ctx.onHeed(hits); } catch (_) {} }
      // 整改验证闭环:提供 reCheck 时自动重校验,翻绿并放行提交;否则静态"已采纳"
      if (typeof ctx.reCheck === 'function') {
        el.querySelector('#yy-d-actions').outerHTML = '<div id="yy-d-recheck" style="padding:12px;text-align:center;color:#0a7a4b;font-weight:600">🟩 已采纳整改 · 正在重新校验…</div>';
        let fresh; try { fresh = await ctx.reCheck(); } catch (_) { fresh = null; }
        if (fresh && !fresh.error && !((fresh.hits || []).length)) {
          // 重校验通过:整个结果区替换为干净的"已整改·校验通过"态(命中卡消失,不矛盾)
          el.innerHTML = '<div style="border:1px solid #a7f3d0;background:#ecfdf5;border-radius:12px;padding:16px;text-align:center;color:#0a7a4b">'
            + '<div style="font-size:15px;font-weight:600">🟩 已整改 · 重新校验通过 · 违规消灭在萌芽</div>'
            + '<div style="font-size:12px;color:#5b6d82;margin-top:4px">监管侧少处理一条 · 已计入院端看板</div>'
            + (ctx.onSubmit ? '<button id="yy-d-submit" style="margin-top:10px;padding:8px 18px;border:0;border-radius:6px;background:#0a7a4b;color:#fff;font-weight:700;cursor:pointer">✅ ' + esc(ctx.submitLabel || '确认提交(已合规)') + '</button>' : '') + '</div>';
          const sb = el.querySelector('#yy-d-submit');
          if (sb) sb.onclick = function () { sb.disabled = true; if (typeof ctx.onSubmit === 'function') { try { ctx.onSubmit(); } catch (_) {} } sb.outerHTML = '<div style="margin-top:10px;color:#0a7a4b;font-weight:600">✓ 已提交 · 合规放行</div>'; };
        } else {
          renderDisposition(el, fresh || { hits: [] }, ctx); // 仍有命中→再来一轮整改
        }
        return;
      }
      el.querySelector('#yy-d-actions').outerHTML = '<div style="padding:12px;text-align:center;color:#0a7a4b;font-weight:600">🟩 已采纳整改 · 违规消灭在萌芽 <span style="font-size:11px;color:#5b6d82;font-weight:400">· 监管侧少处理一条 · 已计入院端看板</span></div>';
    };
    over.onclick = function () {
      const wrap = el.querySelector('#yy-d-actions');
      wrap.innerHTML = '<div style="width:100%"><div style="font-size:12px;color:#8a6d00;margin-bottom:6px">坚持提交需记录理由(将进入监管重点审核):</div>'
        + '<select id="yy-d-reason" style="width:100%;padding:6px;border:1px solid #d0a800;border-radius:5px;margin-bottom:6px"><option>临床/编码确有必要,已知情</option><option>外院已有检测/评估结果,待补录</option><option>病历另有支撑,以事后审核为准</option><option>其他(见记录)</option></select>'
        + '<button id="yy-d-oc" style="width:100%;padding:8px;border:0;border-radius:6px;background:#b45309;color:#fff;font-weight:700;cursor:pointer">确认坚持提交并记录</button></div>';
      el.querySelector('#yy-d-oc').onclick = async function (e) {
        e.target.disabled = true;
        await logDisposition(ctx, result, 'overridden', el.querySelector('#yy-d-reason').value);
        wrap.outerHTML = '<div style="padding:12px;text-align:center;color:#b45309;font-weight:600">⚠ 已记录:已提醒·未遵从 <span style="font-size:11px;color:#5b6d82;font-weight:400">· 该单进入监管侧重点审核预警台账 · 理由随附</span></div>';
      };
    };
  }

  window.YingyanDisposition = { renderDisposition, logDisposition };
})();
