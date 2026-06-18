import fs from 'fs';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import { slugPart } from '../lib/normalize.mjs';

const NURSING_KW = ['特级护理', '一级护理', '二级护理', '三级护理', '专科护理', '专项护理'];

export async function parsePdfJiangsuNursing(filePath, meta = {}) {
  if (!fs.existsSync(filePath)) return { policies: [], problemDomains: [], stats: {} };
  const buf = fs.readFileSync(filePath);
  let text = '';
  try {
    text = (await pdf(buf)).text || '';
  } catch (e) {
    return { policies: [], problemDomains: [], stats: { error: e.message } };
  }
  const policies = [];
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  let idx = 0;
  for (const line of lines) {
    const hit = NURSING_KW.find((k) => line.includes(k));
    if (!hit) continue;
    const priceM = line.match(/(\d+(?:\.\d+)?)\s*元/);
    idx++;
    policies.push({
      doc_id: meta.doc_id || 'KB1-江苏-护理价格2025',
      ref_id: `KB1-江苏-护理价格2025-${slugPart(hit, 8)}`,
      layer: '目录',
      authority: '江苏省医保局',
      doc_no: '苏医保发〔2025〕20号',
      doc_name: meta.title || '护理类医疗服务价格项目整合',
      effective_from: '2025-07-01',
      region: '江苏省',
      unit_type: '价格项目',
      locator: hit,
      text: [hit, priceM && `价格:${priceM[1]}元`, line.slice(0, 200)].filter(Boolean).join(' · '),
      source_url: meta.articleUrl || meta.sourceUrl,
      verify_status: '✅爬虫入库(待人工抽检)',
      metadata: { crawl_source: 'suzhou-nursing-pdf', attachment: filePath },
    });
  }
  if (!policies.length && text.length > 100) {
    policies.push({
      doc_id: 'KB1-江苏-护理价格2025',
      ref_id: 'KB1-江苏-护理价格2025-PDF摘要',
      layer: '目录',
      authority: '江苏省医保局',
      doc_no: '苏医保发〔2025〕20号',
      doc_name: '护理类价格整合PDF摘要',
      region: '江苏省',
      unit_type: '批次说明',
      locator: 'PDF摘要',
      text: text.slice(0, 2000),
      source_url: meta.articleUrl,
      verify_status: '✅爬虫入库(待人工抽检)',
      metadata: { crawl_source: 'suzhou-nursing-pdf', parse_status: 'pdf-text-summary' },
    });
  }
  return { policies, problemDomains: [], stats: { nursing_rows: policies.length } };
}
