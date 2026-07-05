'use strict';

/**
 * 插件靶站 · PDF/图片 → 可导入表格（复用 intake L1，不写 uploaded 案卷）
 */
const { parseIntakeFile } = require('./intake-batch');

const FEE_HEADERS = ['序号', '项目名称', '数量', '金额', '结算日期', '追溯码', '费用类别'];

const JUNK_NAME = /^(姓名|住院号|医保类型|序号|本院信息|住院费用明细|查询时间|操作员)/;
const JUNK_INLINE = /只读查询|无导出权限|未经授权|仅供院内查询|演示患者|操作员\s*\d|查询时间\s*\d{4}/;

function normalizeFeeItem(it) {
  let qty = Number(it.qty) || 1;
  let amount = Number(it.amount) || 0;
  if (qty > 80 && amount > 0 && amount < 80 && qty / amount >= 3) {
    const tmp = qty;
    qty = amount;
    amount = tmp;
  }
  return { ...it, qty, amount };
}

function sanitizeFeeItems(items) {
  const seen = new Set();
  const out = [];
  for (const raw of items || []) {
    const it = normalizeFeeItem(raw);
    const name = String(it.item_name || '').trim();
    const amount = Number(it.amount) || 0;
    if (!name || amount <= 0) continue;
    if (name.length > 48) continue;
    if (JUNK_NAME.test(name) || JUNK_INLINE.test(name)) continue;
    const key = name + '|' + amount + '|' + (it.fee_date || '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out.map((it, i) => ({ ...it, line_no: i + 1 }));
}

function feeItemsToTable(items) {
  const clean = sanitizeFeeItems(items);
  const rows = clean.map((it) => ({
    序号: String(it.line_no != null ? it.line_no : ''),
    项目名称: it.item_name || '',
    数量: String(it.qty != null ? it.qty : 1),
    金额: String(it.amount != null ? it.amount : 0),
    结算日期: it.fee_date || '',
    追溯码: it.trace_code || '',
    费用类别: it.category || '',
  })).filter((r) => r.项目名称);
  return { headers: FEE_HEADERS, rows, sep: '\t' };
}

function tableFromIntakeFragment(fragment) {
  const items = fragment?.fee_list?.items;
  if (items?.length) return feeItemsToTable(items);
  return null;
}

async function parsePluginTableFile({ name, mime, fileBase64, slot = 'fee_list' }) {
  const r = await parseIntakeFile({
    name,
    mime,
    fileBase64,
    slotOverride: slot,
  });
  if (!r.ok) {
    return {
      ok: false,
      error: r.error || '解析失败',
      log: r.log,
      hint: /pdf/i.test(mime || '') || /\.pdf$/i.test(name || '')
        ? 'PDF 需 L1 解析服务：bash prototype/ppstructure/run.sh，或部署 PPSTRUCTURE_URL'
        : '可改用 CSV/Excel 另存，或前往材料导入中心',
    };
  }
  const table = tableFromIntakeFragment(r.fragment);
  if (!table?.rows?.length) {
    return {
      ok: false,
      error: '未能从文件中识别费用表格行',
      log: r.log,
      classification: r.classification,
      hint: '请确认文件含「项目名称/金额」列，或改用 CSV/Excel',
    };
  }
  return {
    ok: true,
    table,
    classification: r.classification,
    log: r.log,
    engine: r.layout?.engine || r.fileMeta?.engine,
    row_count: table.rows.length,
  };
}

module.exports = { parsePluginTableFile, feeItemsToTable, tableFromIntakeFragment, sanitizeFeeItems };
