'use strict';

/**
 * E3 一键稽核报告(领导版)——批量筛查结果自动成文
 * "不可能人一条一条去看,怎么形成一个报告""最终形成的报告肯定要报告领导"
 * 结构:结论先行 → 三档分档统计(Q4口径) → 风险画像TOP → 重点案卷TOP → 违规类型汇总
 *      → 处置建议汇总 → 政策依据附录(可溯源)
 */

const { activeFindings } = require('./priority-score');
const { findingNature, caseNature, NATURE } = require('./nature');
const { groupFindings } = require('./violation-report');

const fmt = (n) => Number(n || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });

function buildLeaderReport({ store, casesMap, caseIds, examMode = false, topN = 10 }) {
  const ids = caseIds?.length ? caseIds : Object.keys(store.cases || {});
  const rows = [];
  const allFindings = [];
  for (const id of ids) {
    const c = store.cases[id];
    if (!c) continue;
    const rec = casesMap[id];
    const findings = c.findings_cache || [];
    const active = activeFindings(findings);
    for (const f of active) {
      allFindings.push({ ...f, nature: findingNature(f), _dept: c.dept || rec?.front_page?.admit_dept, _doctor: c.doctor, _case_id: id });
    }
    rows.push({
      case_id: id,
      case_title: c.case_title || rec?.case_meta?.case_title || id,
      dept: c.dept || rec?.front_page?.admit_dept || '—',
      doctor: c.doctor || '—',
      nature: caseNature(findings),
      suspected_count: active.filter(f => f.status === '疑点').length,
      clue_count: active.filter(f => f.status === '线索').length,
      amount: active.reduce((s, f) => s + (Number(f.amount_involved) || 0), 0),
      top_violation: [...active].sort((a, b) => (b.amount_involved || 0) - (a.amount_involved || 0))[0] || null,
    });
  }

  // 三档统计(案卷级)
  const byNature = { [NATURE.HARD]: [], [NATURE.SUSPECT]: [], [NATURE.CLEAN]: [] };
  for (const r of rows) (byNature[r.nature] || byNature[NATURE.SUSPECT]).push(r);
  const natureStats = Object.entries(byNature).map(([nature, list]) => ({
    nature, case_count: list.length, amount: list.reduce((s, r) => s + r.amount, 0),
  }));

  // 风险画像:科室/医生按暴露金额与案数
  const byKey = (key) => {
    const m = new Map();
    for (const r of rows) {
      if (r.nature === NATURE.CLEAN) continue;
      const k = r[key] || '—';
      const cur = m.get(k) || { name: k, case_count: 0, amount: 0 };
      cur.case_count += 1; cur.amount += r.amount;
      m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => b.amount - a.amount).slice(0, 5);
  };

  const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
  const violationGroups = groupFindings(allFindings, 'violation_type');

  // 处置建议汇总(按违规性质)
  const disposal = { 移交线索: 0, 责令退回: 0, 复核待定: 0 };
  let disposalAmount = { 移交线索: 0, 责令退回: 0, 复核待定: 0 };
  for (const f of allFindings) {
    const n = f.violation_nature;
    const bucket = n === '主观嫌疑' ? '移交线索' : n === '非主观差错' ? '责令退回' : '复核待定';
    disposal[bucket] += 1;
    disposalAmount[bucket] += Number(f.amount_involved) || 0;
  }

  // 政策依据附录(去重,可溯源)
  const policyRefs = new Map();
  for (const f of allFindings) {
    for (const pRef of (f.policy || [])) {
      if (pRef.ref && !policyRefs.has(pRef.ref)) policyRefs.set(pRef.ref, (pRef.text || '').slice(0, 100));
    }
  }

  const hardRows = byNature[NATURE.HARD];
  const topCases = rows.filter(r => r.nature !== NATURE.CLEAN).sort((a, b) => b.amount - a.amount).slice(0, topN);

  return {
    generated_at: new Date().toISOString(),
    exam_mode: examMode,
    scope: { case_count: rows.length, source: caseIds?.length ? '指定案卷' : '全部在库案卷' },
    conclusion: {
      total_cases: rows.length,
      flagged_cases: rows.length - byNature[NATURE.CLEAN].length,
      hard_cases: hardRows.length,
      total_amount: totalAmount,
      hard_amount: hardRows.reduce((s, r) => s + r.amount, 0),
      top_violation_type: violationGroups[0]?.key || '—',
    },
    nature_stats: natureStats,
    top_depts: byKey('dept'),
    top_doctors: byKey('doctor'),
    top_cases: topCases,
    violation_groups: violationGroups.map(g => ({ type: g.key, count: g.count, amount: g.amount })),
    disposal_summary: Object.keys(disposal).map(k => ({ action: k, count: disposal[k], amount: disposalAmount[k] })),
    policy_appendix: [...policyRefs.entries()].map(([ref, text]) => ({ ref, text })),
  };
}

