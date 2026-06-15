// failures.js — 从基线结果挑出所有"未全绿"(通过率<1)的(prompt,用例,模型),按严重度排,供失败驱动分析。
'use strict';
const fs = require('fs');
const path = require('path');
function arg(n, d) { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; }
const f = arg('in', 'baseline_lowtemp.json');
const d = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'results', f), 'utf8'));
const sevRank = { 'seed': 0, 'redteam': 1, 'redteam-new': 2 };
const rows = [];
for (const [pid, p] of Object.entries(d.prompts || {})) {
  for (const c of p.cases) {
    for (const bm of c.byModel) {
      const ag = bm.all_green, jv = bm.json_valid;
      const failing = Object.entries(bm.perAssert || {}).filter(([, v]) => v.rate < 1);
      if (ag.pass < ag.total || jv.pass < jv.total) {
        rows.push({ pid, id: c.id, sev: c.severity, model: bm.model, all_green: `${ag.pass}/${ag.total}`, json: `${jv.pass}/${jv.total}`,
          fails: failing.map(([k, v]) => `${k}=${v.pass}/${v.total}`).join(' ; '), desc: c.desc });
      }
    }
  }
}
rows.sort((a, b) => (sevRank[a.sev] ?? 9) - (sevRank[b.sev] ?? 9) || a.pid.localeCompare(b.pid));
console.log(`\n===== 未全绿汇总(${f}):${rows.length} 行 =====\n`);
for (const r of rows) {
  console.log(`[${r.pid}] ${r.id} (${r.sev}) — ${r.model}`);
  console.log(`    全绿 ${r.all_green}  JSON ${r.json}  失败: ${r.fails || '(仅JSON)'}`);
  console.log(`    ${r.desc}`);
}
// 按模型统计总体全绿率
console.log(`\n===== 各模型总体全绿率 =====`);
const byModel = {};
for (const [, p] of Object.entries(d.prompts || {})) for (const c of p.cases) for (const bm of c.byModel) {
  byModel[bm.model] = byModel[bm.model] || { green: 0, tot: 0, json: 0, jtot: 0 };
  byModel[bm.model].green += bm.all_green.pass; byModel[bm.model].tot += bm.all_green.total;
  byModel[bm.model].json += bm.json_valid.pass; byModel[bm.model].jtot += bm.json_valid.total;
}
for (const [m, s] of Object.entries(byModel)) console.log(`  ${m}: 全绿 ${s.green}/${s.tot} (${(100*s.green/s.tot).toFixed(0)}%)  JSON ${s.json}/${s.jtot} (${(100*s.json/s.jtot).toFixed(0)}%)`);
