'use strict';

/**
 * 主动退回金额测算（院端自查 ROI 的核心闭环）
 * ------------------------------------------------------------
 * 政策口径（宽严相济）：
 *  - 自查自纠期限内主动退回 → 从轻/减轻，通常免于/低倍数罚款（"自查从宽"）
 *  - 被飞检查实 → 责令退回 + 罚款：
 *      · 一般违规（条例第38条）：罚款为造成基金损失金额的 1–2 倍
 *      · 骗保（条例第40条）：罚款为骗取金额的 2–5 倍，且可能暂停协议/移送
 * 测算把疑点按 violation_nature 分档：
 *  - 非主观差错 → 建议主动退回（对应 38 条口径）
 *  - 主观嫌疑   → 主动退回 + 院端重点说明（对应 40 条口径，退回不能完全免责）
 *  - 待定       → 复核后决定（不计入退回建议，单列）
 */

const CLAUSE_38 = 'KB1-条例-第38条';
const CLAUSE_40 = 'KB1-条例-第40条';

function round2(x) { return Math.round((Number(x) || 0) * 100) / 100; }

function buildRefundEstimate(findings) {
  const suspected = (findings || []).filter(f => !f.shadow && f.status === '疑点');
  const buckets = { '非主观差错': [], '主观嫌疑': [], '待定': [] };
  for (const f of suspected) {
    const nature = buckets[f.violation_nature] ? f.violation_nature : '待定';
    buckets[nature].push(f);
  }
  const amt = arr => round2(arr.reduce((s, f) => s + (Number(f.amount_involved) || 0), 0));

  const objAmt = amt(buckets['非主观差错']);
  const subjAmt = amt(buckets['主观嫌疑']);
  const tbdAmt = amt(buckets['待定']);
  const refundTotal = round2(objAmt + subjAmt);

  // 被飞检查实的暴露区间 = 退回 + 罚款（38条 1–2 倍 / 40条 2–5 倍）
  const exposureMin = round2(refundTotal + tbdAmt + objAmt * 1 + subjAmt * 2);
  const exposureMax = round2(refundTotal + tbdAmt + objAmt * 2 + subjAmt * 5);

  return {
    generated_at: new Date().toISOString(),
    suspected_count: suspected.length,
    tiers: [
      {
        nature: '非主观差错',
        count: buckets['非主观差错'].length,
        amount: objAmt,
        action: '建议在自查期限内主动退回（自查从宽，通常免于/低倍数罚款）',
        clause: CLAUSE_38,
        penalty_if_caught: `若被飞检查实：退回 + ${round2(objAmt * 1)}~${round2(objAmt * 2)} 元罚款（1–2倍）`,
      },
      {
        nature: '主观嫌疑',
        count: buckets['主观嫌疑'].length,
        amount: subjAmt,
        action: '主动退回 + 院端重点说明留痕（涉嫌骗保情形退回不完全免责，建议法务介入）',
        clause: CLAUSE_40,
        penalty_if_caught: `若被飞检查实：退回 + ${round2(subjAmt * 2)}~${round2(subjAmt * 5)} 元罚款（2–5倍），并可能暂停医保协议`,
      },
      {
        nature: '待定',
        count: buckets['待定'].length,
        amount: tbdAmt,
        action: '调阅材料复核定性后再决定（暂不计入主动退回建议额）',
        clause: null,
        penalty_if_caught: null,
      },
    ],
    summary: {
      suggested_refund: refundTotal,
      pending_review_amount: tbdAmt,
      flying_check_exposure_min: exposureMin,
      flying_check_exposure_max: exposureMax,
      // ROI锚点：主动退回 refundTotal vs 被查实最高暴露 exposureMax
      avoided_loss_min: round2(exposureMin - refundTotal),
      avoided_loss_max: round2(exposureMax - refundTotal),
    },
    disclaimer: '测算为演示口径：罚款倍数取条例38/40条法定区间，实际以医保部门认定为准；主观嫌疑项主动退回不构成完全免责。',
  };
}

function renderRefundMarkdown(est) {
  const s = est.summary;
  const L = [];
  L.push(`## 主动退回金额测算（自查从宽 · 宽严相济）`);
  L.push('');
  L.push(`| 违规性质 | 项数 | 涉及金额 | 处置建议 | 若被飞检查实 |`);
  L.push(`|---|---:|---:|---|---|`);
  for (const t of est.tiers) {
    L.push(`| ${t.nature} | ${t.count} | ¥${t.amount} | ${t.action} | ${t.penalty_if_caught || '—'} |`);
  }
  L.push('');
  L.push(`- **建议主动退回合计**：¥${s.suggested_refund}${s.pending_review_amount ? `（另有待定 ¥${s.pending_review_amount} 复核后定）` : ''}`);
  L.push(`- **若被飞检查实的暴露区间**：¥${s.flying_check_exposure_min} ~ ¥${s.flying_check_exposure_max}（含退回+法定罚款倍数）`);
  L.push(`- **主动退回可避免损失**：约 ¥${s.avoided_loss_min} ~ ¥${s.avoided_loss_max}（不含协议暂停/信用影响）`);
  L.push('');
  L.push(`> ${est.disclaimer}`);
  return L.join('\n');
}

module.exports = { buildRefundEstimate, renderRefundMarkdown };
