'use strict';

const { classifyIntakeFile, SLOT_BY_ID } = require('./intake-classifier');
const { emptyRecord, mergeSlotFragment, finalizeRecord, slotFillStatus } = require('./intake-merge');
const { callVision, isReady, visionModelName } = require('./llm-provider');
const { validateRecord } = require('./ingest');
const { runParseQA } = require('./parse-qa');
const { ensureRecordMeta } = require('./case-id');
const ppClient = require('./ppstructure-client');
const { mapLayoutToFragment } = require('./ppstructure-mapper');

function isPdfOrImage(mime, name) {
  return /pdf/i.test(mime || '') || /\.pdf$/i.test(name)
    || /^image\//i.test(mime || '') || /\.(jpe?g|png|webp|bmp|tiff?)$/i.test(name);
}

async function parseWithLayoutEngine(base64, mime, name, slot) {
  const parsed = await ppClient.parseDocument({ fileBase64: base64, mime, filename: name });
  if (!parsed.ok) return { ok: false, error: parsed.error, hint: parsed.hint };
  const mapped = await mapLayoutToFragment(parsed.layout, slot, name);
  if (!mapped.fragment) return { ok: false, error: mapped.error || 'layout 映射为空', layout: parsed.layout };
  return {
    ok: true,
    fragment: mapped.fragment,
    layout: parsed.layout,
    engine: parsed.layout.engine,
    slotUsed: mapped.slotUsed,
    structured_by: mapped.structured_by,
  };
}

const SLOT_VISION_PROMPTS = {
  front_page: '只抽取病案首页字段为 JSON：{"front_page":{"patient_name","sex","age","admit_time","discharge_time","principal_diagnosis":{"name","icd10"},"admit_dept"}}',
  fee_list: '只抽取费用清单为 JSON：{"fee_list":{"items":[{"line_no","fee_date","category","item_name","qty","unit","unit_price","amount","insurance_class"}]}}',
  admission_note: '只抽入院记录：{"admission_note":{"chief_complaint","present_illness","preliminary_diagnosis":[]}}',
  progress_notes: '只抽病程：{"progress_notes":[{"date","type","text"}]}',
  orders: '只抽医嘱：{"long_term_orders":{"items":[]},"temporary_orders":{"items":[]}}',
  lab_reports: '只抽检验：{"lab_reports":[{"category","report_time","results":[{"item","value","unit","ref","flag"}]}]}',
  discharge_summary: '只抽出院小结：{"discharge_summary":{"discharge_diagnosis":[],"hospital_course"}}',
};

function decodeBase64Text(b64) {
  try { return Buffer.from(b64, 'base64').toString('utf8'); } catch (e) { console.warn('[intake] base64 解码失败:', e.message); return ''; }
}

function tryParseJson(text) {
  try { return JSON.parse(text); } catch (_) { return null; }
}

function parseCsvFeeList(text, filename) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { items: [] };
  const sep = lines[0].includes('\t') ? '\t' : (lines[0].includes(';') ? ';' : ',');
  const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ''));
  const col = (names) => headers.findIndex(h => names.some(n => h.includes(n)));
  const iName = col(['项目名称', '名称', 'item', '药品', '收费项目']);
  const iQty = col(['数量', 'qty']);
  const iPrice = col(['单价', 'price']);
  const iAmt = col(['金额', 'amount', '合计']);
  const iCat = col(['类别', 'category', '费用类别']);
  const iDate = col(['日期', 'fee_date', '收费日期']);
  // 医院收费数据的标准化编码列（HIS 项目编码 / 国家医保编码）——真实场景最可依赖的字段
  const iCode = col(['项目编码', '项目代码', '收费编码', 'item_code', '编码']);
  const iInsCode = col(['医保编码', '国家医保代码', '医保代码', 'insurance_code', '贯标码']);
  const items = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = lines[r].split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
    if (!cols.some(Boolean)) continue;
    const amount = parseFloat(cols[iAmt >= 0 ? iAmt : 4]) || 0;
    const item = {
      line_no: r,
      fee_date: iDate >= 0 ? cols[iDate] : '',
      category: iCat >= 0 ? cols[iCat] : '未分类',
      item_name: iName >= 0 ? cols[iName] : cols[0],
      qty: parseFloat(cols[iQty >= 0 ? iQty : 1]) || 1,
      unit: '次',
      unit_price: parseFloat(cols[iPrice >= 0 ? iPrice : 3]) || amount,
      amount,
      insurance_class: '医保',
      anchor: { doc: filename, ocr_conf: 0.7 },
    };
    if (iCode >= 0 && cols[iCode]) item.item_code = cols[iCode];
    if (iInsCode >= 0 && cols[iInsCode]) item.insurance_code = cols[iInsCode];
    items.push(item);
  }
  return { fee_list: { items, doc_type: '费用清单（CSV导入）' } };
}