function renderLeaderReportMarkdown(rep) {
  const c = rep.conclusion;
  const dateStr = rep.generated_at.slice(0, 10);
  const title = rep.exam_mode ? '院端自查情况报告(呈院领导)' : '医保基金智能审核情况报告(呈局领导)';
  const L = [
    `# ${title}`,
    '',
    `> 鹰眼审核引擎自动生成 · ${dateStr} · 覆盖${rep.scope.source} ${c.total_cases} 份`,
    '',
    '## 一、总体结论',
    '',
    `本次智能审核覆盖结算案卷 **${c.total_cases}** 份,检出存在问题案卷 **${c.flagged_cases}** 份,` +
    `其中**明确违规 ${c.hard_cases} 份**(规则运行结果可直接认定,涉及金额 **¥${fmt(c.hard_amount)}**)、` +
    `可疑待合议 ${c.flagged_cases - c.hard_cases} 份。全部问题涉及${rep.exam_mode ? '飞检暴露' : '基金'}金额合计 **¥${fmt(c.total_amount)}**。` +
    `占比最高的违规类型为「${c.top_violation_type}」。`,
    '',
    '## 二、三档分档统计(对齐两库规则运行结果口径)',
    '',
    '| 档位 | 案卷数 | 涉及金额 |',
    '|---|---:|---:|',
    ...rep.nature_stats.map(n => `| ${n.nature} | ${n.case_count} | ¥${fmt(n.amount)} |`),
    '',
    '## 三、风险集中度(TOP)',
    '',
    '**科室维度**',
    '',
    '| 科室 | 问题案卷 | 涉及金额 |',
    '|---|---:|---:|',
    ...rep.top_depts.map(d => `| ${d.name} | ${d.case_count} | ¥${fmt(d.amount)} |`),
    '',
    '**医生维度**',
    '',
    '| 医生 | 问题案卷 | 涉及金额 |',
    '|---|---:|---:|',
    ...rep.top_doctors.map(d => `| ${d.name} | ${d.case_count} | ¥${fmt(d.amount)} |`),
    '',
    `## 四、重点案卷(按金额 TOP${rep.top_cases.length})`,
    '',
    '| 案卷 | 科室 | 定档 | 疑点/线索 | 涉及金额 | 首要问题 |',
    '|---|---|---|---:|---:|---|',
    ...rep.top_cases.map(r => `| ${r.case_title} | ${r.dept} | ${r.nature} | ${r.suspected_count}/${r.clue_count} | ¥${fmt(r.amount)} | ${r.top_violation?.violation_type || '—'} |`),
    '',
    '## 五、违规类型汇总',
    '',
    '| 违规类型(官方术语) | 违规点数 | 涉及金额 |',
    '|---|---:|---:|',
    ...rep.violation_groups.map(g => `| ${g.type} | ${g.count} | ¥${fmt(g.amount)} |`),
    '',
    '## 六、处置建议',
    '',
    '| 建议处置 | 违规点数 | 涉及金额 |',
    '|---|---:|---:|',
    ...rep.disposal_summary.map(d => `| ${d.action} | ${d.count} | ¥${fmt(d.amount)} |`),
    '',
    rep.exam_mode
      ? '建议:明确违规项在飞检前主动整改并退回;可疑项补全材料后复核;整改留痕已由系统快照,可供对质。'
      : '建议:明确违规档移送稽核程序责令退回;主观嫌疑线索移交行政执法;可疑档进入合议/申诉流程,处理结果反哺规则库("成熟一条、应用一条")。',
    '',
    '## 附录:政策依据清单(每条结论可溯源)',
    '',
    ...rep.policy_appendix.slice(0, 30).map(p => `- **${p.ref}**${p.text ? ':' + p.text : ''}`),
    '',
    `> 本报告由确定性规则引擎(L1)与多Agent合议(L2)共同产出;疑点均带三要素证据链(证据定位/条款原文/推理过程),明细可在工作台逐条核验。`,
  ];
  return L.join('\n');
}

module.exports = { buildLeaderReport, renderLeaderReportMarkdown };
