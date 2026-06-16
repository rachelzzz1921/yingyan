/**
 * 鹰眼 · LLM 语义稽核路径（可选）
 * ------------------------------------------------------------
 * 与确定性引擎(audit-engine.js)互补：这条路径把"读懂病历自由文本"交给 LLM，
 * 演示产品核心创新——语义级稽核超越字段比对。
 *
 * 需要环境变量 ANTHROPIC_API_KEY；模型可用 YINGYAN_MODEL 覆盖（默认 claude-sonnet-4-6）。
 * 无 key 时 server.js 自动回退确定性引擎。
 *
 * 设计要点（对齐产品原则）：
 *   - 强制三要素：要求每条疑点给出 证据定位 / 条款原文引用ID / 推理过程
 *   - 宁漏报不误报：医学合理性争议出"线索"
 *   - 政策禁止凭记忆生成：只允许引用传入的 KB 原文（policyTexts），并回填 verify_status
 */
'use strict';

const { piiRedact } = require('./pii-redact');
const { applyContextBudget } = require('./context-budget');

const MODEL = process.env.YINGYAN_MODEL || 'claude-sonnet-4-6';
const API_URL = 'https://api.anthropic.com/v1/messages';

function buildSystemPrompt() {
  return [
    '你是"鹰眼"——医保基金稽核智能体，为飞检稽核员做AI初筛。',
    '输入：患者完整就诊材料包（多模态解析后的结构化JSON）+ 稽核规则库。',
    '输出：带证据链的结构化稽核报告。严格遵守以下不可动摇的产品原则：',
    '1. 证据链强制（三要素门禁）：任何"疑点"必须能引出三要素——①原始证据定位(具体到费用行号/病历单据名+原文摘录) ②违反的政策条款(给出引用ID) ③完整推理过程。引不出三要素的不输出为疑点。',
    '2. 三态输出：疑点(证据闭环可直接对质) / 线索(模式异常但材料包内无法闭环，附needs_more调阅清单) / 不输出(依赖未证实假设)。医学合理性有争议的只出线索。',
    '3. 宁漏报不误报：规则有除外情形的要主动核对；不确定时降级为线索或不报。',
    '4. 术语对齐官方：violation_type用《条例》第38/40条官方术语。',
    '5. 政策条款禁止凭记忆生成：只能引用我在 policy_kb 中提供的条款原文与引用ID；不得编造条款号或原文。',
    '特别注意除外情形：贝伐珠单抗等抗血管生成药不需要靶点检测，不要因"无基因检测"误报；放化疗按周期规律再入院不算分解住院(命中肿瘤周期白名单)。',
  ].join('\n');
}

function buildUserPrompt(record, rules, kb) {
  const safeRecord = piiRedact(record);
  const policyKB = {};
  for (const e of (kb?.entries || [])) policyKB[e.ref_id] = e.text;
  const budgeted = applyContextBudget({ rules, policyKB, record: safeRecord });

  return [
    '## 稽核规则库（节选字段）',
    '```json', JSON.stringify(budgeted.rules), '```',
    '## 政策条款知识库 policy_kb（report中policy.text只能引用这里的原文）',
    '```json', JSON.stringify(budgeted.policyKB), '```',
    '## 待稽核材料包（已脱敏）',
    '```json', JSON.stringify(budgeted.record), '```',
    '## 任务',
    '逐条执行规则，对本材料包做三方交叉验证（费用↔医嘱/执行记录、费用↔诊断/病历、费用↔手术/操作记录）。',
    '先跑F类L1确定性规则建立锚点，再跑L2语义规则。命中后强制取证、过三要素门禁、风险分级。',
    '严格输出如下 JSON（不要任何额外文字）：',
    '{"findings":[{"rule_id","rule_name","violation_type","layer","risk_level","status":"疑点|线索","amount_involved":number,"evidence":[{"type","loc","text"}],"policy":[{"ref","text"}],"reasoning","needs_more":[],"disposal_suggestion"}],',
    '"correctly_not_flagged":[{"item","tempting_rule","why_not_flagged"}]}',
    'evidence.loc要具体到"费用清单第N行""病程记录YYYY-MM-DD""检验报告ID"等可复核定位；policy.ref用规则policy_basis里的引用ID，policy.text从policy_kb取原文。',
    budgeted.context_manifest ? `## context_manifest\n\`\`\`json\n${JSON.stringify(budgeted.context_manifest)}\n\`\`\`` : '',
  ].join('\n');
}

async function llmAudit(record, rules, opts = {}) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('未配置 ANTHROPIC_API_KEY');
  if (typeof fetch !== 'function') throw new Error('当前 Node 不支持全局 fetch（需 Node18+）');

  const userPrompt = buildUserPrompt(record, rules, opts.kb);
  const contextMatch = userPrompt.match(/```json\n(\{"budget"[\s\S]*?"sections"[\s\S]*?\})\n```/);
  let context_manifest = null;
  try {
    const budgeted = applyContextBudget({
      rules,
      policyKB: Object.fromEntries((opts.kb?.entries || []).map(e => [e.ref_id, e.text])),
      record: piiRedact(record),
    });
    context_manifest = budgeted.context_manifest;
  } catch (_) {}

  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      system: buildSystemPrompt(),
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Anthropic API ${resp.status}: ${t.slice(0, 200)}`);
  }
  const data = await resp.json();
  const text = (data.content || []).map(c => c.text || '').join('');
  // 抽取 JSON（容错：去掉可能的```json围栏）
  const jsonStr = (text.match(/\{[\s\S]*\}/) || [text])[0];
  let parsed;
  try { parsed = JSON.parse(jsonStr); }
  catch (e) { throw new Error('LLM输出解析失败: ' + e.message); }

  // 回填核验状态 + 统计
  const policyVerified = opts.policyVerified || {};
  const findings = (parsed.findings || []).map((f, i) => ({
    finding_id: `F-LLM-${String(i + 1).padStart(3, '0')}`,
    ...f,
    policy: (f.policy || []).map(pp => ({ ...pp, verify_status: policyVerified[pp.ref] ? '✅已核验' : '⚠待核验' })),
  }));
  const suspected = findings.filter(f => f.status === '疑点');
  const clues = findings.filter(f => f.status === '线索');
  return {
    report_meta: {
      case_id: record.case_meta?.case_id,
      patient: `${record.front_page.patient_name} ${record.front_page.sex} ${record.front_page.age}岁`,
      audit_engine: `鹰眼·医保基金稽核智能体（LLM语义路径 · ${MODEL}）`,
      context_manifest,
      human_baseline_minutes: 40, agent_seconds: 90,
      summary: {
        total_findings: findings.length,
        suspected_count: suspected.length, clue_count: clues.length,
        suspected_amount: Number(suspected.reduce((s, f) => s + (f.amount_involved || 0), 0).toFixed(2)),
        clue_amount_flagged: Number(clues.reduce((s, f) => s + (f.amount_involved || 0), 0).toFixed(2)),
      },
    },
    findings,
    correctly_not_flagged: parsed.correctly_not_flagged || [],
  };
}

module.exports = { llmAudit };
