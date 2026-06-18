import { parseArticle } from './article.mjs';
import { stripHtmlText } from '../lib/normalize.mjs';
import { slugPart } from '../lib/normalize.mjs';

export function parseHtmlJiangsu(article, seed = {}) {
  const text = article.text || stripHtmlText(article.bodyHtml || '');
  if (text.length < 30) return { policies: [], problemDomains: [], stats: {} };
  const refId = `KB1-江苏-${slugPart(article.title || seed.name, 20)}`;
  return {
    policies: [{
      doc_id: 'KB1-江苏',
      ref_id: refId,
      layer: '目录',
      authority: '江苏省医保局',
      doc_name: article.title || seed.name,
      effective_from: article.publishDate || null,
      region: '江苏省',
      unit_type: '通知摘要',
      locator: article.title?.slice(0, 40),
      text: text.slice(0, 2000),
      source_url: article.url,
      verify_status: '✅爬虫入库(待人工抽检)',
      metadata: { crawl_source: seed.id || 'jiangsu-html' },
    }],
    problemDomains: [],
    stats: { jiangsu_html: 1 },
  };
}

export { parseArticle };
