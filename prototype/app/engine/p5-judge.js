'use strict';

/**
 * P5 裁判 Agent — 加载 eval P5_judge_v7，供真·控辩裁（位置交换 + 硬性短路）。
 */
const fs = require('fs');
const path = require('path');
const { callLLM } = require('./llm-provider');

const REPO_ROOT = path.resolve(__dirname, '../../..');

function loadPrompt() {
  const v7 = path.join(REPO_ROOT, 'eval/prompts_v7/P5_judge_v7.txt');
  const v6 = path.join(REPO_ROOT, 'eval/prompts/P5_judge_v6.txt');
  const fp = fs.existsSync(v7) ? v7 : v6;
  return { text: fs.readFileSync(fp, 'utf8'), file: path.basename(fp), v7: fp === v7 };
}

function fillTemplate(tpl, vars) {
  let out = tpl;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(String(v ?? ''));
  }
  return out;
}

function tryParse(s) {
  try { return JSON.parse(s); } catch (_) {}
  try { return JSON.parse(s.replace(/,\s*([}\]])/g, '$1')); } catch (_) {}
  return null;
}

function extractJson(text) {
  if (!text) return null;
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  for (let i = fenced.length - 1; i >= 0; i--) {
    const j = tryParse(fenced[i][1].trim());
    if (j && typeof j === 'object') return j;
  }
  let depth = 0; let start = -1; let inStr = false; let esc = false;
  const objs = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') { if (depth === 0) start = i; depth++; }
    else if (ch === '}') {
      depth--;
      if (depth === 0 && start >= 0) objs.push(text.slice(start, i + 1));
    }
  }
  for (let i = objs.length - 1; i >= 0; i--) {
    const j = tryParse(objs[i]);
    if (j && typeof j === 'object') return j;
  }
  const m = text.match(/\{[\s\S]*\}/);
  return m ? tryParse(m[0]) : null;
}

function normVerdict(s) {
  if (!s || typeof s !== 'string') return '';
  const t = s.trim();
  if (/撤销|不成立|不予|驳回|排除|不构成|无违规|未见违规|不属于违规|无疑点/.test(t)) return '撤销';
  if (/线索|存疑|待[观核复审]|降为?线索|降级|有待/.test(t)) return '线索';
  if (/疑点|违规|违法|成立|维持|属实|确认违/.test(t)) return '疑点';
  return t;
}

function mapWorkbenchVerdict(v) {
  const n = normVerdict(v);
  if (n === '线索') return { verdict: '降级线索', status: '线索' };
  if (n === '撤销') return { verdict: '撤销', status: null };
  return { verdict: '维持疑点', status: '疑点' };
}

function buildFacts(record, finding) {
  const facts = {
    fee_lines: [],
    orders: [],
    labs: [],
    pathology: [],
    diagnoses: [],
    missing_or_unclear: record.missing_or_unclear || [],
    conflicts: record.conflicts || [],
  };
  const feesRaw = record.fee_lines || record.fee_list?.items || record.fee_list || record.settlement?.fee_lines || [];
  const fees = Array.isArray(feesRaw) ? feesRaw : [];
  fees.forEach((row, i) => {
    facts.fee_lines.push({
      id: row.id || `f${i + 1}`,
      name: row.name || row.item_name || row.drug_name,
      qty: row.qty ?? row.quantity,
      amount: row.amount,
      anchor: row.anchor || { doc: row.source || '费用清单' },
      confidence: row.confidence ?? 0.9,
    });
  });
  const orders = record.long_term_orders?.items || record.orders || [];
  orders.forEach((row, i) => {
    facts.orders.push({
      id: row.order_id || row.id || `o${i + 1}`,
      name: row.content || row.name,
      dose: row.dose,
      anchor: row.anchor || { doc: '医嘱' },
    });
  });
  const labs = record.labs || record.lab_reports || [];
  labs.forEach((row, i) => {
    facts.labs.push({
      id: row.id || `l${i + 1}`,
      item: row.item || row.name,
      value: row.value,
      unit: row.unit,
      anchor: row.anchor || { doc: '检验' },
    });
  });
  const patho = record.pathology || record.pathology_reports || [];
  patho.forEach((row, i) => {
    facts.pathology.push({
      id: row.id || `p${i + 1}`,
      conclusion: row.conclusion || row.text,
      anchor: row.anchor || { doc: '病理报告' },
    });
  });
  const dx = record.front_page?.principal_diagnosis;
  if (dx) facts.diagnoses.push({ id: 'd1', name: dx.name || dx });
  if (finding?.evidence?.length && !facts.fee_lines.length) {
    finding.evidence.forEach((e, i) => {
      facts.fee_lines.push({
        id: `ev${i + 1}`,
        name: e.type,
        anchor: e.anchor || { doc: e.loc },
        confidence: 0.85,
        note: e.text,
      });
    });
  }
  return facts;
}

