// p5_swap_runner.js — P5 裁判专用:A/B 位置交换双跑 + 异源裁判 + 位置一致率。
// 这是 promptfoo 单条测难表达的(要跨两次调用比对),按任务 §5 独立脚本实现。
'use strict';
const fs = require('fs');
const path = require('path');
const { callModel, stats, MODELS } = require('./providers');
const lib = require('./lib');

function arg(name, def) { const i = process.argv.indexOf(`--${name}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def; }
function flag(name) { return process.argv.includes(`--${name}`); }

const N = parseInt(arg('n', '5'), 10);
const TEMP = parseFloat(arg('temp', '0.1'));        // 裁判低温求一致性
const JUDGES = arg('judges', 'judge').split(',').map(s => s.trim()).map(k => MODELS[k] || k);
const USE_V7 = flag('v7');
const CONC = parseInt(arg('conc', '5'), 10);

function promptFile() {
  if (USE_V7 && fs.existsSync(path.join(lib.PROMPT_DIR_V7, 'P5_judge_v7.txt'))) return { dir: lib.PROMPT_DIR_V7, file: 'P5_judge_v7.txt', v7: true };
  return { dir: lib.PROMPT_DIR, file: 'P5_judge_v6.txt', v7: false };
}

function mode(arr) {
  const m = {}; arr.forEach(x => m[x] = (m[x] || 0) + 1);
  let best = null, bc = -1; for (const [k, v] of Object.entries(m)) if (v > bc) { best = k; bc = v; }
  return { best, counts: m };
}

async function judgeOrder(tpl, common, facts, argA, argB, model) {
  const prompt = lib.fillTemplate(tpl, { ...common, arg_A: argA, arg_B: argB, facts });
  const reps = await lib.pMap(Array.from({ length: N }, (_, i) => i), async (rep) => {
    const res = await callModel({ model, prompt, temperature: TEMP, rep });
    const j = lib.extractJson(res.text);
    return {
      verdict: lib.normVerdict(j && j.verdict),
      rawVerdict: j && j.verdict,
      self_claim: j ? j.position_swap_consistent : null,
      factual_conflict: j ? j.factual_conflict : null,
      json_ok: j != null, ok: res.ok, cached: res.cached,
    };
  }, CONC);
  return reps;
}

(async () => {
  const { dir, file, v7 } = promptFile();
  const tpl = fs.readFileSync(path.join(dir, file), 'utf8');
  const cf = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases', 'P5.json'), 'utf8'));
  const common = cf.commonVars || {};
  const out = { startedAt: new Date().toISOString(), prompt: file, useV7: v7, N, temperature: TEMP, judges: JUDGES, cases: [] };

  console.log(`\n===== P5 位置交换 (prompt=${file}${v7 ? ' [V7]' : ''}, judges=${JUDGES.join('/')}, N=${N}, temp=${TEMP}) =====`);
  for (const c of cf.cases) {
    const facts = c.vars.facts;
    const perJudge = [];
    for (const model of JUDGES) {
      // order1: A=控方 B=辩方 ; order2: A=辩方 B=控方
      const o1 = await judgeOrder(tpl, common, facts, c.prosecution, c.defense, model);
      const o2 = await judgeOrder(tpl, common, facts, c.defense, c.prosecution, model);
      const v1 = o1.map(r => r.verdict), v2 = o2.map(r => r.verdict);
      const m1 = mode(v1), m2 = mode(v2);
      const swapConsistentMajority = m1.best === m2.best && m1.best !== '';
      // 逐 rep 配对一致(同 rep 序号两序对比)
      const perRep = v1.map((x, i) => x && v2[i] && x === v2[i]);
      const perRepRate = +(perRep.filter(Boolean).length / N).toFixed(2);
      // 模型自报 vs 实测:自报"一致"但实际多数翻转 = 自报戏被戳穿
      const selfClaims = [...o1, ...o2].map(r => r.self_claim);
      const selfTrueRate = +(selfClaims.filter(x => x === true).length / selfClaims.length).toFixed(2);
      // 正确性(用 order1+order2 合并多数)
      const allV = [...v1, ...v2];
      const mAll = mode(allV);
      const correct = c.expect_verdict ? lib.normVerdict(c.expect_verdict) === mAll.best : null;
      // 事实冲突检出(若该案期望)
      const fcRate = c.expect_factual_conflict != null
        ? +([...o1, ...o2].filter(r => r.factual_conflict === true).length / (2 * N)).toFixed(2)
        : null;
      const jsonOk = [...o1, ...o2].filter(r => r.json_ok).length;
      perJudge.push({
        model, order1: m1.counts, order2: m2.counts,
        swap_consistent_majority: swapConsistentMajority,
        per_rep_consistency_rate: perRepRate,
        self_claim_consistent_rate: selfTrueRate,
        verdict_majority: mAll.best, expect_verdict: c.expect_verdict ? lib.normVerdict(c.expect_verdict) : null, correct,
        factual_conflict_detect_rate: fcRate,
        json_valid: `${jsonOk}/${2 * N}`,
      });
      console.log(`  [${c.id}] (${model})  o1=${JSON.stringify(m1.counts)} o2=${JSON.stringify(m2.counts)}  位置一致(多数)=${swapConsistentMajority?'✓':'✗'} 逐rep=${perRepRate}  判=${mAll.best}${c.expect_verdict?`(期望${lib.normVerdict(c.expect_verdict)}${correct?'✓':'✗'})`:''}  自报一致率=${selfTrueRate}${fcRate!=null?` 冲突检出=${fcRate}`:''}`);
    }
    out.cases.push({ id: c.id, desc: c.desc, severity: c.severity, perJudge });
  }
  // 汇总位置一致率
  for (const model of JUDGES) {
    const rows = out.cases.map(c => c.perJudge.find(p => p.model === model)).filter(Boolean);
    const majRate = +(rows.filter(r => r.swap_consistent_majority).length / rows.length).toFixed(2);
    const repRate = +(rows.reduce((s, r) => s + r.per_rep_consistency_rate, 0) / rows.length).toFixed(2);
    const corr = rows.filter(r => r.correct === true).length, corrTot = rows.filter(r => r.correct !== null).length;
    console.log(`\n  汇总(${model}): 位置一致率(多数)=${majRate}  逐rep平均=${repRate}  裁决正确=${corr}/${corrTot}`);
    out[`summary_${model}`] = { position_consistency_majority: majRate, position_consistency_perrep: repRate, verdict_correct: `${corr}/${corrTot}` };
  }
  out.finishedAt = new Date().toISOString();
  out.callStats = stats();
  const tag = arg('tag', 'p5_swap');
  const fn = path.join(__dirname, '..', 'results', `${tag}.json`);
  fs.writeFileSync(fn, JSON.stringify(out, null, 2));
  console.log(`\n调用统计:`, stats(), `\n结果 → ${fn}`);
})();