function parseTextToSlot(slot, text, filename) {
  const stub = { _intake_raw: text.slice(0, 8000), _source_file: filename };
  if (slot === 'admission_note') return { admission_note: { ...stub, chief_complaint: text.slice(0, 500), present_illness: text } };
  if (slot === 'progress_notes') return { progress_notes: [{ date: '', type: '导入文本', text, _source_file: filename }] };
  if (slot === 'discharge_summary') return { discharge_summary: { ...stub, hospital_course: text } };
  if (slot === 'fee_list') {
    const csv = parseCsvFeeList(text, filename);
    if (csv.fee_list.items.length) return csv;
  }
  return { [slot]: stub };
}

function jsonToFragment(obj, slot) {
  if (slot === 'full_record') return obj;
  if (slot === 'fee_list') {
    if (obj.fee_list) return { fee_list: obj.fee_list };
    if (Array.isArray(obj)) return { fee_list: { items: obj } };
  }
  if (slot === 'progress_notes' && Array.isArray(obj)) return { progress_notes: obj };
  if (slot === 'lab_reports' && Array.isArray(obj)) return { lab_reports: obj };
  if (obj[slot] != null) return { [slot]: obj[slot] };
  return obj;
}

async function parseWithVision(base64, mime, slot, filename) {
  const prompt = SLOT_VISION_PROMPTS[slot] || SLOT_VISION_PROMPTS.fee_list;
  const user = [
    `文件名：${filename}`,
    `材料类型：${SLOT_BY_ID[slot]?.label || slot}`,
    prompt,
    '只输出 JSON，不要解释。抽不到的字段可省略。',
  ].join('\n');
  const text = await callVision({
    system: '你是医保病历结构化抽取器，只输出JSON。',
    user,
    images: [base64],
    mime: mime || 'image/png',
    maxTokens: 6000,
  });
  const jsonStr = (text.match(/\{[\s\S]*\}/) || [text])[0];
  return JSON.parse(jsonStr);
}

