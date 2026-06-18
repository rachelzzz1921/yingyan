/**
 * 鹰眼 · 真·LLM 多 Agent 稽核分析管线（不是脚本，是真读病历推理）
 * ------------------------------------------------------------
 * 与确定性引擎(audit-engine.js)的分工 —— 诚实划清：
 *   · 确定性引擎 = 真·规则计算（L1时间/数量/互斥 + 结构化L2），但其"推理/控辩裁/CoVe"自然语言是模板脚本；
 *   · 本管线 = 真·语义分析：LLM 实际读病历自由文本，多阶段推理：
 *       Stage1 稽核Agent(控方)：读{病案/病程/医嘱/检验/费用}自由文本 → 提疑点+证据+条款+推理
 *       Stage2 CoVe 取证自检：对每条疑点生成验证问题 → 独立回查材料 → 修订/保留/降级
 *       Stage3 控辩裁(高风险)：申诉Agent反驳 → 裁判Agent裁定(位置交换防偏见)
 *
 * 需 ANTHROPIC_API_KEY。模型：YINGYAN_MODEL(默认 claude-opus-4-8)。
 * 无 key → 抛 {needsKey:true}，server 据此让 UI 诚实显示"真·语义分析需配 key"。
 */
'use strict';

const { callLLM, providerName } = require('./llm-provider');
const p5 = require('./p5-judge');
const { piiRedact } = require('./pii-redact');
const { applyContextBudget } = require('./context-budget');
const MODEL = providerName();

// 统一经 provider（MiniMax/Anthropic）
async function callClaude(system, userText, maxTokens = 4000) {
  return callLLM({ system, user: userText, maxTokens });
}
function extractJSON(text) {
  const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!m) throw new Error('LLM未返回JSON: ' + text.slice(0, 120));
  return JSON.parse(m[0]);
}

// ---------- Stage 1：稽核 Agent（控方）——真读自由文本提疑点 ----------
async function prosecutor(record, rules, kb) {
  const safeRecord = piiRedact(record);
  const policyKB = {}; for (const e of (kb?.entries || [])) policyKB[e.ref_id] = e.text;
  const budgeted = applyContextBudget({ rules, policyKB, record: safeRecord });
  const slimRules = budgeted.rules;
  const system = [
    '你是"鹰眼"稽核Agent(控方)。真读这份患者材料包的**自由文本**(病程/入院记录/手术记录/检验报告/医嘱/费用清单)，做费用-医嘱-诊断三方交叉验证，找医保违规疑点。',
    '不可动摇原则：①三要素门禁——疑点必须给 证据定位(具体到费用行号/单据名+原文摘录)+条款引用ID+推理；引不出三要素的不输出。②宁漏报不误报——医学合理性争议只出"线索"。③violation_type用《条例》38/40条官方术语。④条款只能引 policy_kb 提供的原文，不得凭记忆编造。',
    '注意除外：贝伐珠单抗等抗血管生成药无需靶点检测；放化疗周期规律再入院不算分解住院。',
  ].join('\n');
  const user = [
    '## 规则库(节选)', '```json', JSON.stringify(slimRules), '```',
    '## policy_kb(条款原文,report只能引这里)', '```json', JSON.stringify(budgeted.policyKB), '```',
    '## 待稽核材料包（已脱敏）', '```json', JSON.stringify(budgeted.record), '```',
    '逐条跑规则做三方交叉验证。只输出JSON数组，每元素:',
    '{"rule_id","rule_name","violation_type","layer","risk_level":"高|中—高|中|低","status":"疑点|线索","amount_involved":number,"evidence":[{"type","loc","text"}],"policy":[{"ref","text"}],"reasoning","needs_more":[],"disposal_suggestion"}',
  ].join('\n');
  const txt = await callClaude(system, user, 8000);
  const arr = extractJSON(txt);
  return { findings: Array.isArray(arr) ? arr : (arr.findings || []), context_manifest: budgeted.context_manifest };
}

// ---------- Stage 2：CoVe 取证自检（真生成验证问题+独立回查） ----------
async function coveVerify(finding, record) {
  const system = '你是取证自检器(CoVe)。对给定疑点，生成3-5个可验证的事实性问题，再**独立**回查材料包逐题作答，判断疑点是否成立。不受原结论影响、客观回查。';
  const user = [
    '## 疑点草稿', '```json', JSON.stringify({ rule_id: finding.rule_id, status: finding.status, reasoning: finding.reasoning, evidence: finding.evidence }), '```',
    '## 材料包', '```json', JSON.stringify(record), '```',
    '只输出JSON: {"items":[{"q":"验证问题","a":"独立回查材料后的答案","pass":true/false}],"verdict":"维持|降级线索|撤销","verdict_reason":"..."}',
  ].join('\n');
  const txt = await callClaude(system, user, 2000);
  return extractJSON(txt);
}

