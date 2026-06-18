'use strict';

/**
 * 控辩裁结果写入 review_feedback（审计留痕，不触发沉淀链除非显式采纳/驳回）。
 */
function appendDebateReview(store, { finding, debate, caseId }) {
  const entry = {
    finding_id: finding.finding_id,
    rule_id: finding.rule_id,
    case_id: caseId,
    action: '控辩裁',
    reason: debate.verdict_reason || debate.verdict || '',
    source: 'p5_debate',
    debate_verdict: debate.verdict,
    p5_verdict: debate.p5_verdict,
    prompt: debate.prompt,
    position_swap_consistent: debate.position_swap_consistent,
    factual_conflict: debate.factual_conflict,
    status_after: debate.status_after,
    ts: new Date().toISOString(),
  };
  store.entries = store.entries || [];
  store.entries.push(entry);
  return entry;
}

function bumpReviewStats(byRule, entry) {
  const r = byRule[entry.rule_id] = byRule[entry.rule_id] || {
    adopted: 0, rejected: 0, more: 0, debate: 0, reject_reasons: [],
  };
  if (entry.action === '采纳') r.adopted++;
  else if (entry.action === '驳回') { r.rejected++; if (entry.reason) r.reject_reasons.push(entry.reason); }
  else if (entry.action === '补材料') r.more++;
  else if (entry.action === '控辩裁') r.debate++;
}

/**
 * 控辩裁降级/撤销 → 建议写入 eval_draft_queue（待人工确认，不自动改 gold）。
 */
function maybeEvalDraftFromDebate({ finding, debate, caseId }, appendEvalDraft) {
  if (!appendEvalDraft || !finding?.rule_id) return null;
  const verdict = debate.verdict || '';
  const reason = debate.verdict_reason || debate.verdict || '';
  if (/撤销/.test(verdict)) {
    return appendEvalDraft({
      case_id: caseId,
      rule_id: finding.rule_id,
      finding_id: finding.finding_id,
      reject_reason: reason,
      gold_draft: { expected_status: '不输出', note: `P5控辩裁撤销: ${reason}` },
      source: 'p5_debate',
    });
  }
  if (/降级|线索/.test(verdict) && finding.status === '疑点') {
    return appendEvalDraft({
      case_id: caseId,
      rule_id: finding.rule_id,
      finding_id: finding.finding_id,
      reject_reason: reason,
      gold_draft: { expected_status: '线索', prior_status: '疑点', note: `P5控辩裁降级: ${reason}` },
      source: 'p5_debate',
    });
  }
  return null;
}

module.exports = { appendDebateReview, bumpReviewStats, maybeEvalDraftFromDebate };
