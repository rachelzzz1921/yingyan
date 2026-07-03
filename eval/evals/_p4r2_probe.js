// P4-R2 探针:现跑 R2 × 72B × N,报告 concede/status/rebuttals,诊断臆造失败态。
// 用法:EVAL_PROVIDER=siliconflow node _p4r2_probe.js [N] [promptFile]
const fs = require('fs'), path = require('path');
const lib = require('./lib'), { callModel, MODELS } = require('./providers');
const N = parseInt(process.argv[2] || '5', 10);
const promptFile = process.argv[3] || path.join(__dirname, '../prompts_v7/P4_defense_v7.txt');
const p4 = require('./cases/P4.json');
const cases = Array.isArray(p4) ? p4 : p4.cases;
const r2 = cases.find(c => /R2/.test(c.id));
const rule_context = p4.rule_context;
const tpl = fs.readFileSync(promptFile, 'utf8');
const prompt = lib.fillTemplate(tpl, { finding: r2.vars.finding, facts: r2.vars.facts, rule_context });

// 稳健 JSON 提取(内联,复刻 lib.extractJson 思路:剥 fence → 取最后一个完整对象)
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
  console.log(`=== R2 × 72B × ${N}(${path.basename(promptFile)},noCache,maxTok=8192) ===`);
  let pass = 0, fabRows = [];
  for (let i = 0; i < N; i++) {
    const r = await callModel({ model: MODELS.debater, prompt, temperature: 0.2, maxTokens: 8192, rep: 700 + i, noCache: true });
    const j = extractJson(r.text);
    if (!j) { console.log(`#${i} ✗ JSON解析失败 raw=${(r.text || '').slice(0, 120)}`); continue; }
    const cv = j.concede_violation, ss = j.suggested_status, rb = j.rebuttals || [];
    const pc = j.path_checklist || {};
    const ok = (cv === true || ss === '维持疑点');
    if (ok) pass++;
    const rbTxt = rb.map(x => `${x.path || '?'}[${x.strength || '?'}]:${(x.argument || '').slice(0, 40)}`).join(' ¦ ');
    console.log(`#${i} ${ok ? '✓' : '✗'} concede=${cv} status=${ss} rb=${rb.length} pc=[excl=${pc.exclusion_available},gap=${pc.evidence_gap_exists}] ${rbTxt ? '｜' + rbTxt.slice(0, 130) : ''}`);
    if (!ok) fabRows.push({ i, cv, ss, rebuttals: rb, path_checklist: pc, strongest: j.strongest_point });
  }
  console.log(`\n72B R2 通过: ${pass}/${N}`);
  if (fabRows.length) { console.log('--- 失败样本详情(前2) ---'); console.log(JSON.stringify(fabRows.slice(0, 2), null, 1)); }
})();
