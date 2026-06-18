import { slugPart, stripHtmlText } from '../lib/normalize.mjs';

const VIOLATION_KW = [
  '串换', '套刷', '虚记', '分解住院', '挂床', '冒名', '倒卖', '骗保', '超量开药',
  '重复收费', '过度诊疗', '诱导住院', '盗刷', '套现', '伪造', '冒用',
];
const INSTITUTION_KW = [
  ['定点零售药店', /药店|药房/],
  ['定点医疗机构', /医院|卫生院|诊所|中心/],
  ['企业', /公司|企业/],
];

function detectInstitution(text) {
  for (const [label, re] of INSTITUTION_KW) {
    if (re.test(text)) return label;
  }
  if (/药店|药房/.test(text)) return '定点零售药店';
  if (/医院|卫生院/.test(text)) return '定点医疗机构';
  return '医药机构';
}

function detectViolations(text) {
  return VIOLATION_KW.filter((k) => text.includes(k));
}

function extractPunishment(text) {
  const m = text.match(/(追回|拒付|罚款|解除协议|移送|刑事|行政处罚)[^\n。]{0,80}/);
  return m ? m[0].trim() : '';
}

function extractAmount(text) {
  const m = text.match(/(\d+(?:\.\d+)?)\s*万元/);
  return m ? `${m[1]}万元` : null;
}

function splitCases(text) {
  const parts = text.split(/(?=案例[一二三四五六七八九十\d]+)/).filter((p) => p.trim().length > 40);
  if (parts.length > 1) return parts;
  return [text];
}

function dateSlug(publishDate, url) {
  if (publishDate) return publishDate.replace(/-/g, '');
  const m = url?.match(/art\/(\d{4})\/(\d{1,2})\/(\d{1,2})\//);
  if (m) return `${m[1]}${String(m[2]).padStart(2, '0')}${String(m[3]).padStart(2, '0')}`;
  return 'unknown';
}

export function parseCaseExposure(article, seed = {}) {
  const text = (article.text || stripHtmlText(article.bodyHtml || ''))
    .replace(/^begin-->/, '')
    .trim();
  const title = article.title || seed.name || '曝光台案例';
  const dateKey = dateSlug(article.publishDate, article.url);
  const chunks = splitCases(text);
  const policies = [];

  chunks.forEach((chunk, i) => {
    const head = chunk.match(/案例([一二三四五六七八九十\d]+)/);
    const caseNo = head?.[1] || String(i + 1);
    const body = chunk.replace(/案例[一二三四五六七八九十\d]+[^\n]*/g, '').trim();
    if (body.length < 30) return;
    const institution = detectInstitution(body);
    const violations = detectViolations(body);
    const punishment = extractPunishment(body);
    const amount = extractAmount(body);
    const refId = `KB1-曝光台-${dateKey}-${slugPart(caseNo, 4)}`;
    policies.push({
      doc_id: 'KB1-曝光台',
      ref_id: refId,
      layer: '案例',
      authority: '国家医疗保障局',
      doc_name: title,
      effective_from: article.publishDate || null,
      effective_to: null,
      region: '全国',
      unit_type: '典型案例',
      locator: `案例${caseNo}`,
      text: body.slice(0, 2000),
      violation_tags: violations,
      linked_rules: [],
      source_url: article.url,
      verify_status: '✅爬虫入库(待人工抽检)',
      metadata: {
        crawl_source: seed.id || 'exposure',
        case_no: caseNo,
        institution_type: institution,
        violation_methods: violations,
        punishment,
        amount,
        parent_title: title,
      },
    });
  });

  if (!policies.length && text.length > 50) {
    policies.push({
      doc_id: 'KB1-曝光台',
      ref_id: `KB1-曝光台-${dateKey}-全文`,
      layer: '案例',
      authority: '国家医疗保障局',
      doc_name: title,
      region: '全国',
      unit_type: '典型案例',
      locator: '全文',
      text: text.slice(0, 2000),
      source_url: article.url,
      verify_status: '✅爬虫入库(待人工抽检)',
      metadata: { crawl_source: seed.id || 'exposure' },
    });
  }

  return { policies, problemDomains: [], stats: { exposure_cases: policies.length } };
}
