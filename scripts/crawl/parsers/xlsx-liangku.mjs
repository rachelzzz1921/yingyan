import XLSX from 'xlsx';
import fs from 'fs';
import { refIdLiangkuStable, slugPart } from '../lib/normalize.mjs';
import { isJunkPolicyText } from '../lib/quality.mjs';

function ruleCategoryFromSheet(sheetName) {
  const m = sheetName.match(/[""]([^""]+)[""]/);
  if (m) return m[1].trim();
  return sheetName.replace(/规则对应知识点明细|知识点对应药品代码|知识点对应药品明细/g, '').trim() || sheetName;
}

const HEADER_HINTS = [
  '药品通用名', '通用名', '项目名称', '规则名称', '知识点名称', '知识点',
  '检出逻辑', '限定条件', '逻辑依据', '政策依据', '文件依据',
  '药品代码', '医保编码', '项目代码', '备注', '限定性别', '序号',
  '项目A名称', '项目B名称', '时间区间', '中药饮片名称', '中药饮片代码',
];

function headerScore(cells) {
  let n = 0;
  for (const h of HEADER_HINTS) {
    if (cells.some((c) => c.includes(h))) n++;
  }
  return n;
}

function findHeaderRow(rows) {
  let best = null;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const cells = row.map((c) => String(c).trim());
    const hasName = cells.some((c) => /药品通用名|通用名|项目名称|规则名称|知识点名称|项目A名称|中药饮片名称/.test(c));
    const score = headerScore(cells);
    if (hasName && score >= 2 && (!best || score > best.score)) {
      best = { headerIdx: i, headers: cells, score };
    }
  }
  return best;
}

function sheetToObjects(wb, sheetName) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
  const hdr = findHeaderRow(rows);
  if (!hdr) return { category: ruleCategoryFromSheet(sheetName), rows: [] };
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
  return { category: ruleCategoryFromSheet(sheetName), rows: dataRows };
}

function pickField(row, candidates, { exclude = [] } = {}) {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const hit = keys.find((k) => k.includes(c) && !exclude.some((ex) => k.includes(ex)));
    if (hit && row[hit] != null && String(row[hit]).trim()) return String(row[hit]).trim();
  }
  return '';
}

function pickSerial(row) {
  const v = pickField(row, ['序号', '对应知识点序号']);
  if (!v) return '';
  const n = String(v).replace(/\D/g, '');
  return n || '';
}

function pickDrugCodes(row) {
  const keys = Object.keys(row);
  const hit = keys.find((k) => /药品代码|医保编码|中药饮片代码/.test(k) && !/数量/.test(k));
  if (!hit) return [];
  const v = String(row[hit] ?? '').trim();
  if (!v || /^\d+$/.test(v)) return [];
  return [v];
}

/** 解析「知识点对应药品代码」sheet，按 对应知识点序号|药品通用名 聚合编码 */
function buildCodeMap(wb) {
  const map = new Map();
  for (const name of wb.SheetNames) {
    if (!/药品代码|编码/.test(name) || /知识点明细/.test(name)) continue;
    const { rows } = sheetToObjects(wb, name);
    let lastSeq = '';
    let lastDrug = '';
    for (const row of rows) {
      const seq = pickSerial(row) || lastSeq;
      const drug = pickField(row, ['药品通用名', '通用名', '项目名称', '名称']) || lastDrug;
      const codes = pickDrugCodes(row);
      if (seq) lastSeq = seq;
      if (drug) lastDrug = drug;
      if (!codes.length || !lastSeq) continue;
      const key = `${lastSeq}|${lastDrug}`;
      const prev = map.get(key) || [];
      map.set(key, [...new Set([...prev, ...codes])]);
    }
  }
  return map;
}

function formatPolicyText({ name, logic, basis, codes }) {
  const parts = [name, logic, basis].filter(Boolean);
  if (codes?.length) {
    const preview = codes.slice(0, 8).join('、');
    parts.push(`医保编码(${codes.length}): ${preview}${codes.length > 8 ? '…' : ''}`);
  }
  return parts.join(' · ').slice(0, 2000);
}

function readLiangkuWorkbook(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const codeMap = buildCodeMap(wb);
  const detailSheets = [];
  for (const name of wb.SheetNames) {
    if (/药品代码|编码/.test(name) && !/知识点明细/.test(name)) continue;
    if (!/知识点|规则/.test(name)) continue;
    const parsed = sheetToObjects(wb, name);
    if (parsed.rows.length) detailSheets.push({ name, ...parsed });
  }
  return { detailSheets, codeMap };
}

