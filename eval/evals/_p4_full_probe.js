// P4 全量回归探针:4用例 × 2模型 × N,用指定 prompt,套真评分器,算 8 格 all_green。
// 用法:EVAL_PROVIDER=siliconflow node _p4_full_probe.js [N] [promptFile]
const fs = require('fs'), path = require('path');
const lib = require('./lib'), { callModel, MODELS } = require('./providers');
const checks = require('./asserts/customChecks');
const N = parseInt(process.argv[2] || '5', 10);
const promptFile = process.argv[3] || path.join(__dirname, '../prompts_v7/P4_defense_v72.txt');
const p4 = require('./cases/P4.json');
const cases = Array.isArray(p4) ? p4 : p4.cases;
const rule_context = p4.rule_context;
const tpl = fs.readFileSync(promptFile, 'utf8');
const models = [['72B', MODELS.debater], ['32B', MODELS.alt]];

function extractJson(text) {
  if (!text) return null;
  let t = String(text).replace(/```json|```/g, '').trim();
  try { return JSON.parse(t); } catch (_) {}
  try { return JSON.parse(t.replace(/,\s*([}\]])/g, '$1')); } catch (_) {}
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i >= 0 && j > i) { try { return JSON.parse(t.slice(i, j + 1)); } catch (_) {} }
  return null;
}

(async () => {
  console.log(`=== P4 全量回归:${path.basename(promptFile)} · N=${N} · noCache ===`);
  let slots = 0, greenSlots = 0;
  for (const c of cases) {
    const graders = (c.expect && c.expect.custom) || [];
    const prompt = lib.fillTemplate(tpl, { finding: c.vars.finding, facts: c.vars.facts, rule_context });
    for (const [tag, model] of models) {
      slots++;
      let green = 0, jsonOk = 0;
      const fails = [];
      for (let i = 0; i < N; i++) {
        const r = await callModel({ model, prompt, temperature: 0.2, maxTokens: 8192, rep: 900 + i, noCache: true });
        const j = extractJson(r.text);
        const isJson = !!j;
        if (isJson) jsonOk++;
        let allPass = isJson;
        const detail = [];
        if (isJson) for (const g of graders) {
          const fn = checks[g];
          if (!fn) { detail.push(`${g}?`); continue; }
          const res = fn(j);
          if (!res.pass) { allPass = false; detail.push(`${g}✗(${res.detail || ''})`); }
        }
        if (allPass) green++; else fails.push(`#${i}:${detail.join(';') || '非JSON'}`);
      }
      const ok = green === N;
      if (ok) greenSlots++;
      console.log(`${ok ? '✅' : '❌'} ${c.id.padEnd(28)} ${tag}  all_green ${green}/${N}  json ${jsonOk}/${N}  ${fails.length ? '｜' + fails.slice(0, 2).join(' ').slice(0, 120) : ''}`);
    }
  }
  console.log(`\n=== P4 合计:${greenSlots}/${slots} 格全绿 ===`);
})();
