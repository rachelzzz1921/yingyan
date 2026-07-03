'use strict';
/** 稽核优先队列 · 共享术语与归因说明（priority.html + dashboard 共用） */
(function (global) {
  const GLOSSARY = [
    { term: '优先指数', en: 'api_score', tip: '数值越高越应先安排稽核，不是质量评分。' },
    { term: '风险层', en: 'tier', tip: '有疑点的案卷永远排在仅线索的案卷前面。' },
    { term: '新规则试运行', en: 'shadow', tip: '试运行期间仅展示证据，不计分不计金额。' },
    { term: '零误报对照组', en: 'boundary', tip: '用于验证规则不误伤，不进入正式稽核队列。' },
    { term: '证据完整度', en: 'EC', tip: '证据、条款、推理三要素齐备程度。' },
    { term: '金额权重', en: 'AMT', tip: '本案疑点与线索涉及金额在排序中的权重。' },
    { term: '罚则严重度', en: 'SEV', tip: '违规类型对应的罚则档位；主观嫌疑会加权。' },
    { term: '历史命中加权', en: 'HistoryPrior', tip: '患者、科室、医生过往被查中的比例越高，加权越高。' },
    { term: '多规则加权', en: 'Breadth', tip: '同一案卷命中多条不同规则时提高优先级。' },
    { term: '金额离群加权', en: 'Outlier', tip: '金额在同科室分布中明显偏高时提高优先级。' },
    { term: '隐藏患者姓名', en: 'mask_pii', tip: '列表中隐藏患者姓名等敏感信息。' },
    { term: '主要问题', en: 'Top violation', tip: '该案卷中对优先指数贡献最大的违规类型。' },
  ];

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function scoreHeaderHtml() {
    const tip = GLOSSARY.find(g => g.en === 'api_score')?.tip || '';
    return `<th class="num pri-th-score" title="${esc(tip)}">
      <span class="pri-th-main">优先指数</span>
    </th>`;
  }

  function thCol(main, hint, title) {
    const t = title || hint || main;
    return `<th title="${esc(t)}"><span class="pri-th-main">${esc(main)}</span>${hint ? `<span class="pri-th-hint">${esc(hint)}</span>` : ''}</th>`;
  }

  function thColNum(main, hint, title) {
    const t = title || hint || main;
    return `<th class="num" title="${esc(t)}"><span class="pri-th-main">${esc(main)}</span>${hint ? `<span class="pri-th-hint">${esc(hint)}</span>` : ''}</th>`;
  }

  function glossaryPanelHtml(compact, context) {
    const items = GLOSSARY.map(g =>
      `<dt>${esc(g.term)} <code>${esc(g.en)}</code></dt><dd>${esc(g.tip)}</dd>`,
    ).join('');
    const lead = context === 'dashboard'
      ? '看板摘要：展示当前排序靠前案卷与关键指标。完整筛选、批量入队请打开「稽核优先队列」页。'
      : compact
        ? '本页把待查案卷按风险排好队，方便优先处理最值得核查的案卷。'
        : '先看风险层（有疑点 > 仅线索），再按优先指数从高到低排序。';
    const inner = `<details class="pri-glossary"${compact ? '' : ' open'}>
      <summary>这一页在干什么</summary>
      <p class="pri-glossary-lead">${lead}</p>
      <dl class="pri-glossary-list">${items}</dl>
    </details>`;
    return compact ? `<div class="pri-glossary-wrap card">${inner}</div>` : inner;
  }

  function formatBreakdownText(row) {
    const b = row.breakdown || {};
    return [
      '这个案卷为什么排在前面？',
      '',
      `优先指数 ${row.api_score ?? '—'} = 基础分 ${fmt(b.core_score ?? ((b.core || 0) * 100))} × 历史命中加权 ${fmt(b.hist_prior ?? 1)} × 多规则加权 ${fmt(b.breadth ?? 1)} × 金额离群加权 ${fmt(b.outlier ?? 1)} × 重点领域加权 ${fmt(b.specialty ?? 1)}`,
      '',
      '基础分由三项合成：',
      `· 证据完整度 ${fmt(b.ec)} —— 证据、条款、推理三要素齐备程度`,
      `· 金额权重 ${fmt(b.amt)} —— 本案涉及金额 ¥${num(b.S)}`,
      `· 罚则严重度 ${fmt(b.sev)} —— 违规类型对应的罚则档位`,
      '',
      '加权项：',
      `· 历史命中加权 ×${fmt(b.hist_prior ?? 1)} —— 患者/科室/医生历史命中情况`,
      `· 多规则加权 ×${fmt(b.breadth ?? 1)} —— 同案命中 ${b.distinct_rules ?? 0} 条不同规则`,
      `· 金额离群加权 ×${fmt(b.outlier ?? 1)}${b.outlier_suppressed ? ' —— 特例单议已抑制加分' : ' —— 金额在同科室中明显偏高时加权'}`,
      `· 重点领域加权 ×${fmt(b.specialty ?? 1)} —— ${(row.risk_tags || []).join('、') || '未命中重点领域'}`,
      row.violation_nature ? `违规性质：${row.violation_nature}` : '',
      row.disposition ? `处置建议：${row.disposition}` : '',
      `统计：疑点 ${row.suspected_count ?? 0} · 线索 ${row.clue_count ?? 0} · 新规则试运行 ${row.shadow_count ?? 0}（不计分）`,
      row.top_violation
        ? `主要问题：${row.top_violation.rule_id} · ${row.top_violation.violation_type} · ¥${num(row.top_violation.amount_involved)}`
        : '',
    ].filter(Boolean).join('\n');
  }

  function fmt(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return n >= 10 ? String(Math.round(n * 10) / 10) : String(Math.round(n * 100) / 100);
  }

  function num(v) {
    return Number(v || 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 });
  }

  function factorRow(name, value, note, max) {
    const n = Number(value);
    const pct = Number.isFinite(n) && max ? Math.max(6, Math.min(100, (n / max) * 100)) : 6;
    return `<div class="pri-bd-factor">
      <div class="pri-bd-factor-main"><strong>${esc(name)}</strong><span>${esc(fmt(value))}</span></div>
      <div class="pri-bd-factor-note">${esc(note)}</div>
      <div class="pri-bd-bar"><i style="width:${pct}%"></i></div>
    </div>`;
  }

  function formatBreakdownHtml(row) {
    const b = row.breakdown || {};
    const base = b.core_score ?? ((Number(b.core) || 0) * 100);
    const multipliers = [b.hist_prior ?? 1, b.breadth ?? 1, b.outlier ?? 1, b.specialty ?? 1].map(Number).filter(Number.isFinite);
    const maxFactor = Math.max(1, Number(b.hist_prior) || 1, Number(b.breadth) || 1, Number(b.outlier) || 1, Number(b.specialty) || 1);
    return `
      <div class="pri-breakdown">
        <div class="pri-bd-equation">
          <span>基础分 ${esc(fmt(base))}</span>
          <span>× 历史 ${esc(fmt(b.hist_prior ?? 1))}</span>
          <span>× 多规则 ${esc(fmt(b.breadth ?? 1))}</span>
          <span>× 离群 ${esc(fmt(b.outlier ?? 1))}</span>
          <span>× 领域 ${esc(fmt(b.specialty ?? 1))}</span>
          <b>= ${esc(fmt(row.api_score))}</b>
        </div>
        <div class="pri-bd-grid">
          ${factorRow('证据完整度', b.ec, '证据、条款、推理三要素齐备程度', 1)}
          ${factorRow('金额权重', b.amt, `本案涉及金额 ¥${num(b.S)}`, 1)}
          ${factorRow('罚则严重度', b.sev, '违规类型对应的罚则档位', 1)}
          ${factorRow('历史命中加权', b.hist_prior ?? 1, `历史命中参考值 ${fmt(b.H)}`, maxFactor)}
          ${factorRow('多规则加权', b.breadth ?? 1, `同案命中 ${b.distinct_rules ?? 0} 条不同规则`, maxFactor)}
          ${factorRow('金额离群加权', b.outlier ?? 1, b.outlier_suppressed ? '特例单议已抑制加分' : '金额在同科室中明显偏高时加权', maxFactor)}
        </div>
        <div class="pri-bd-foot">
          <span>风险层：${esc(row.tier === 1 ? '有疑点' : row.tier === 2 ? '仅线索' : '观察')}</span>
          <span>违规性质：${esc(row.violation_nature || '—')}</span>
          <span>疑点 ${esc(row.suspected_count ?? 0)} · 线索 ${esc(row.clue_count ?? 0)}</span>
        </div>
      </div>`;
  }

  const CONFIG_HINTS = {
    W_CLUE: '仅线索案卷在基础分中的相对权重',
    AMT_CAP: '金额权重归一化上限（元）',
    beta: '历史命中加权强度',
    gamma: '多规则加权强度',
    delta: '金额离群加权强度',
    R_REF: '广度参考规则数',
    specialty_weight: '命中重点领域时的加权系数',
    repeat_upgrade_threshold: '同科室同类违规重复次数达到该值后升级提示',
  };

  global.PriorityUX = {
    GLOSSARY,
    esc,
    scoreHeaderHtml,
    thCol,
    thColNum,
    glossaryPanelHtml,
    formatBreakdownText,
    formatBreakdownHtml,
    CONFIG_HINTS,
    scoreLegend: '排序规则：先看风险层（有疑点 > 仅线索），层内按优先指数从高到低。指数越高越该先查，不是质量评分。',
  };
})(typeof window !== 'undefined' ? window : globalThis);
