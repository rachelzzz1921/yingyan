'use strict';

/**
 * 手术折价（L3 surgery_discount · 367 项）→ SUR-401
 * 同切口/同日两种及以上不同手术，第二及以后未按规定折价（常见≤70%）。
 */
const { lookupConstraints, feeLineMatches } = require('./kb-operational-index');

const DISCOUNT_RATIO = 0.75; // 第二及以后应 ≤75%（各地70~75%，取宽松阈值防漏报）

function surgeryFeeLines(items) {
  return (items || []).filter(l => {
    const cat = l.category || '';
    const name = l.item_name || '';
    if (/手术费/.test(cat)) return true;
    return /术/.test(name) && indexedSurgeryDiscount(name).length > 0;
  });
}

function feeDayKey(feeDate) {
  const raw = String(feeDate || '').trim();
  if (!raw) return '';
  return raw.split('~')[0].trim().slice(0, 10);
}

function indexedSurgeryDiscount(name) {
  return lookupConstraints(name).filter(c => c.family === 'surgery_discount');
}

/** @returns {Array<{primary, secondary, ref, basis, overAmount}>} */
function findSurgeryDiscountViolations(items) {
  const lines = surgeryFeeLines(items);
  const byDay = new Map();
  for (const l of lines) {
    const day = feeDayKey(l.fee_date);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(l);
  }
  const hits = [];
  for (const [, group] of byDay) {
    if (group.length < 2) continue;
    const indexed = group.filter(l => indexedSurgeryDiscount(l.item_name).length);
    if (indexed.length < 2) continue;
    const sorted = [...indexed].sort((a, b) => (a.line_no || 0) - (b.line_no || 0));
    const primary = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      const secondary = sorted[i];
      if (feeLineMatches(secondary.item_name, primary.item_name)) continue;
      const meta = indexedSurgeryDiscount(secondary.item_name)[0] || {};
      const expectedMax = (primary.unit_price || secondary.unit_price) * DISCOUNT_RATIO;
      if ((secondary.unit_price || 0) <= expectedMax + 0.01) continue;
      const fair = (secondary.unit_price || 0) * DISCOUNT_RATIO * (secondary.qty || 1);
      const over = Math.max(0, (secondary.amount || 0) - fair);
      if (over < 1) continue;
      hits.push({
        primary,
        secondary,
        ref: (meta.refs || [])[0] || '',
        basis: meta.basis || '经同一切口进行的两种及以上不同的手术，第二及以后的手术未按规定折价计收',
        overAmount: Math.round(over * 100) / 100,
      });
    }
  }
  return hits;
}

module.exports = { findSurgeryDiscountViolations, DISCOUNT_RATIO };
