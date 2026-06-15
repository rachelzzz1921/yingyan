// metrics.js — 把 47 个用例归到 doc11/附录C 的 6 个命名指标,从真实结果 JSON 计算每指标×每模型真实通过率。
// 用法: node metrics.js --in v7_lowtemp.json [--p5 baseline_p5.json]
// 口径:某指标通过率 = 该指标涵盖用例的 Σ全绿pass / Σtotal(按模型分);JSON合规率用 json_valid。
'use strict';
const fs = require('fs');
const path = require('path');
function arg(n, d) { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; }
const RES = path.join(__dirname, '..', 'results');
function load(f) { return JSON.parse(fs.readFileSync(path.isAbsolute(f) ? f : path.join(RES, f), 'utf8')); }

// 指标 → 命中哪些 (prompt, caseId 前缀/全名) 列表。注入只取真正注入类用例。
const METRIC_CASES = {
  '注入捕获率': [['P1', ['P1-C1', 'P1-R1', 'P1-R2', 'P1-R4', 'P1-R7', 'P1-R8']]],
  '三态准确率(疑点/线索/不报)': [['P2', 'ALL'], ['P3', 'ALL']],
  '金额去重正确率': [['P6', 'ALL']],
  '误沉淀抵抗/治理正确率': [['P7', 'ALL']],
};
// JSON 合规率单独算(所有 prompt 所有用例)。位置交换一致率从 p5 文件取。

function collect(data, matcher) {
  // 返回 {model: {green, gtot, json, jtot}}
  const acc = {};
  for (const [pid, p] of Object.entries(data.prompts || {})) {
    for (const c of p.cases) {
      if (!matcher(pid, c.id)) continue;
      for (const bm of c.byModel) {
        acc[bm.model] = acc[bm.model] || { green: 0, gtot: 0, json: 0, jtot: 0 };
        acc[bm.model].green += bm.all_green.pass; acc[bm.model].gtot += bm.all_green.total;
        acc[bm.model].json += bm.json_valid.pass; acc[bm.model].jtot += bm.json_valid.total;
      }
    }
  }
  return acc;
}
const pct = (a, b) => b ? `${a}/${b} (${(100 * a / b).toFixed(0)}%)` : 'N/A';

const data = load(arg('in', 'v7_lowtemp.json'));
const models = data.models || [];
console.log(`\n# 指标汇总(${arg('in', 'v7_lowtemp.json')})  N=${data.N} temp=${data.temperature}\n`);

// JSON 合规率(全体)
const allAcc = collect(data, () => true);
console.log('## JSON 合规率(全部用例,按模型)');
for (const [m, s] of Object.entries(allAcc)) console.log(`- ${m}: ${pct(s.json, s.jtot)}`);

// 各命名指标(全绿率口径)
for (const [metric, specs] of Object.entries(METRIC_CASES)) {
  const matcher = (pid, id) => specs.some(([p, sel]) => p === pid && (sel === 'ALL' || sel.some(s => id.startsWith(s))));
  const acc = collect(data, matcher);
  console.log(`\n## ${metric}(全绿率,按模型)`);
  for (const [m, s] of Object.entries(acc)) console.log(`- ${m}: ${pct(s.green, s.gtot)}`);
}

// 位置交换一致率(从 p5 文件)
const p5f = arg('p5', null);
if (p5f && fs.existsSync(path.join(RES, p5f))) {
  const p5 = load(p5f);
  console.log(`\n## 位置交换一致率(P5,A/B双跑,${p5f})`);
  for (const k of Object.keys(p5)) if (k.startsWith('summary_')) {
    const s = p5[k];
    console.log(`- ${k.replace('summary_', '')}: 多数一致=${s.position_consistency_majority}, 逐rep=${s.position_consistency_perrep}, 裁决正确=${s.verdict_correct}`);
  }
  // 自报一致率 vs 实测(揭穿自报戏)
  console.log(`\n## P5 自报 position_swap_consistent vs 实测(按案)`);
  for (const c of p5.cases) for (const pj of c.perJudge) {
    console.log(`- ${c.id} (${pj.model}): 自报一致率=${pj.self_claim_consistent_rate}, 实测位置一致(多数)=${pj.swap_consistent_majority ? '✓' : '✗'}, 逐rep=${pj.per_rep_consistency_rate}`);
  }
}
