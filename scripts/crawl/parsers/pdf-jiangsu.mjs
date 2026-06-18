import fs from 'fs';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import { drugRowsToPolicies, extractDrugRowsFromText } from './catalog-row.mjs';

export async function parsePdfJiangsuDrug(filePath, meta = {}) {
  if (!fs.existsSync(filePath)) return { policies: [], problemDomains: [], stats: {} };
  const buf = fs.readFileSync(filePath);
  let text = '';
  try {
    text = (await pdf(buf)).text || '';
  } catch (e) {
    return { policies: [], problemDomains: [], stats: { error: e.message, parse_status: '待OCR' } };
  }
  const rows = extractDrugRowsFromText(text, { demoOnly: true });
  const policies = drugRowsToPolicies(rows, {
    ...meta,
    doc_id: 'KB1-江苏',
    authority: '江苏省医保局',
    region: '江苏省',
    crawl_source: 'jiangsu-drug-pdf',
    attachment: filePath,
  }).map((p) => ({
    ...p,
    ref_id: p.metadata.drug_code
      ? `KB1-江苏-药品目录-${p.metadata.drug_code}`
      : p.ref_id.replace('KB1-目录2025', 'KB1-江苏-药品目录'),
  }));
  return { policies, problemDomains: [], stats: { jiangsu_drug_rows: policies.length } };
}
