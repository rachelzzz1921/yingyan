import fs from 'fs';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import { slugPart } from '../lib/normalize.mjs';

export async function parsePdfCode(filePath, meta = {}) {
  if (!fs.existsSync(filePath)) return { policies: [], problemDomains: [], stats: {} };
  const buf = fs.readFileSync(filePath);
  let text = '';
  try {
    text = (await pdf(buf)).text || '';
  } catch (e) {
    return { policies: [], problemDomains: [], stats: { error: e.message, parse_status: '待OCR' } };
  }
  const policies = [];
  const lines = text.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 6 && l.length < 200);
  let idx = 0;
  for (const line of lines) {
    const codeM = line.match(/[A-Z]{1,2}[A-Z0-9]{10,}/);
    if (!codeM) continue;
    const nameM = line.match(/[\u4e00-\u9fa5]{2,24}/);
    idx++;
    if (idx > 80) break;
    policies.push({
      doc_id: 'KB1-耗材编码',
      ref_id: `KB1-编码-${meta.sysflag || 'batch'}-${codeM[0]}`,
      layer: '目录',
      authority: '国家医疗保障局',
      doc_name: meta.title || `医保编码维护批次${meta.sysflag || ''}`,
      region: '全国',
      unit_type: '编码行',
      locator: codeM[0],
      text: [nameM?.[0], codeM[0], line.slice(0, 120)].filter(Boolean).join(' · '),
      source_url: meta.sourceUrl,
      verify_status: '✅爬虫入库(待人工抽检)',
      metadata: {
        crawl_source: 'code-nhsa',
        sysflag: meta.sysflag,
        attachment: filePath,
        parse_status: 'pdf-text',
      },
    });
  }
  if (!policies.length) {
    policies.push({
      doc_id: 'KB1-耗材编码',
      ref_id: `KB1-编码-${meta.sysflag || 'batch'}-摘要`,
      layer: '目录',
      authority: '国家医疗保障局',
      doc_name: meta.title || '贯标平台PDF',
      region: '全国',
      unit_type: '批次说明',
      locator: `sysflag-${meta.sysflag}`,
      text: text.slice(0, 2000),
      source_url: meta.sourceUrl,
      verify_status: '✅爬虫入库(待人工抽检)',
      metadata: { crawl_source: 'code-nhsa', sysflag: meta.sysflag, parse_status: 'pdf-text-summary' },
    });
  }
  return { policies, problemDomains: [], stats: { code_rows: policies.length } };
}
