'use strict';

const { activeFindings } = require('./priority-score');

function groupFindings(allFindings, groupBy) {
  const active = activeFindings(allFindings);
  const map = new Map();
  for (const f of active) {
    let key;
    if (groupBy === 'nature') key = f.violation_nature || '待定';
    else if (groupBy === 'dept') key = f._dept || '未分类科室';
    else key = f.violation_type || f.rule_id || '其他';
    const row = map.get(key) || { key, findings: [], count: 0, amount: 0 };
    row.findings.push(f);
    row.count += 1;
    row.amount += Number(f.amount_involved) || 0;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

function buildViolationSummary({ casesMap, store, caseIds, groupBy = 'violation_type', examMode = false }) {
  const ids = caseIds?.length ? caseIds : Object.keys(store.cases);
  const allFindings = [];
  for (const id of ids) {
    const c = store.cases[id];
    const rec = casesMap[id];
    const dept = c?.dept || rec?.front_page?.admit_dept;
    for (const f of c?.findings_cache || []) {
      allFindings.push({ ...f, _dept: dept, _case_id: id });
    }
  }

  const groups = groupFindings(allFindings, groupBy);
  const amtLabel = examMode ? '飞检暴露金额' : '违规涉及金额';
  const pointLabel = examMode ? '风险点' : '违规点';

  const recognitionTable = groups.map(g => ({
    violation_group: g.key,
    point_label: pointLabel,
    count: g.count,
    amount: Math.round(g.amount * 100) / 100,
    amount_label: amtLabel,
    findings: g.findings.map(f => ({
      finding_id: f.finding_id,
      case_id: f._case_id,
      rule_id: f.rule_id,
      status: f.status,
      violation_nature: f.violation_nature,
      amount_involved: f.amount_involved,
      policy_refs: (f.policy || []).map(p => p.ref),
    })),
    basis: g.findings[0]?.policy?.[0]?.text?.slice(0, 120) || '',
  }));

  const totalAmount = groups.reduce((s, g) => s + g.amount, 0);
  const byNature = groupFindings(allFindings, 'nature');

  return {
    generated_at: new Date().toISOString(),
    group_by: groupBy,
    exam_mode: examMode,
    tables: {
      violation_recognition: recognitionTable,
      fee_statistics: recognitionTable.map(r => ({
        违规点: r.violation_group,
        数量: r.count,
        [amtLabel]: r.amount,
        合计: r.amount,
      })),
      summary: {
        total_points: groups.reduce((s, g) => s + g.count, 0),
        total_amount: Math.round(totalAmount * 100) / 100,
        by_nature: byNature.map(n => ({
          nature: n.key,
          count: n.count,
          amount: Math.round(n.amount * 100) / 100,
        })),
        shadow_excluded: true,
      },
    },
  };
}

function renderSummaryMarkdown(report) {
  const L = ['# 鹰眼 · 违规点认定与费用统计', '', `生成: ${report.generated_at} · group_by=${report.group_by}`, ''];
  L.push('## 违规点认定材料');
  for (const r of report.tables.violation_recognition) {
    L.push(`### ${r.violation_group}`, `- 数量: ${r.count} · 金额: ¥${r.amount}`, `- 依据: ${r.basis}`, '');
  }
  L.push('## 汇总', `- 总点数: ${report.tables.summary.total_points}`, `- 总金额: ¥${report.tables.summary.total_amount}`);
  return L.join('\n');
}

module.exports = { buildViolationSummary, renderSummaryMarkdown, groupFindings };
