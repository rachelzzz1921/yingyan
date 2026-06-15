// run.js — P1-P4,P6,P7 真实回归运行器。多次运行(N≥5)报通过率+方差,按模型分。零模拟。
'use strict';
const fs = require('fs');
const path = require('path');
const { callModel, stats, MODELS } = require('./providers');
const lib = require('./lib');
const customChecks = require('./asserts/customChecks');

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
function flag(name) { return process.argv.includes(`--${name}`); }

const N = parseInt(arg('n', '5'), 10);
const TEMP = parseFloat(arg('temp', '0.2'));
const PROMPTS = arg('prompts', 'P1,P2,P3,P4,P6,P7').split(',').map(s => s.trim());
const CASE_FILTER = arg('cases', '');                 // 逗号分隔的 case id 子集
const MODEL_KEYS = arg('models', 'debater').split(',').map(s => s.trim());
const USE_V7 = flag('v7');
const CONC = parseInt(arg('conc', '5'), 10);

function resolveModel(k) { return MODELS[k] || k; }

function resolvePromptFile(caseFileObj) {
  let file = caseFileObj.prompt;
  let usedV7 = false, dir = lib.PROMPT_DIR;
  if (USE_V7) {
    const v7file = file.replace('_v6', '_v7');
    if (fs.existsSync(path.join(lib.PROMPT_DIR_V7, v7file))) { file = v7file; dir = lib.PROMPT_DIR_V7; usedV7 = true; }
  }
  return { text: fs.readFileSync(path.join(dir, file), 'utf8'), file, usedV7 };
}

async function runCaseOnModel(tpl, c, modelKey, commonVars) {
  const model = resolveModel(modelKey);
  const vars = { ...(commonVars || {}), ...c.vars };
  const prompt = lib.fillTemplate(tpl, vars);
  // N 个独立样本(每个 rep 缓存键不同 → 真实多次采样)
  const reps = await lib.pMap(
    Array.from({ length: N }, (_, i) => i),
    async (rep) => {
      const res = await callModel({ model, prompt, temperature: TEMP, rep });
      const parsed = lib.extractJson(res.text);
      const asserts = lib.runExpect(c.expect, parsed, res.text, c, customChecks);
      return { rep, ok_call: res.ok, json_valid: parsed != null, asserts, cached: res.cached, err: res.err || null, len: (res.text || '').length };
    },
    CONC
  );
  // 聚合
  const assertNames = (reps[0]?.asserts || []).map(a => a.name);
  const perAssert = {};
  for (const name of assertNames) {
    const pc = reps.filter(r => (r.asserts.find(a => a.name === name) || {}).pass).length;
    perAssert[name] = { pass: pc, total: N, rate: +(pc / N).toFixed(2) };
  }
  const jsonValid = reps.filter(r => r.json_valid).length;
  const callOk = reps.filter(r => r.ok_call).length;
  const allGreen = reps.filter(r => r.asserts.length > 0 && r.asserts.every(a => a.pass)).length;
  const sampleDetail = reps.map(r => r.asserts.filter(a => !a.pass).map(a => `${a.name}{${a.detail}}`));
  return {
    model, modelKey, json_valid: { pass: jsonValid, total: N }, call_ok: { pass: callOk, total: N },
    all_green: { pass: allGreen, total: N }, perAssert,
    fail_details: sampleDetail.flat().filter((v, i, arr) => arr.indexOf(v) === i).slice(0, 8),
  };
}

(async () => {
  const startedAt = new Date().toISOString();
  const out = { startedAt, N, temperature: TEMP, models: MODEL_KEYS.map(resolveModel), useV7: USE_V7, prompts: {} };
  for (const pid of PROMPTS) {
    const caseFile = path.join(__dirname, 'cases', `${pid}.json`);
    if (!fs.existsSync(caseFile)) { console.log(`[skip] ${pid}: 无 cases/${pid}.json`); continue; }
    const cf = JSON.parse(fs.readFileSync(caseFile, 'utf8'));
    const { text: tpl, file, usedV7 } = resolvePromptFile(cf);
    let cases = cf.cases;
    if (CASE_FILTER) { const set = new Set(CASE_FILTER.split(',')); cases = cases.filter(c => set.has(c.id)); }
    out.prompts[pid] = { promptFile: file, usedV7, cases: [] };
    console.log(`\n===== ${pid}  (prompt=${file}${usedV7 ? ' [V7]' : ''}, cases=${cases.length}, N=${N}, temp=${TEMP}) =====`);
    for (const c of cases) {
      const byModel = [];
      for (const mk of MODEL_KEYS) {
        const r = await runCaseOnModel(tpl, c, mk, cf.commonVars);
        byModel.push(r);
        const ag = `${r.all_green.pass}/${r.all_green.total}`;
        const jv = `${r.json_valid.pass}/${r.json_valid.total}`;
        console.log(`  [${c.id}] (${r.model})  全绿 ${ag}  JSON ${jv}  ${r.fail_details.length ? '✗ ' + r.fail_details.slice(0, 3).join(' | ') : '✓'}`);
      }
      out.prompts[pid].cases.push({ id: c.id, desc: c.desc, severity: c.severity, byModel });
    }
  }
  out.finishedAt = new Date().toISOString();
  out.callStats = stats();
  const tag = arg('tag', 'run');
  const fn = path.join(__dirname, '..', 'results', `${tag}.json`);
  fs.writeFileSync(fn, JSON.stringify(out, null, 2));
  console.log(`\n调用统计:`, stats(), `\n结果 → ${fn}`);
})();
