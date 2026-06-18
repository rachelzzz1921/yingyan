import fs from 'fs';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import { drugRowsToPolicies, extractDrugRowsFromText } from './catalog-row.mjs';

export async function parsePdfDrugCatalog(filePath, meta = {}) {
  if (!fs.existsSync(filePath)) return { policies: [], problemDomains: [], stats: {} };
  const buf = fs.readFileSync(filePath);
  let text = '';
  try {
    const parsed = await pdf(buf);
    text = parsed.text || '';
  } catch (e) {
    return {
      policies: [],
      problemDomains: [],
      stats: { error: e.message, parse_status: '待OCR' },
    };
  }
  const rows = extractDrugRowsFromText(text, { demoOnly: true });
  const policies = drugRowsToPolicies(rows, {
    ...meta,
    crawl_source: 'drug-catalog-2025-pdf',
    attachment: filePath,
    parse_status: rows.length ? 'pdf-text' : '待OCR',
  });
  return { policies, problemDomains: [], stats: { drug_rows: policies.length, text_len: text.length } };
}

export async function parsePdfFromFile(filePath, parser, meta) {
  if (parser === 'pdf-drug') return parsePdfDrugCatalog(filePath, meta);
  if (parser === 'pdf-jiangsu') {
    const { parsePdfJiangsuDrug } = await import('./pdf-jiangsu.mjs');
    return parsePdfJiangsuDrug(filePath, meta);
  }
  if (parser === 'pdf-jiangsu-nursing') {
    const { parsePdfJiangsuNursing } = await import('./pdf-jiangsu-nursing.mjs');
    return parsePdfJiangsuNursing(filePath, meta);
  }
  if (parser === 'pdf-code') {
    const { parsePdfCode } = await import('./pdf-code.mjs');
    return parsePdfCode(filePath, meta);
  }
  return { policies: [], problemDomains: [], stats: { skipped: parser } };
}
