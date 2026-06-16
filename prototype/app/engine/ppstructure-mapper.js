'use strict';

/**
 * PP-Structure layout JSON → medical_record 片段（含 anchor.bbox）
 */
const { callLLM, isReady: llmReady } = require('./llm-provider');

const FEE_HEADER_ALIASES = {
  name: ['项目名称', '名称', '收费项目', '药品', 'item', '项目'],
  qty: ['数量', 'qty'],
  price: ['单价', 'price'],
  amount: ['金额', 'amount', '合计', '总金额'],
  category: ['类别', 'category', '费用类别'],
  date: ['日期', 'fee_date', '收费日期'],
};

function colIndex(headers, aliases) {
  const hs = headers.map(h => String(h || '').trim());
  for (let i = 0; i < hs.length; i++) {
    if (aliases.some(a => hs[i].includes(a) || hs[i].toLowerCase().includes(a.toLowerCase()))) return i;
  }
  return -1;
}

function parseNum(v) {
  const n = parseFloat(String(v || '').replace(/[,，]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function mergeBboxes(boxes) {
  const valid = (boxes || []).filter(b => Array.isArray(b) && b.length === 4);
  if (!valid.length) return null;
  const xs = valid.map(b => b[0]);
  const ys = valid.map(b => b[1]);
  const x2 = valid.map(b => b[0] + b[2]);
  const y2 = valid.map(b => b[1] + b[3]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return [x, y, Math.max(...x2) - x, Math.max(...y2) - y];
}

/** OCR words → 按行分组（tesseract/lite 无 tables 时补 bbox） */
function linesFromWords(page) {
  const words = page?.words || [];
  if (!words.length) return [];
  const sorted = [...words].sort((a, b) => (a.bbox?.[1] || 0) - (b.bbox?.[1] || 0) || (a.bbox?.[0] || 0) - (b.bbox?.[0] || 0));
  const lines = [];
  for (const w of sorted) {
    const t = String(w.text || '').trim();
    if (!t || !w.bbox) continue;
    const y = w.bbox[1];
    let line = lines.find(l => Math.abs(l.y - y) <= 14);
    if (!line) {
      line = { y, words: [] };
      lines.push(line);
    }
    line.words.push(w);
  }
  return lines.map(l => ({
    text: l.words.sort((a, b) => (a.bbox[0] || 0) - (b.bbox[0] || 0)).map(w => w.text).join(' '),
    words: l.words.sort((a, b) => (a.bbox[0] || 0) - (b.bbox[0] || 0)),
    bbox: mergeBboxes(l.words.map(w => w.bbox)),
    score: l.words.reduce((s, w) => s + (w.score || 0.85), 0) / l.words.length,
  })).filter(l => l.text.length >= 2);
}

function columnMidsFromHeaderWords(words) {
  const hdr = (words || []).filter(w => /项目名称|^数量$|^单价$|^金额$/.test(String(w.text || '').trim()));
  if (hdr.length < 2) return null;
  const xs = hdr.sort((a, b) => a.bbox[0] - b.bbox[0]).map(w => w.bbox[0]);
  const mids = [];
  for (let i = 0; i < xs.length - 1; i++) mids.push((xs[i] + xs[i + 1]) / 2);
  return mids;
}

function colIndexForX(x, mids) {
  for (let i = 0; i < mids.length; i++) {
    if (x < mids[i]) return i;
  }
  return mids.length;
}

function feeItemsFromWordLines(pages, filename) {
  const items = [];
  let lineNo = 0;
  for (const page of pages || []) {
    const doc = page.source || filename;
    const mids = columnMidsFromHeaderWords(page.words);
    const lines = linesFromWords(page);
    for (const line of lines) {
      if (/项目名称|^数量$|^单价$|^金额$|费用清单（演示）|住院费用清单/.test(line.text)) continue;

      let name = '';
      let qty = 1;
      let price = 0;
      let amount = 0;

      if (mids && line.words?.length) {
        const cols = [[], [], [], []];
        for (const w of line.words) {
          const ci = Math.min(colIndexForX(w.bbox[0], mids), 3);
          cols[ci].push(w);
        }
        name = cols[0].map(w => w.text).join(' ').trim();
        qty = parseNum(cols[1].map(w => w.text).join('')) || 1;
        price = parseNum(cols[2].map(w => w.text).join(''));
        amount = parseNum(cols[3].map(w => w.text).join('')) || price;
      } else {
        const parts = line.text.split(/\s+/).filter(Boolean);
        if (parts.length >= 4 && /[\d,.]/.test(parts[parts.length - 1])) {
          name = parts.slice(0, -3).join(' ').trim() || parts[0];
          qty = parseNum(parts[parts.length - 3]) || 1;
          price = parseNum(parts[parts.length - 2]);
          amount = parseNum(parts[parts.length - 1]);
        } else {
          const m = line.text.match(/^(.+?)\s+([\d,.]+)\s*$/);
          if (m && /[\u4e00-\u9fa5a-zA-Z]/.test(m[1])) {
            name = m[1].trim();
            amount = parseNum(m[2]);
            price = amount;
          } else continue;
        }
      }

      if (!name || amount <= 0) continue;
      lineNo += 1;
      items.push({
        line_no: lineNo,
        fee_date: '',
        category: '未分类',
        item_name: name,
        spec: '',
        qty,
        unit: '次',
        unit_price: price || amount,
        amount,
        insurance_class: '医保',
        anchor: anchorOf(doc, page.page || 1, line.bbox, line.score, `第${lineNo}行`),
      });
    }
  }
  return items;
}

function anchorOf(doc, page, bbox, score, locator) {
  return {
    doc: doc || '导入件',
    page: page || 1,
    locator: locator || '',
    bbox: bbox || null,
    ocr_conf: score != null ? Math.min(0.99, Math.max(0.5, score)) : 0.9,
  };
}

function extractFeeListFromLayout(layout, filename) {
  const items = [];
  let lineNo = 0;
  for (const page of layout.pages || []) {
    const doc = page.source || filename;
    for (const table of page.tables || []) {
      const rows = table.rows || [];
      if (!rows.length) continue;
      const headerCells = rows[0].cells?.map(c => c.text) || [];
      const iName = colIndex(headerCells, FEE_HEADER_ALIASES.name);
      const iQty = colIndex(headerCells, FEE_HEADER_ALIASES.qty);
      const iPrice = colIndex(headerCells, FEE_HEADER_ALIASES.price);
      const iAmt = colIndex(headerCells, FEE_HEADER_ALIASES.amount);
      const iCat = colIndex(headerCells, FEE_HEADER_ALIASES.category);
      const iDate = colIndex(headerCells, FEE_HEADER_ALIASES.date);
      const hasHeader = iName >= 0 || iAmt >= 0;
      const start = hasHeader ? 1 : 0;
      for (let ri = start; ri < rows.length; ri++) {
        const cells = (rows[ri].cells || []).map(c => c.text);
        if (!cells.some(Boolean)) continue;
        const rowBbox = rows[ri].bbox || table.bbox;
        const score = rows[ri].cells?.[0]?.score || table.score || 0.9;
        lineNo += 1;
        const amount = parseNum(cells[iAmt >= 0 ? iAmt : (cells.length > 4 ? 4 : cells.length - 1)]);
        items.push({
          line_no: lineNo,
          fee_date: iDate >= 0 ? cells[iDate] : '',
          category: iCat >= 0 ? cells[iCat] : '未分类',
          item_name: iName >= 0 ? cells[iName] : cells[0],
          spec: '',
          qty: parseNum(cells[iQty >= 0 ? iQty : 1]) || 1,
          unit: '次',
          unit_price: parseNum(cells[iPrice >= 0 ? iPrice : 3]) || amount,
          amount,
          insurance_class: '医保',
          anchor: anchorOf(doc, page.page || rows[ri].page, rowBbox, score, `第${lineNo}行`),
        });
      }
    }
  }
  if (items.length) return { fee_list: { items, doc_type: `费用清单（${layout.engine}）`, total_amount: items.reduce((s, x) => s + x.amount, 0) } };

  const wordItems = feeItemsFromWordLines(layout.pages, filename);
  if (wordItems.length) {
    return {
      fee_list: {
        items: wordItems,
        doc_type: `费用清单（OCR词行·${layout.engine}）`,
        total_amount: wordItems.reduce((s, x) => s + x.amount, 0),
      },
    };
  }

  // 无表格：从 plain_text 按行启发式
  const lines = (layout.plain_text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.length < 4) continue;
    let name = '';
    let amount = 0;
    const m1 = line.match(/^(.+?)\s+([\d,.]+)\s*$/);
    if (m1 && /[\u4e00-\u9fa5a-zA-Z]/.test(m1[1])) {
      name = m1[1].trim();
      amount = parseNum(m1[2]);
    } else {
      const parts = line.split(/\s+/).filter(Boolean);
      if (parts.length >= 2 && /[\d,.]/.test(parts[parts.length - 1])) {
        amount = parseNum(parts[parts.length - 1]);
        name = parts.slice(0, -1).join(' ').trim();
      }
    }
    if (!name || amount <= 0) continue;
    lineNo += 1;
    items.push({
      line_no: lineNo,
      fee_date: '',
      category: '未分类',
      item_name: name,
      qty: 1,
      unit: '次',
      unit_price: amount,
      amount,
      insurance_class: '医保',
      anchor: anchorOf(filename, 1, null, 0.78, `文本行${lineNo}`),
    });
  }
  if (!items.length) return null;
  return { fee_list: { items, doc_type: `费用清单（文本启发·${layout.engine}）` } };
}

async function structureTextWithLLM(text, slot, filename) {
  if (!llmReady() || !text || text.length < 20) return null;
  const prompts = {
    front_page: '从以下 OCR 文本抽取病案首页 JSON：{"front_page":{...}}',
    admission_note: '抽入院记录：{"admission_note":{"chief_complaint","present_illness"}}',
    progress_notes: '抽病程数组：{"progress_notes":[{"date","type","text"}]}',
    orders: '抽医嘱：{"long_term_orders":{"items":[]},"temporary_orders":{"items":[]}}',
    lab_reports: '抽检验：{"lab_reports":[...]}',
    discharge_summary: '抽出院：{"discharge_summary":{...}}',
  };
  const hint = prompts[slot] || prompts.admission_note;
  try {
    const raw = await callLLM({
      system: '你是医保病历结构化抽取器，只输出 JSON。',
      user: `文件：${filename}\n${hint}\n\n---\n${text.slice(0, 12000)}`,
      maxTokens: 6000,
    });
    const jsonStr = (raw.match(/\{[\s\S]*\}/) || [raw])[0];
    return JSON.parse(jsonStr);
  } catch (_) {
    return null;
  }
}

function textFragmentForSlot(text, slot, filename, layout) {
  const doc = layout.pages?.[0]?.source || filename;
  const page = layout.pages?.[0]?.page || 1;
  const bb = layout.pages?.[0]?.blocks?.[0]?.bbox || null;
  const stub = { _intake_source: layout.engine, _source_file: filename };
  if (slot === 'admission_note') {
    return { admission_note: { ...stub, chief_complaint: text.slice(0, 400), present_illness: text, anchor: anchorOf(doc, page, bb, 0.88, '入院记录') } };
  }
  if (slot === 'progress_notes') {
    return { progress_notes: [{ date: '', type: 'OCR导入', text, _source_file: filename, anchor: anchorOf(doc, page, bb, 0.88, '病程') }] };
  }
  if (slot === 'discharge_summary') {
    return { discharge_summary: { ...stub, hospital_course: text, anchor: anchorOf(doc, page, bb, 0.88, '出院小结') } };
  }
  return { [slot]: { ...stub, text, anchor: anchorOf(doc, page, bb, 0.85, slot) } };
}

async function mapLayoutToFragment(layout, slot, filename) {
  const meta = {
    engine: layout.engine,
    page_count: layout.page_count,
    filename,
    parsed_at: new Date().toISOString(),
  };

  if (slot === 'fee_list' || slot === 'unknown') {
    const fee = extractFeeListFromLayout(layout, filename);
    if (fee?.fee_list?.items?.length) {
      return { fragment: fee, layout_meta: meta, slotUsed: 'fee_list' };
    }
  }

  const text = layout.plain_text || layout.markdown || '';
  if (text.length >= 20) {
    const effectiveSlot = slot === 'unknown' ? 'admission_note' : slot;
    const llmFrag = await structureTextWithLLM(text, effectiveSlot, filename);
    if (llmFrag) {
      return { fragment: llmFrag, layout_meta: meta, slotUsed: effectiveSlot, structured_by: 'llm' };
    }
    return { fragment: textFragmentForSlot(text, effectiveSlot, filename, layout), layout_meta: meta, slotUsed: effectiveSlot };
  }

  return { fragment: null, layout_meta: meta, slotUsed: slot, error: '未能从 layout 提取有效内容' };
}

module.exports = {
  mapLayoutToFragment,
  extractFeeListFromLayout,
  anchorOf,
};