function buildRulePolicy(finding, rule, policyTexts) {
  const parts = [];
  if (rule) {
    parts.push(`规则 ${finding.rule_id} ${rule.rule_name || ''}`.trim());
    if (rule.exclusions) parts.push(`除外清单: ${rule.exclusions}`);
    if (rule.policy_basis) parts.push(`政策依据: ${rule.policy_basis}`);
  }
  (finding.policy || []).forEach(p => {
    const full = policyTexts?.[p.ref] || p.text;
    if (full) parts.push(`${p.ref}: ${full}`);
  });
  return parts.join('\n') || `规则 ${finding.rule_id}`;
}

function buildProsecution(finding) {
  const ev = (finding.evidence || []).map(e => `[${e.type}] ${e.loc}: ${e.text}`).join('；');
  return `控方(${finding.rule_id}): ${finding.reasoning || ''}${ev ? ` 证据: ${ev}` : ''}`;
}

function buildDefense(rebuttal) {
  if (!rebuttal) return '辩方: 请求审查除外情形与证据链完整性。';
  const text = typeof rebuttal === 'string' ? rebuttal : (rebuttal.rebuttal || '');
  const rev = rebuttal.reverse_evidence?.length ? ` 反向证据: ${rebuttal.reverse_evidence.join('；')}` : '';
  return `辩方: ${text}${rev}`;
}

async function callJudge(prompt) {
  const raw = await callLLM({ system: '严格按用户指令输出单个 JSON 对象。', user: prompt, maxTokens: 2500 });
  const j = extractJson(raw);
  if (!j) throw new Error('P5 裁判未返回 JSON: ' + String(raw).slice(0, 120));
  return j;
}

async function judgeOnce({ prosecution, defense, facts, rulePolicy, swap }) {
  const { text } = loadPrompt();
  const prompt = fillTemplate(text, {
    arg_A: swap ? defense : prosecution,
    arg_B: swap ? prosecution : defense,
    facts: JSON.stringify(facts),
    rule_policy: rulePolicy,
  });
  const j = await callJudge(prompt);
  return { raw: j, verdict: normVerdict(j.verdict), reasoning: j.reasoning || '' };
}

async function runP5Judge({ prosecution, defense, facts, rulePolicy }) {
  const o1 = await judgeOnce({ prosecution, defense, facts, rulePolicy, swap: false });
  const o2 = await judgeOnce({ prosecution, defense, facts, rulePolicy, swap: true });
  const counts = {};
  [o1.verdict, o2.verdict].forEach(v => { if (v) counts[v] = (counts[v] || 0) + 1; });
  let best = o1.verdict;
  let bc = 0;
  for (const [k, v] of Object.entries(counts)) if (v > bc) { best = k; bc = v; }
  const mapped = mapWorkbenchVerdict(best);
  return {
    enabled: true,
    rounds: 2,
    prompt: loadPrompt().file,
    p5_v7: loadPrompt().v7,
    position_swap_consistent: o1.verdict === o2.verdict,
    exchanges: [
      { role: '控方', stance: '主张违规', text: prosecution },
      { role: '辩方', stance: '为机构申诉', text: defense },
      { role: '裁判', stance: '中立裁定(P5)', text: o2.reasoning || o1.reasoning || mapped.verdict },
    ],
    verdict: mapped.verdict,
    verdict_reason: o2.reasoning || o1.reasoning || `P5 裁判多数: ${best}`,
    p5_verdict: best,
    factual_conflict: !!(o1.raw.factual_conflict || o2.raw.factual_conflict),
    status_after: mapped.status,
  };
}

module.exports = {
  loadPrompt,
  buildFacts,
  buildRulePolicy,
  buildProsecution,
  buildDefense,
  runP5Judge,
  normVerdict,
  mapWorkbenchVerdict,
};
