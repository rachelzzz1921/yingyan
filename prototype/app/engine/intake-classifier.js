'use strict';

/** 材料槽位 → medical_record 字段 + 工作台 Tab */
const INTAKE_SLOTS = [
  { id: 'full_record', label: '完整材料包', tab: null, keys: ['case_meta', 'front_page'], keywords: ['medical_record', '材料包', 'case'] },
  { id: 'front_page', label: '病案首页', tab: 'front', keys: ['front_page'], keywords: ['病案首页', '首页', 'front_page', 'frontpage'] },
  { id: 'admission_note', label: '入院记录', tab: 'admission', keys: ['admission_note'], keywords: ['入院记录', '入院', 'admission'] },
  { id: 'progress_notes', label: '病程记录', tab: 'progress', keys: ['progress_notes'], keywords: ['病程记录', '病程', 'progress'] },
  { id: 'orders', label: '医嘱单', tab: 'orders', keys: ['long_term_orders', 'temporary_orders'], keywords: ['医嘱', '长期医嘱', '临时医嘱', 'order'] },
  { id: 'nursing_records', label: '护理记录', tab: 'nursing', keys: ['nursing_records'], keywords: ['护理记录', '护理', 'nursing'] },
  { id: 'lab_reports', label: '检验报告', tab: 'lab', keys: ['lab_reports'], keywords: ['检验报告', '检验', '化验', 'lab'] },
  { id: 'operation_note', label: '手术记录', tab: 'op', keys: ['operation_note'], keywords: ['手术记录', '手术', 'operation'] },
  { id: 'imaging_record', label: '影像检查', tab: 'op', keys: ['imaging_record'], keywords: ['影像', 'ct', 'mri', 'x光', 'dr', 'imaging', '放射'] },
  { id: 'anesthesia_record', label: '麻醉记录', tab: 'anes', keys: ['anesthesia_record'], keywords: ['麻醉记录', '麻醉', 'anesthesia'] },
  { id: 'icu_record', label: '重症记录', tab: 'icu', keys: ['icu_record'], keywords: ['重症', 'icu', '监护', 'crrt', '呼吸机'] },
  { id: 'pharmacy_info', label: '药店/处方', tab: 'pharm', keys: ['pharmacy_info'], keywords: ['药店', '处方', 'pharmacy', '零售'] },
  { id: 'pathology_report', label: '病理报告', tab: 'path', keys: ['pathology_report'], keywords: ['病理', 'pathology'] },
  { id: 'gene_test_report', label: '基因检测', tab: 'path', keys: ['gene_test_report'], keywords: ['基因', 'egfr', 'alk', 'gene'] },
  { id: 'fee_list', label: '费用清单', tab: 'fee', keys: ['fee_list'], keywords: ['费用清单', '费用明细', '结算清单', 'fee', 'invoice', '明细'] },
  { id: 'discharge_summary', label: '出院小结', tab: 'discharge', keys: ['discharge_summary'], keywords: ['出院小结', '出院记录', 'discharge'] },
  { id: 'unknown', label: '待识别', tab: null, keys: [], keywords: [] },
];

const SLOT_BY_ID = Object.fromEntries(INTAKE_SLOTS.map(s => [s.id, s]));

function norm(s) {
  return String(s || '').toLowerCase().replace(/[\s_\-./\\]+/g, '');
}

function scoreKeywords(hay, keywords) {
  const h = norm(hay);
  let score = 0;
  for (const kw of keywords) {
    const k = norm(kw);
    if (!k) continue;
    if (h.includes(k)) score += k.length >= 4 ? 3 : 2;
  }
  return score;
}

