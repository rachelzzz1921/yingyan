/**
 * 规则沉淀 Agent · 双链（驳回 / 采纳）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { callLLM, isReady } = require('./llm-provider');

const PROMPT_REJECT = path.resolve(__dirname, '../../../prompts/规则沉淀-驳回.md');
const PROMPT_ADOPT = path.resolve(__dirname, '../../../prompts/规则沉淀-采纳.md');

function loadPrompt(track) {
  const fp = track === 'adopt' ? PROMPT_ADOPT : PROMPT_REJECT;
  try { return fs.readFileSync(fp, 'utf8'); } catch (e) {
    return track === 'adopt'
      ? '你是规则巩固专家。根据采纳样本输出 JSON 草案，禁止收紧 trigger。'
      : '你是误报治理专家。根据驳回样本输出 JSON 草案，优先 refine exclusions。';
  }
}

function extractJSON(text) {
  const raw = String(text || '').trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1].trim() : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Agent 未返回合法 JSON');
  return JSON.parse(body.slice(start, end + 1));
}

function buildPayload(rule, feedback, stats, governanceStatus) {
  return {
    rule: {
      rule_id: rule.rule_id,
      rule_name: rule.rule_name,
      trigger_logic: rule.trigger_logic,
      exclusions: rule.exclusions,
      policy_basis: rule.policy_basis,
      output_modes: rule.output_modes,
      params: rule.params,
    },
    feedback: (feedback || []).slice(-20).map(f => ({
      action: f.action,
      judgment: f.judgment,
      reason: f.reason || f.judgment_reason,
      rectify_note: f.rectify_note,
      case_id: f.case_id,
      finding_id: f.finding_id,
      source: f.source,
      ts: f.ts || f.updated_at,
    })),
    stats: stats || {},
    governance: { status: governanceStatus || 'active' },
  };
}

function templateRejectDraft(rule, feedback, stats) {
  const rejects = (feedback || []).filter(f => f.action === '驳回' || f.judgment === '不成立');
  const adopts = (feedback || []).filter(f => f.action === '采纳' || f.judgment === '成立');
  const reasons = rejects.map(r => r.reason || r.judgment_reason || r.rectify_note).filter(Boolean);
  const clustered = reasons.slice(0, 3).join('；');

  let recommendation = 'refine_exclusions';
  let governance = { suggest_status: 'active', reason: '' };
  if (adopts.length > 0 && rejects.length > 0) {
    recommendation = 'shadow';
    governance = { suggest_status: 'shadow', reason: '采纳与驳回并存，建议观察期并补阴性用例' };
  } else if ((stats?.effective_rejected || stats?.rejected || 0) >= 3) {
    recommendation = 'refine_exclusions';
  }

  return {
    track: 'reject',
    rule_id: rule.rule_id,
    recommendation,
    confidence: 0.55,
    rationale: clustered
      ? `驳回链模板：${rejects.length} 条样本，理由聚类「${clustered.slice(0, 120)}」`
      : '驳回链模板：样本不足，建议 shadow 观察',
    patches: clustered ? { exclusions_append: `【驳回沉淀】${clustered}` } : {},
    governance_action: governance,
    suggested_test_cases: rejects.slice(0, 2).map((r, i) => ({
      type: 'negative',
      scene: `驳回样本${i + 1}：${(r.reason || '').slice(0, 80)}`,
      expected: '不输出',
    })),
    human_review_checklist: ['政策合规审', '临床合理审', '工程可执行审'],
    agent_mode: 'template',
    llm_needs_key: !isReady(),
  };
}

function templateAdoptDraft(rule, feedback, stats, governanceStatus) {
  const adopts = (feedback || []).filter(f => f.action === '采纳' || f.judgment === '成立');
  const scenes = adopts.map(a => a.reason || a.rectify_note).filter(Boolean);

  const recommendation = governanceStatus === 'shadow' ? 'restore_active' : 'confirm_active';

  return {
    track: 'adopt',
    rule_id: rule.rule_id,
    recommendation,
    confidence: 0.55,
    rationale: `采纳链模板：${adopts.length} 条成立样本${governanceStatus === 'shadow' ? '，规则在 shadow，建议人工 restore' : ''}`,
    patches: {},
    governance_action: {
      suggest_status: 'active',
      reason: recommendation === 'restore_active' ? '采纳充分，建议恢复在役（须人工点 restore）' : '维持在役',
    },
    suggested_test_cases: adopts.slice(0, 3).map((a, i) => ({
      type: 'positive',
      scene: scenes[i] || `采纳样本 case ${a.case_id || i + 1}`,
      expected: '疑点',
    })),
    confidence_boost_note: scenes[0] || '人工确认命中准确',
    human_review_checklist: ['政策合规审', '临床合理审', '工程可执行审'],
    agent_mode: 'template',
    llm_needs_key: !isReady(),
  };
}

async function runTrackAgent(track, rule, feedback, stats, governanceStatus) {
  const payload = buildPayload(rule, feedback, stats, governanceStatus);
  const filtered = track === 'adopt'
    ? { ...payload, feedback: payload.feedback.filter(f => f.action === '采纳' || f.judgment === '成立') }
    : { ...payload, feedback: payload.feedback.filter(f => f.action === '驳回' || f.judgment === '不成立') };

  if (!isReady()) {
    return track === 'adopt'
      ? templateAdoptDraft(rule, feedback, stats, governanceStatus)
      : templateRejectDraft(rule, feedback, stats);
  }

  const system = loadPrompt(track);
  const user = `track=${track}。请输出严格 JSON（无 markdown）：\n\n${JSON.stringify(filtered, null, 2)}`;
  const raw = await callLLM({ system, user, maxTokens: 6000 });
  const parsed = extractJSON(raw);
  parsed.track = track;
  parsed.agent_mode = 'llm';
  parsed.llm_needs_key = false;
  if (!parsed.rule_id) parsed.rule_id = rule.rule_id;
  return parsed;
}

async function runRejectPrecipitationAgent(rule, feedback, stats, governanceStatus) {
  return runTrackAgent('reject', rule, feedback, stats, governanceStatus);
}

async function runAdoptPrecipitationAgent(rule, feedback, stats, governanceStatus) {
  return runTrackAgent('adopt', rule, feedback, stats, governanceStatus);
}

/** @deprecated 使用 runRejectPrecipitationAgent / runAdoptPrecipitationAgent */
async function runRulePrecipitationAgent(rule, feedback, stats, governanceStatus) {
  return runRejectPrecipitationAgent(rule, feedback, stats, governanceStatus);
}

module.exports = {
  runRejectPrecipitationAgent,
  runAdoptPrecipitationAgent,
  runRulePrecipitationAgent,
  templateRejectDraft,
  templateAdoptDraft,
};