export function parseLiangkuXlsx(filePath, meta = {}) {
  const { detailSheets, codeMap } = readLiangkuWorkbook(filePath);
  const batch = slugPart(meta.batch || meta.title || '批次', 16);
  const policies = [];
  let rejected = 0;

  for (const { category, rows } of detailSheets) {
    for (const row of rows) {
      // 成对项目结构（如第七批「医疗服务项目重复收费」：项目A + 项目B 不得同时收费）
      const itemA = pickField(row, ['项目A名称']);
      const itemB = pickField(row, ['项目B名称']);
      if (itemA && itemB) {
        const period = pickField(row, ['时间区间']);
        const logic = pickField(row, ['检出逻辑']);
        const basis = pickField(row, ['逻辑依据']);
        const codeA = pickField(row, ['项目A代码']);
        const codeB = pickField(row, ['项目B代码']);
        const rowSeq = pickSerial(row);
        const pairName = `${itemA}×${itemB}`;
        const text = [
          pairName,
          period ? `时间区间:${period}` : '',
          logic,
          basis,
          codeA && codeB ? `代码: ${codeA} / ${codeB}` : '',
        ].filter(Boolean).join(' · ').slice(0, 2000);
        if (isJunkPolicyText(text)) { rejected++; continue; }
        const refId = refIdLiangkuStable(category, pairName, rowSeq || policies.length + 1);
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
          locator: category,
          text,
          violation_tags: [],
          linked_rules: [],
          source_url: meta.sourceUrl || meta.articleUrl,
          verify_status: '✅爬虫入库(待人工抽检)',
          metadata: {
            crawl_source: 'liangku-col109',
            batch,
            rule_category: category,
            item_name: pairName,
            item_a: itemA,
            item_b: itemB,
            item_a_code: codeA || null,
            item_b_code: codeB || null,
            period: period || null,
            row_seq: rowSeq ? Number(rowSeq) : null,
            content_key: `${slugPart(category, 20)}|${slugPart(pairName, 24)}|${rowSeq || '0'}`,
            detect_logic: logic || null,
            payment_basis: basis || null,
            drug_codes: [codeA, codeB].filter(Boolean),
            drug_or_item_code: codeA || null,
            attachment: filePath,
          },
        });
        continue;
      }

      const name = pickField(row, ['药品通用名', '中药饮片名称', '规则名称', '知识点名称', '名称', '项目名称', '通用名']);
      const logic = pickField(row, ['检出逻辑', '限定条件', '逻辑']);
      const basis = pickField(row, ['逻辑依据', '政策依据', '依据', '文件依据', '药品说明书']);
      const detail = pickField(row, ['知识点', '规则内容', '内容', '明细', '备注', '限定性别']);
      const rowSeq = pickSerial(row);
      const codeCount = pickField(row, ['知识点对应药品代码数量', '药品代码数量'], { exclude: [] });

      if (!name && !logic && !detail) continue;

      const codeKey = `${rowSeq}|${name}`;
      const codes = codeMap.get(codeKey) || pickDrugCodes(row);
      const paymentBasis = basis || detail;

      const text = formatPolicyText({ name, logic, basis: paymentBasis, codes });
      if (isJunkPolicyText(text)) { rejected++; continue; }

      const refId = refIdLiangkuStable(category, name || logic || detail, rowSeq || policies.length + 1);
      const contentKey = `${slugPart(category, 20)}|${slugPart(name, 24)}|${rowSeq || '0'}`;

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
        locator: category || name,
        text,
        violation_tags: [],
        linked_rules: [],
        source_url: meta.sourceUrl || meta.articleUrl,
        verify_status: '✅爬虫入库(待人工抽检)',
        metadata: {
          crawl_source: 'liangku-col109',
          batch,
          rule_category: category,
          item_name: name,
          row_seq: rowSeq ? Number(rowSeq) : null,
          content_key: contentKey,
          detect_logic: logic || null,
          payment_basis: paymentBasis || null,
          drug_codes: codes,
          drug_or_item_code: codes[0] || null,
          code_count: codes.length || (codeCount ? Number(codeCount) : null),
          attachment: filePath,
        },
      });
    }
  }

  return {
    policies,
    problemDomains: [],
    stats: { liangku_rows: policies.length, sheets: detailSheets.length, quality_rejected: rejected },
  };
}

export function parseLiangkuFromFile(filePath, meta) {
  if (!fs.existsSync(filePath)) return { policies: [], problemDomains: [], stats: {} };
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (ext === 'xlsx' || ext === 'xls') return parseLiangkuXlsx(filePath, meta);
  return { policies: [], problemDomains: [], stats: { skipped: ext } };
}
