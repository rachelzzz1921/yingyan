import {
  extractDocNo,
  extractEffectiveDate,
  refIdArticle,
  stripHtmlText,
} from '../lib/normalize.mjs';

const ARTICLE_RE = /第([一二三四五六七八九十百零〇\d]+)条\s*([\s\S]*?)(?=第[一二三四五六七八九十百零〇\d]+条|$)/g;

const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

function cnToInt(s) {
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  if (s.length === 1 && CN_NUM[s]) return CN_NUM[s];
  if (s.startsWith('十')) {
    const rest = s.slice(1);
    return 10 + (CN_NUM[rest] || 0);
  }
  if (s.includes('十')) {
    const [a, b] = s.split('十');
    return (CN_NUM[a] || 0) * 10 + (CN_NUM[b] || 0);
  }
  return null;
}

export function parseArticle(article, seed) {
  const text = article.text || stripHtmlText(article.bodyHtml || '');
  const docId = seed.doc_id || 'KB1-政策';
  const docName = seed.doc_name || article.title;
  const docNo = seed.doc_no || article.docNo || extractDocNo(text);
  const effectiveFrom = seed.effective_from || extractEffectiveDate(text) || article.publishDate;
  const entries = [];
  const seen = new Set();

  let m;
  while ((m = ARTICLE_RE.exec(text)) !== null) {
    const numRaw = m[1];
    const body = m[2].replace(/\s+/g, ' ').trim();
    if (!body || body.length < 8) continue;
    const num = cnToInt(numRaw);
    if (!num) continue;
    const refId = refIdArticle(docId, num);
    if (seen.has(refId)) continue;
    seen.add(refId);
    entries.push({
      doc_id: docId,
      ref_id: refId,
      layer: '法规',
      authority: '国家医疗保障局',
      doc_no: docNo,
      doc_name: docName,
      effective_from: effectiveFrom,
      effective_to: null,
      region: '全国',
      unit_type: '条款',
      locator: `第${num}条`,
      text: body.slice(0, 2000),
      violation_tags: [],
      linked_rules: [],
      source_url: article.url,
      verify_status: '✅爬虫入库(待人工抽检)',
      metadata: { crawl_source: seed.id, publish_date: article.publishDate },
    });
  }

  if (!entries.length && text.length > 100) {
    entries.push({
      doc_id: docId,
      ref_id: `${docId}-全文摘要`,
      layer: '法规',
      authority: '国家医疗保障局',
      doc_no: docNo,
      doc_name: docName,
      effective_from: effectiveFrom,
      effective_to: null,
      region: '全国',
      unit_type: '全文摘要',
      locator: '全文',
      text: text.slice(0, 4000),
      violation_tags: [],
      linked_rules: [],
      source_url: article.url,
      verify_status: '✅爬虫入库(待人工抽检)',
      metadata: { crawl_source: seed.id, note: '未切分出条款，存摘要' },
    });
  }

  return { policies: entries, problemDomains: [], stats: { articles: entries.length } };
}
