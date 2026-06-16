'use strict';

function runParseQA(record) {
  const flags = [];
  let score = 100;
  const feeItems = record?.fee_list?.items || [];
  const admit = record?.front_page?.admit_time;

  if (feeItems.length === 0) {
    flags.push({ code: 'EMPTY_FEE', severity: 'critical', message: '费用清单为空或未解析' });
    score -= 40;
  }

  if (!admit) {
    flags.push({ code: 'NO_ADMIT', severity: 'low', message: '缺少入院日期' });
    score -= 10;
  }

  if (record?.front_page && feeItems.length > 0 && feeItems.length < 3) {
    flags.push({ code: 'FEE_SPARSE', severity: 'low', message: '费用行数偏少，可能解析不完整' });
    score -= 15;
  }

  const ocrConfs = feeItems.map(i => i.anchor?.ocr_conf).filter(v => typeof v === 'number');
  if (ocrConfs.length) {
    const avg = ocrConfs.reduce((a, b) => a + b, 0) / ocrConfs.length;
    if (avg < 0.75) {
      flags.push({ code: 'LOW_OCR', severity: 'low', message: `费用行 OCR 均值 ${avg.toFixed(2)} < 0.75` });
      score -= 20;
    }
  }

  let level = 'ok';
  if (flags.some(f => f.severity === 'critical')) level = 'critical';
  else if (flags.length) level = 'low';

  return {
    level,
    score: Math.max(0, score),
    flags,
    checked_at: new Date().toISOString(),
  };
}

function applyParseQAToConfidence(confidence, parseQuality) {
  if (!parseQuality || parseQuality.level === 'ok') return confidence;
  if (parseQuality.level === 'critical') return Math.round(confidence * 0.7);
  if (parseQuality.level === 'low') return Math.round(confidence * 0.85);
  return confidence;
}

module.exports = { runParseQA, applyParseQAToConfidence };