async function parseIntakeFile({ name, mime, fileBase64, slotOverride }) {
  const text = decodeBase64Text(fileBase64);
  let json = null;
  const isJsonMime = /json/i.test(mime || '') || /\.json$/i.test(name);
  if (isJsonMime && text) json = tryParseJson(text);

  let classification = classifyIntakeFile({ name, mime, textPreview: text.slice(0, 3000), json });
  if (slotOverride && SLOT_BY_ID[slotOverride]) {
    classification = { ...classification, slot: slotOverride, slotLabel: SLOT_BY_ID[slotOverride].label, method: 'user_override' };
  }

  const slot = classification.slot;
  const log = [`分类→${classification.slotLabel}（${classification.method}，置信${Math.round(classification.confidence * 100)}%）`];
  let fragment = null;
  let ok = true;
  let warning = null;

  try {
    if (json) {
      fragment = jsonToFragment(json, slot === 'unknown' ? classifyIntakeFile({ name, mime, json }).slot : slot);
      if (slot === 'unknown' && fragment) classification.slot = classifyIntakeFile({ name, mime, json }).slot;
      log.push('JSON 解析成功');
    } else if (/csv|text\/plain|\.txt$/i.test(mime || '') || /\.(csv|txt)$/i.test(name)) {
      const effectiveSlot = slot === 'unknown' ? 'fee_list' : slot;
      fragment = parseTextToSlot(effectiveSlot, text, name);
      if (effectiveSlot === 'fee_list' && fragment.fee_list?.items?.length) {
        classification.slot = 'fee_list';
        log.push(`CSV/文本→${fragment.fee_list.items.length} 条费用行`);
      } else {
        classification.slot = effectiveSlot;
        log.push('文本已填入对应字段');
      }
    } else if (isPdfOrImage(mime, name)) {
      const effectiveSlot = slot === 'unknown' ? 'fee_list' : slot;
      const layoutResult = await parseWithLayoutEngine(fileBase64, mime, name, effectiveSlot);
      if (layoutResult.ok && layoutResult.fragment) {
        fragment = layoutResult.fragment;
        classification.slot = layoutResult.slotUsed || effectiveSlot;
        classification.slotLabel = SLOT_BY_ID[classification.slot]?.label || classification.slot;
        const itemCount = fragment.fee_list?.items?.length || fragment.progress_notes?.length || 0;
        log.push(`L1解析(${layoutResult.engine})→${classification.slotLabel}${layoutResult.structured_by ? '+LLM' : ''}${itemCount ? `·${itemCount}条` : ''}`);
        return {
          ok: true, name, classification, fragment, log, warning,
          layout: layoutResult.layout,
          fileMeta: { name, slot: classification.slot, mime, engine: layoutResult.engine, at: new Date().toISOString() },
        };
      }
      if (layoutResult.layout) log.push(`L1(${layoutResult.layout.engine})部分成功，尝试视觉回退`);
      if (isReady() && (/^image\//i.test(mime) || /\.(jpe?g|png|webp)$/i.test(name))) {
        try {
          fragment = await parseWithVision(fileBase64, mime, effectiveSlot, name);
          classification.slot = effectiveSlot;
          classification.slotLabel = SLOT_BY_ID[effectiveSlot]?.label;
          log.push(`视觉回退(${visionModelName()})`);
        } catch (e) {
          ok = false;
          // 视觉回退的真实失败原因优先（之前会被 L1 旧错误覆盖，用户无法自诊）
          return { ok: false, name, classification, error: '视觉回退失败：' + e.message + (layoutResult.error ? ' | L1: ' + layoutResult.error : ''), log, layout: layoutResult.layout };
        }
      } else if (/pdf/i.test(mime || '') || /\.pdf$/i.test(name)) {
        ok = false;
        return {
          ok: false, name, classification,
          error: layoutResult.error || layoutResult.hint || 'PDF 解析失败：请启动 bash prototype/ppstructure/run.sh',
          log,
        };
      } else {
        warning = layoutResult.error || 'L1 解析不可用；请启动 ppstructure sidecar 或配置视觉模型';
        fragment = { _intake_pending: { filename: name, mime, slot: effectiveSlot, needs_vision: true } };
        log.push('占位（L1+视觉均不可用）');
      }
    } else {
      warning = '未支持格式，已跳过内容解析';
      fragment = { _intake_skipped: { filename: name, mime } };
    }
  } catch (e) {
    ok = false;
    return { ok: false, name, classification, error: e.message, log };
  }

  return {
    ok,
    name,
    classification,
    fragment,
    log,
    warning,
    layout: null,
    fileMeta: { name, slot: classification.slot, mime, at: new Date().toISOString() },
  };
}

async function processIntakeBatch(files, { baseRecord = null } = {}) {
  if (!Array.isArray(files) || !files.length) {
    return { ok: false, error: '请至少拖入一个文件' };
  }

  let record = baseRecord ? JSON.parse(JSON.stringify(baseRecord)) : emptyRecord();
  const items = [];
  const errors = [];

  for (const f of files) {
    const r = await parseIntakeFile(f);
    items.push(r);
    if (!r.ok) {
      errors.push(`${r.name}: ${r.error}`);
      continue;
    }
    const slot = r.classification.slot === 'unknown' ? 'admission_note' : r.classification.slot;
    record = mergeSlotFragment(record, slot, r.fragment, r.fileMeta);
    if (r.layout) {
      record.intake_layouts = record.intake_layouts || {};
      record.intake_layouts[r.name] = r.layout;
    }
  }

  record.intake_meta = {
    ...(record.intake_meta || {}),
    parser: 'ppstructure-sidecar',
    last_batch: new Date().toISOString(),
    file_count: files.length,
  };

  record = finalizeRecord(record);
  ensureRecordMeta(record, { scope: 'INT', domain: 'UNK', api_id: 'uploaded' });
  record.case_meta.parse_quality = runParseQA(record);
  const validation = validateRecord(record);
  const slotsFilled = slotFillStatus(record);

  return {
    ok: errors.length < files.length,
    record,
    caseId: record.case_meta?.internal_id || 'uploaded',
    items,
    errors,
    slotsFilled,
    validation,
    parse_log: items.flatMap(i => (i.log || []).map(l => `${i.name}: ${l}`)),
    warnings: items.filter(i => i.warning).map(i => `${i.name}: ${i.warning}`),
  };
}

module.exports = { processIntakeBatch, parseIntakeFile, parseCsvFeeList, parseWithLayoutEngine };