function classifyByJsonStructure(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.case_meta && obj.front_page && obj.fee_list) return { slot: 'full_record', confidence: 0.98, method: 'json_shape' };
  const hits = [];
  for (const s of INTAKE_SLOTS) {
    if (s.id === 'full_record' || s.id === 'unknown') continue;
    for (const k of s.keys) {
      if (obj[k] != null) hits.push({ slot: s.id, key: k, weight: 5 });
    }
  }
  if (Array.isArray(obj) && obj.length && obj[0]?.date && obj[0]?.text) return { slot: 'progress_notes', confidence: 0.85, method: 'json_array_progress' };
  if (Array.isArray(obj) && obj.length && (obj[0]?.item_name || obj[0]?.amount != null)) return { slot: 'fee_list', confidence: 0.9, method: 'json_array_fee' };
  if (!hits.length) return null;
  hits.sort((a, b) => b.weight - a.weight);
  return { slot: hits[0].slot, confidence: 0.88, method: 'json_key:' + hits[0].key };
}

function classifyByFilename(name) {
  let best = { slot: 'unknown', confidence: 0, method: 'filename' };
  for (const s of INTAKE_SLOTS) {
    if (s.id === 'unknown') continue;
    const score = scoreKeywords(name, s.keywords);
    if (score > best.confidence) best = { slot: s.id, confidence: Math.min(0.95, 0.4 + score * 0.12), method: 'filename' };
  }
  return best;
}

function classifyByTextContent(text) {
  if (!text || text.length < 8) return null;
  const head = text.slice(0, 2000);
  let best = null;
  for (const s of INTAKE_SLOTS) {
    if (s.id === 'full_record' || s.id === 'unknown') continue;
    const score = scoreKeywords(head, s.keywords);
    if (!best || score > best.score) best = { slot: s.id, score, method: 'text_content' };
  }
  if (!best || best.score < 2) return null;
  return { slot: best.slot, confidence: Math.min(0.82, 0.35 + best.score * 0.1), method: best.method };
}

function classifyByMime(mime, name) {
  const m = (mime || '').toLowerCase();
  if (m.includes('json')) return { slot: null, confidence: 0, method: 'mime_json' };
  if (m.includes('csv') || /\.csv$/i.test(name)) return { slot: 'fee_list', confidence: 0.75, method: 'mime_csv' };
  if (m.startsWith('image/') || m.includes('pdf')) return { slot: null, confidence: 0, method: 'mime_image' };
  if (m.includes('text') || /\.txt$/i.test(name)) return { slot: null, confidence: 0, method: 'mime_text' };
  return null;
}

/**
 * 综合分类：JSON 结构 > 文件名 > 文本内容 > MIME 默认
 */
function classifyIntakeFile({ name, mime, textPreview, json }) {
  if (json) {
    const j = classifyByJsonStructure(json);
    if (j) return { ...j, slotLabel: SLOT_BY_ID[j.slot]?.label || j.slot };
  }
  const fromName = classifyByFilename(name);
  if (fromName.confidence >= 0.55) return { ...fromName, slotLabel: SLOT_BY_ID[fromName.slot]?.label };
  if (textPreview) {
    const fromText = classifyByTextContent(textPreview);
    if (fromText && fromText.confidence > fromName.confidence) {
      return { ...fromText, slotLabel: SLOT_BY_ID[fromText.slot]?.label };
    }
  }
  const fromMime = classifyByMime(mime, name);
  if (fromMime?.slot) return { ...fromMime, slotLabel: SLOT_BY_ID[fromMime.slot]?.label };
  if (fromName.confidence > 0) return { ...fromName, slotLabel: SLOT_BY_ID[fromName.slot]?.label };
  if (/\.(jpg|jpeg|png|webp|pdf)$/i.test(name)) {
    return { slot: 'unknown', confidence: 0.2, method: 'image_unclassified', slotLabel: '待识别（扫描件）' };
  }
  return { slot: 'unknown', confidence: 0.1, method: 'fallback', slotLabel: '待识别' };
}

module.exports = { INTAKE_SLOTS, SLOT_BY_ID, classifyIntakeFile, classifyByJsonStructure };
