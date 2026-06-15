// report.js — 从真实结果 JSON 生成 markdown 表格(数字全部来自真跑,绝不手填)。
// 用法: node report.js --in baseline_lowtemp.json [--p5 p5_swap.json] --out ../results/report_tables.md
'use strict';
const fs = require('fs');
const path = require('path');
function arg(n, d) { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; }

const RES = path.join(__dirname, '..', 'results');
function load(f) { return JSON.parse(fs.readFileSync(path.isAbsolute(f) ? f : path.join(RES, f), 'utf8')); }

function rate(o) { return o && o.total ? `${o.pass}/${o.total}` : 'N/A'; }

function promptTables(data) {
  let md = '';
  for (const [pid, pinfo] of Object.entries(data.prompts || {})) {
    md += `\n#### ${pid}  (\`${pinfo.promptFile}\`${pinfo.usedV7 ? ' **[v7]**' : ''})\n\n`;
    md += `| 用例 | 严重度 | 模型 | JSON合规 | 全绿(全部断言通过) | 失败断言(通过率<1) |\n`;
    md += `|---|---|---|---|---|---|\n`;
    for (const c of pinfo.cases) {
      for (const bm of c.byModel) {
        const fails = Object.entries(bm.perAssert || {})
          .filter(([, v]) => v.rate < 1)
          .map(([k, v]) => `\`${k}\` ${v.pass}/${v.total}`)
          .join('; ') || '—';
        md += `| ${c.id} | ${c.severity || ''} | ${bm.model} | ${rate(bm.json_valid)} | ${rate(bm.all_green)} | ${fails} |\n`;
      }
    }
  }
  return md;
}

function p5Tables(p5) {
  let md = `\n#### P5 位置交换 + 异源裁判\n\n`;
  md += `prompt=\`${p5.prompt}\`${p5.useV7 ? ' **[v7]**' : ''}, N=${p5.N}, temp=${p5.temperature}, judges=${(p5.judges || []).join(' / ')}\n\n`;
  md += `| 用例 | 严重度 | 裁判模型 | order1分布 | order2分布 | 位置一致(多数) | 逐rep一致率 | 裁决(期望) | 自报一致率 | JSON |\n`;
  md += `|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const c of p5.cases) {
    for (const pj of c.perJudge) {
      const corr = pj.correct === null ? '' : (pj.correct ? '✓' : '✗');
      md += `| ${c.id} | ${c.severity || ''} | ${pj.model} | ${JSON.stringify(pj.order1)} | ${JSON.stringify(pj.order2)} | ${pj.swap_consistent_majority ? '✓' : '✗'} | ${pj.per_rep_consistency_rate} | ${pj.verdict_majority}${pj.expect_verdict ? `(${pj.expect_verdict}${corr})` : ''} | ${pj.self_claim_consistent_rate} | ${pj.json_valid} |\n`;
    }
  }
  md += `\n**汇总(位置一致率)**:\n`;
  for (const k of Object.keys(p5)) {
    if (k.startsWith('summary_')) {
      const s = p5[k];
      md += `- ${k.replace('summary_', '')}: 位置一致率(多数)=**${s.position_consistency_majority}**, 逐rep平均=${s.position_consistency_perrep}, 裁决正确=${s.verdict_correct}\n`;
    }
  }
  return md;
}

const inFile = arg('in', null);
const p5File = arg('p5', null);
let md = `<!-- 本文件由 report.js 从真实结果 JSON 自动生成,数字均来自真跑 -->\n`;
if (inFile) {
  const d = load(inFile);
  md += `\n### 回归结果(${inFile})\n模型: ${(d.models || []).join(', ')} | N=${d.N} | temp=${d.temperature} | 起止: ${d.startedAt} → ${d.finishedAt}\n`;
  md += `调用统计: ${JSON.stringify(d.callStats)}\n`;
  md += promptTables(d);
}
if (p5File) { md += p5Tables(load(p5File)); }
const outFile = arg('out', path.join(RES, 'report_tables.md'));
fs.writeFileSync(outFile, md);
console.log(`报告表格 → ${outFile}`);
