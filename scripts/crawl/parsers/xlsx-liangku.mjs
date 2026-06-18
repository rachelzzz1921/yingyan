import XLSX from 'xlsx';
import fs from 'fs';
import { refIdLiangku, slugPart } from '../lib/normalize.mjs';

function ruleCategoryFromSheet(sheetName) {
  const m = sheetName.match(/[""]([^""]+)[""]/);
  if (m) return m[1];
  return sheetName.replace(/规则对应知识点明细|知识点对应药品代码/g, '').trim() || sheetName;
}

function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const cells = row.map((c) => String(c).trim());
    if (cells.includes('序号') && (cells.some((c) => /药品通用名|通用名|项目名称/.test(c)))) {
      return { headerIdx: i, headers: cells };
    }
  }
  return null;
}

function readLiangkuSheets(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const out = [];
  for (const name of wb.SheetNames) {
    if (/药品代码/.test(name)) continue;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
    const hdr = findHeaderRow(rows);
    if (!hdr) continue;
    const { headerIdx, headers } = hdr;
    const dataRows = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row)) continue;
      const obj = {};
      headers.forEach((h, j) => {
        if (h) obj[h] = row[j] ?? '';
      });
      dataRows.push(obj);
    }
    out.push({ name, category: ruleCategoryFromSheet(name), rows: dataRows });
  }
  return out;
}

function pickField(row, candidates) {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const hit = keys.find((k) => k.includes(c));
    if (hit && row[hit] != null && String(row[hit]).trim()) return String(row[hit]).trim();
  }
  return '';
}

export function parseLiangkuXlsx(filePath, meta = {}) {
  const sheets = readLiangkuSheets(filePath);
  const batch = slugPart(meta.batch || meta.title || '批次', 16);
  const policies = [];
  let idx = 0;
  for (const { category, rows } of sheets) {
    for (const row of rows) {
      const name = pickField(row, ['药品通用名', '规则名称', '知识点名称', '名称', '项目名称', '通用名']);
      const code = pickField(row, ['药品代码', '医保编码', '编码', '项目代码']);
      const logic = pickField(row, ['检出逻辑', '限定条件', '逻辑']);
      const basis = pickField(row, ['逻辑依据', '政策依据', '依据', '文件依据', '药品说明书']);
      const detail = pickField(row, ['知识点', '规则内容', '内容', '明细', '备注', '限定性别']);
      const textParts = [name, logic, detail, basis, code].filter(Boolean);
      if (!textParts.length) continue;
      if (!name && !logic && !detail) continue;
      idx++;
      const refId = refIdLiangku(batch, category || name || '知识点', idx);
      policies.push({
        doc_id: 'KB1-两库2025',
        ref_id: refId,
        layer: '规则',
        authority: '国家医疗保障局',
        doc_no: meta.docNo || null,
        doc_name: meta.title || '智能监管规则库、知识库（分批公开）',
        effective_from: meta.publishDate || null,
        effective_to: null,
        region: '全国',
        unit_type: '知识点',
        locator: category || name || `行${idx}`,
        text: textParts.join(' · ').slice(0, 2000),
        violation_tags: [],
        linked_rules: [],
        source_url: meta.sourceUrl || meta.articleUrl,
        verify_status: '✅爬虫入库(待人工抽检)',
        metadata: {
          crawl_source: 'liangku-col109',
          batch,
          rule_category: category,
          drug_or_item_code: code,
          attachment: filePath,
        },
      });
    }
  }
  return { policies, problemDomains: [], stats: { liangku_rows: idx, sheets: sheets.length } };
}

export function parseLiangkuFromFile(filePath, meta) {
  if (!fs.existsSync(filePath)) return { policies: [], problemDomains: [], stats: {} };
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (ext === 'xlsx' || ext === 'xls') return parseLiangkuXlsx(filePath, meta);
  return { policies: [], problemDomains: [], stats: { skipped: ext } };
}