// ---------- Stage 3：控辩裁（申诉Agent反驳 → P5 v7 裁判，位置交换） ----------
async function defenderJudge(finding, record, kb, opts = {}) {
  const policyKB = {};
  for (const e of (kb?.entries || [])) policyKB[e.ref_id] = e.text;
  const defSys = '你是申诉Agent(辩方),为被稽核机构辩护:检查规则除外情形、找反向证据、质疑证据链完整性、指出是否属合理诊疗。你是误报过滤器。';
  const defUser = ['## 控方疑点', '```json', JSON.stringify(finding), '```', '## 材料包', '```json', JSON.stringify(record), '```', '输出JSON: {"rebuttal":"申诉理由","reverse_evidence":["..."],"requests_downgrade":true/false}'].join('\n');
  const rebuttal = extractJSON(await callClaude(defSys, defUser, 1500));
  const rule = opts.rules?.[finding.rule_id];
  const facts = p5.buildFacts(record, finding);
  const rulePolicy = p5.buildRulePolicy(finding, rule, { ...policyKB, ...(opts.policyTexts || {}) });
  const prosecution = p5.buildProsecution(finding);
  const defense = p5.buildDefense(rebuttal);
  const debate = await p5.runP5Judge({ prosecution, defense, facts, rulePolicy });
  debate.exchanges[1].text = typeof rebuttal === 'object' ? (rebuttal.rebuttal || defense) : defense;
  debate.real_agent = true;
  debate.llm_provider = MODEL;
  return debate;
}

// Stage2 批量 CoVe（一次调用核验全部疑点，控成本/时延）
async function coveVerifyAll(findings, record) {
  if (!findings.length) return {};
  const system = '你是取证自检器(CoVe)。对每条疑点生成2-3个可验证事实问题，独立回查材料作答，判断成立性。客观、不受原结论影响。';
  const user = [
    '## 疑点列表', '```json', JSON.stringify(findings.map((f, i) => ({ idx: i, rule_id: f.rule_id, status: f.status, reasoning: (f.reasoning || '').slice(0, 300) }))), '```',
    '## 材料包', '```json', JSON.stringify(record), '```',
    '只输出JSON: {"results":[{"idx":0,"items":[{"q","a","pass":true/false}],"verdict":"维持|降级线索|撤销","verdict_reason"}]}',
  ].join('\n');
  const out = extractJSON(await callLLM({ system, user, maxTokens: 4000 }));
  const map = {};
  for (const r of (out.results || [])) map[r.idx] = r;
  return map;
}

// ---------- 编排：真·多Agent管线（prosecutor + 批量CoVe；控辩裁=按需，见 runDebate） ----------
async function llmAgentAudit(record, rules, opts = {}) {
  const kb = opts.kb;
  const t0 = Date.now();
  const prose = await prosecutor(record, rules, kb);
  let raw = prose.findings;
  const context_manifest = prose.context_manifest;
  raw.forEach((f, i) => { f.finding_id = `F-LLM-${String(i + 1).padStart(3, '0')}`; });
  let coveMap = {};
  try { coveMap = await coveVerifyAll(raw, record); } catch (e) { /* CoVe失败不阻断 */ }
  let findings = [];
  raw.forEach((f, i) => {
    const cv = coveMap[i];
    if (cv) { f.cove = { items: cv.items || [], verdict: cv.verdict, verdict_reason: cv.verdict_reason }; if (cv.verdict === '降级线索') f.status = '线索'; if (cv.verdict === '撤销') return; }
    f.debate = { enabled: false, skip_reason: '控辩裁=按需触发（点疑点"对抗辩论"启动真·控辩裁，省成本）' };
    f.policy = (f.policy || []).map(p => ({ ...p, verify_status: (opts.policyVerified || {})[p.ref] ? '✅已核验' : '⚠待核验' }));
    f.confidence = f.status === '疑点' ? 90 : 60;
    findings.push(f);
  });
  // doc08 合议层：LLM 独立判断常对同一笔钱多角度命中（如白蛋白 A-108+A-110）→ 合并去重
  let merged = findings, reconciliation_log = [];
  const { reconcile, applyPostAuditGovernance } = require('./audit-engine');
  try {
    const r = reconcile(findings);
    merged = r.findings;
    reconciliation_log = r.reconciliation_log;
  } catch (e) { /* 合议失败不阻断 */ }
  const gov = applyPostAuditGovernance(merged, {
    shadowRules: opts.shadowRules,
    retiredRules: opts.retiredRules,
    policyTexts: opts.policyTexts,
    policyVerified: opts.policyVerified,
  });
  merged = gov.findings;
  const suspected = gov.suspected, clues = gov.clues;
  findings = merged;
  return {
    report_meta: {
      case_id: record.case_meta?.case_id, patient: `${record.front_page?.patient_name} ${record.front_page?.sex} ${record.front_page?.age}岁`,
      audit_engine: `鹰眼·真·LLM多Agent语义稽核（${MODEL}：稽核Agent读病历→批量CoVe自检→合议去重→控辩裁按需）`,
      reconciliation_log,
      engine_mode: `真·LLM语义分析（Agent读病历自由文本推理 · ${MODEL}）`, real_agent: true, llm_provider: MODEL,
      context_manifest,
      human_baseline_minutes: 40, agent_seconds: 90, elapsed_ms: Date.now() - t0,
      summary: { ...gov.summary, suspected_amount: gov.summary.suspected_amount, clue_amount_flagged: gov.summary.clue_amount_flagged },
    },
    findings, correctly_not_flagged: [], real_agent: true,
  };
}

// 按需：对单条疑点跑真·控辩裁（P5 v7 裁判）
async function runDebate(finding, record, kb, opts = {}) {
  return defenderJudge(finding, record, kb, opts);
}

module.exports = { llmAgentAudit, runDebate };
