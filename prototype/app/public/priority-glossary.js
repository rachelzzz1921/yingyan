'use strict';
/** 稽核优先通路 · 中英术语与表头说明（priority.html + dashboard 共用） */
(function (global) {
  const GLOSSARY = [
    { term: 'api_score', zh: '综合优先指数', tip: '层内排序分。越高 = 越应优先飞检，不是案卷质量分。公式≈100×(EC·AMT·SEV)^(1/3)×历史命中×广度×离群×领域加权。' },
    { term: 'tier / 层级', zh: '硬分层', tip: 'tier1=含疑点（优先查）· tier2=仅线索 · 疑点永远排在线索前面。' },
    { term: 'shadow', zh: '规则观察期', tip: '新规则试运行命中：完整展示证据链，但不计入 api_score 与暴露金额。' },
    { term: 'EC', zh: '证据闭环度', tip: 'Evidence Closure · 三要素（证据+条款+推理）是否齐备。' },
    { term: 'AMT', zh: '暴露金额因子', tip: 'Amount · 案卷 active 疑点/线索涉及金额 S 的归一化权重。' },
    { term: 'SEV', zh: '罚则严重度', tip: 'Severity · 违规类型对应条例罚则档位；主观嫌疑会加权。' },
    { term: 'HistoryPrior', zh: '历史命中率', tip: '该患者/科室/医生过往稽核命中比例，画像加权。' },
    { term: 'Breadth', zh: '规则广度', tip: '同一案卷命中多少条不同规则，多规则叠加加权。' },
    { term: 'Outlier', zh: '金额离群', tip: '同科室案卷金额分布中的离群程度；特例单议已批准可抑制。' },
    { term: 'PII', zh: '个人隐私', tip: 'Personal Identifiable Information · 姓名/证件等，列表可脱敏。' },
    { term: 'DRG / DIP', zh: '支付方式画像', tip: 'DRG=诊断相关分组 · DIP 辅助目录=病案质量/再入院等辅助维度。' },
    { term: 'Top violation', zh: '首要违规点', tip: '该案卷 active findings 中对 api_score 贡献最大的违规类型。' },
  ];

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function scoreHeaderHtml() {
    const tip = GLOSSARY.find(g => g.term === 'api_score')?.tip || '';
    return `<th class="num pri-th-score" title="${esc(tip)}">
      <span class="pri-th-main">api_score</span>
      <span class="pri-th-hint">优先指数 · ↑越高越先查</span>
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
      `<dt><code>${esc(g.term)}</code></dt><dd><strong>${esc(g.zh)}</strong> — ${esc(g.tip)}</dd>`,
    ).join('');
    const lead = context === 'dashboard'
      ? '看板摘要：展示当前队首案卷与 KPI。完整筛选、批量入队请打开「稽核优先队列」页。悬停表头可查看英文字段含义。'
      : compact
        ? '本页在做什么：导入案卷 → 按风险排序 → 选队首入批量稽核。英文多为内部字段名，悬停表头可看说明。'
        : '事后飞检排序工具：先分 tier（疑点＞线索），再算 api_score 决定队首。下列术语可在表头悬停查看。';
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
      '【怎么读这个分】分越高 = 越应优先安排飞检，不代表案卷「考得差」。',
      '',
      `层级 tier ${row.tier}（${row.tier_label}）— 含疑点永远排在仅线索之前`,
      `api_score ${row.api_score} ≈ round(100 × core × 历史 × 广度 × 离群 × 领域)`,
      '',
      `EC 证据闭环度: ${b.ec} — 三要素是否齐备`,
      `AMT 暴露金额因子: ${b.amt} · 本案 S=¥${b.S}`,
      `SEV 罚则严重度: ${b.sev}`,
      `core 核心项(几何均值): ${b.core}`,
      '',
      `HistoryPrior 历史命中: ${b.hist_prior} · H=${b.H}`,
      `Breadth 规则广度: ${b.breadth} · 不同规则 ${b.distinct_rules} 条`,
      `Outlier 金额离群: ${b.outlier}${b.outlier_suppressed ? '（特例单议已抑制加分）' : ''}`,
      `Specialty 9大领域加权: ${b.specialty ?? 1}`,
      `risk_tags 重点领域: ${(row.risk_tags || []).join(', ') || '—'}`,
      `violation_nature 违规性质: ${row.violation_nature || '—'}`,
      `disposition 处置建议: ${row.disposition || '—'}`,
      '',
      `统计：疑点 ${row.suspected_count} · 线索 ${row.clue_count} · shadow ${row.shadow_count}（不计分）`,
      row.top_violation
        ? `首要违规：${row.top_violation.rule_id} · ${row.top_violation.violation_type} · ¥${row.top_violation.amount_involved}`
        : '',
    ].filter(Boolean).join('\n');
  }

  const CONFIG_HINTS = {
    W_CLUE: '线索在 core 中的权重（相对疑点）',
    AMT_CAP: '暴露金额归一化上限（元）',
    beta: 'HistoryPrior 历史命中 β',
    gamma: 'Breadth 规则广度 γ',
    delta: 'Outlier 离群 δ',
    R_REF: '广度参考规则数',
    specialty_weight: '命中9大重点领域时的加权系数',
    repeat_upgrade_threshold: '同科室同类违规重复次数≥此值 → 升级主观嫌疑',
  };

  global.PriorityUX = {
    GLOSSARY,
    esc,
    scoreHeaderHtml,
    thCol,
    thColNum,
    glossaryPanelHtml,
    formatBreakdownText,
    CONFIG_HINTS,
    scoreLegend: '排序：疑点层 > 线索层 → api_score 降序 · 分数高 = 飞检优先级高，非质量评分',
  };
})(typeof window !== 'undefined' ? window : globalThis);
