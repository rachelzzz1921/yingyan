/**
 * 控辩裁对抗记录 — 结构化渲染（兼容旧版扁平 text）
 */
(function (global) {
  const STANCE_LABEL = {
    '立论·指控书': '第一轮 · 提出指控',
    '立论·穷尽辩护': '第一轮 · 机构申诉',
    '质证': '第二轮 · 逐条反驳',
    '钢人复述+裁定': '第三轮 · 专家裁定',
    '降级': '降级 · 转人工',
  };

  const ROLE_LABEL = {
    '控方': '稽核方（控方）',
    '辩方': '机构方（辩方）',
    '裁判': '专家（裁判）',
  };

  function defaultEsc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /** 从旧版质证串解析：驳「目标」:理由;驳「…」 */
  function parseRebuttals(text) {
    if (!text || text === '无补充质证。') return [];
    const items = [];
    const re = /驳「([^」]+)」[:：]([\s\S]*?)(?=;?\s*驳「|$)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      items.push({ target: m[1].trim(), body: m[2].replace(/^;|;\s*$/g, '').trim() });
    }
    if (!items.length && text.trim()) items.push({ target: '综合反驳', body: text.trim() });
    return items;
  }

  /** 从旧版立论串解析：总述 + 分点(依据) */
  function parseOpeningLegacy(text) {
    if (!text) return { summary: '', items: [] };
    const parts = text.split(/;\s*/).map((p) => p.trim()).filter(Boolean);
    const items = [];
    let summary = '';
    parts.forEach((part, i) => {
      const m = part.match(/^(.+?)\(([^)]+)\)\s*$/);
      if (m) {
        items.push({ title: m[1].trim(), ref: m[2].trim(), body: '' });
        return;
      }
      if (i === 0) {
        const dot = part.match(/^(.+?[。！？])\s+([\s\S]+)$/);
        if (dot) {
          summary = dot[1].trim();
          const m2 = dot[2].match(/^(.+?)\(([^)]+)\)\s*$/);
          if (m2) items.push({ title: m2[1].trim(), ref: m2[2].trim(), body: '' });
          else summary = part;
        } else summary = part;
      }
    });
    return { summary, items };
  }

  function renderRebuttalItems(items, esc) {
    if (!items.length) return '<p class="exch-empty">本轮无补充反驳。</p>';
    return items.map(function (it) {
      return '<div class="reb-item">'
        + '<div class="reb-target">针对「' + esc(it.target) + '」</div>'
        + '<div class="reb-body">' + esc(it.body || it.text || '') + '</div>'
        + (it.ref ? '<div class="reb-ref">依据：' + esc(it.ref) + '</div>' : '')
        + '</div>';
    }).join('');
  }

  function renderOpeningItems(summary, items, esc) {
    var html = summary ? '<p class="exch-summary">' + esc(summary) + '</p>' : '';
    if (!items.length) return html || '<p class="exch-empty">—</p>';
    html += '<ul class="exch-points">';
    items.forEach(function (it) {
      html += '<li><span class="point-title">' + esc(it.title || it.claim || it.charge || it.target) + '</span>';
      if (it.body || it.text) html += '<span class="point-body">' + esc(it.body || it.text) + '</span>';
      if (it.ref || it.record_ref || it.policy_ref) {
        html += '<span class="point-ref">' + esc(it.ref || it.record_ref || it.policy_ref) + '</span>';
      }
      html += '</li>';
    });
    return html + '</ul>';
  }

  function renderVerdict(e, debate, esc) {
    var sm = e.steelman || (debate && debate.steelman) || {};
    var verdict = e.verdict || (debate && debate.verdict) || '';
    var reasoning = e.reasoning || (debate && debate.verdict_reason) || '';
    var partial = e.partial_detail || (debate && debate.partial_detail) || '';
    var html = '<div class="verdict-block">';
    if (sm.prosecution_strongest || sm.defense_strongest) {
      html += '<div class="steel-row">';
      if (sm.prosecution_strongest) {
        html += '<div class="steel-p"><span class="steel-tag">稽核方最强论点</span>' + esc(sm.prosecution_strongest) + '</div>';
      }
      if (sm.defense_strongest) {
        html += '<div class="steel-d"><span class="steel-tag">机构方最强论点</span>' + esc(sm.defense_strongest) + '</div>';
      }
      html += '</div>';
    }
    if (verdict) {
      html += '<div class="verdict-line"><span class="verdict-tag">裁定结论</span><b>' + esc(verdict) + '</b>';
      if (partial) html += ' <span class="verdict-partial">（' + esc(partial) + '）</span>';
      html += '</div>';
    }
    if (reasoning) html += '<p class="verdict-reasoning">' + esc(reasoning) + '</p>';
    html += '</div>';
    return html;
  }

  function getExchangeItems(e) {
    if (e.items && e.items.length) return e.items;
    if (e.kind === 'rebuttal' || (e.stance && e.stance.indexOf('质证') >= 0)) {
      return parseRebuttals(e.text);
    }
    return null;
  }

  function renderExchangeBody(e, debate, escFn) {
    var esc = escFn || defaultEsc;
    if (e.kind === 'verdict' || (e.role === '裁判' && e.stance && e.stance.indexOf('裁定') >= 0)) {
      return renderVerdict(e, debate, esc);
    }
    if (e.kind === 'opening' || (e.stance && e.stance.indexOf('立论') >= 0)) {
      var items = e.items || [];
      var summary = e.summary || '';
      if (!items.length && e.text) {
        var parsed = parseOpeningLegacy(e.text);
        summary = summary || parsed.summary;
        items = parsed.items;
      }
      return renderOpeningItems(summary, items, esc);
    }
    if (e.kind === 'rebuttal' || (e.stance && e.stance.indexOf('质证') >= 0)) {
      return renderRebuttalItems(getExchangeItems(e) || [], esc);
    }
    if (/驳「/.test(e.text || '')) return renderRebuttalItems(parseRebuttals(e.text), esc);
    if (e.role === '裁判') return renderVerdict({ text: e.text }, debate, esc);
    var open = parseOpeningLegacy(e.text || '');
    if (open.items.length) return renderOpeningItems(open.summary, open.items, esc);
    return '<p class="exch-plain">' + esc(e.text || '—') + '</p>';
  }

  function stanceLabel(stance) {
    return STANCE_LABEL[stance] || stance;
  }

  function roleLabel(role) {
    return ROLE_LABEL[role] || role;
  }

  global.DebateFormat = {
    STANCE_LABEL: STANCE_LABEL,
    ROLE_LABEL: ROLE_LABEL,
    stanceLabel: stanceLabel,
    roleLabel: roleLabel,
    renderExchangeBody: renderExchangeBody,
    renderExchangesHtml: function (debate, escFn, opts) {
      var esc = escFn || defaultEsc;
      opts = opts || {};
      var roleClass = opts.roleClass || function () { return ''; };
      return (debate.exchanges || []).map(function (e) {
        var cls = roleClass(e.role) || '';
        var roleLbl = roleLabel(e.role);
        var stanceLbl = stanceLabel(e.stance);
        var body = renderExchangeBody(e, debate, esc);
        return '<div class="yy-debate-exch ' + cls + '">'
          + '<div class="yy-debate-role">' + esc(roleLbl) + (stanceLbl ? ' · ' + esc(stanceLbl) : '') + '</div>'
          + '<div class="yy-debate-body">' + body + '</div></div>';
      }).join('');
    },
    renderDebateSummary: function (debate, escFn) {
      var esc = escFn || defaultEsc;
      if (!debate || !debate.enabled) return '';
      var sm = debate.steelman || {};
      var html = '';
      if (debate.verdict) {
        html += '<div style="margin-bottom:8px;font-size:12.5px"><b style="color:#5b3a9e">裁定 · ' + esc(debate.verdict) + '</b>';
        if (debate.score != null) html += ' · 评分 <b>' + esc(String(debate.score)) + '</b>';
        html += '</div>';
      }
      if (sm.prosecution_strongest || sm.defense_strongest) {
        html += '<div style="font-size:11.5px;line-height:1.55;margin-bottom:8px">';
        if (sm.prosecution_strongest) html += '<div style="padding:5px 8px;background:#fdf1f0;border-radius:6px;margin-bottom:4px"><span style="font-weight:800;color:#9a2c22">稽核方</span> ' + esc(sm.prosecution_strongest) + '</div>';
        if (sm.defense_strongest) html += '<div style="padding:5px 8px;background:#f0f6fd;border-radius:6px"><span style="font-weight:800;color:#0E7568">机构方</span> ' + esc(sm.defense_strongest) + '</div>';
        html += '</div>';
      }
      return html;
    },
    parseRebuttals: parseRebuttals,
  };
})(typeof window !== 'undefined' ? window : global);
