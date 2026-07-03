/**
 * 两库标准知识点 PDF 解析（第九批等：序号+药品通用名+检出逻辑+逻辑依据）
 * 与 xlsx-liangku 同颗粒度、同 ref_id 规则。
 */
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { refIdLiangkuStable, slugPart } from '../lib/normalize.mjs';
import { isJunkPolicyText } from '../lib/quality.mjs';

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '../package.json'));
const pdfParse = require('pdf-parse');

const DEFAULT_LOGIC = '使用了该药品，但没有一线药品使用无效或不能耐受的证据。';

function categoryFromText(text, meta = {}) {
  const head = text.slice(0, 500);
  const m = head.match(/[第]?([\u4e00-\u9fa8]+批)?[""]([^""]+)[""]/);
  if (m) return m[2].trim();
  const m2 = head.match(/(药品限\w+|医疗服务项目\w+|中药饮片\w+|手术项目\w+)/);
  if (m2) return m2[1];
  if (meta.batch) return meta.batch;
  return '两库知识点';
}

/** 扁平化后按「序号+药名+检出逻辑」切块（适配 pdf-parse 换行） */
function parseDrugRows(flat, category) {
  const policies = [];
  const re = new RegExp(
    '(\\d{1,4})' +
    '([\\u4e00-\\u9fa5][\\u4e00-\\u9fa5A-Za-z0-9（）()±+\\-·\\s]{1,48}?' +
    '(?:片|胶囊|注射液|颗粒|丸|散|膏|栓|滴|液|酶|单抗|索|苷|剂|乳|贴|雾|粉|锭|胶|浓溶液|干混悬剂|缓释片|肠溶片|分散片))' +
    '(使用了该药品[^\\d]{8,120}?)' +
    '(限[：:][^\\d]{4,800}?)' +
    '(\\d{1,4})',
    'g',
  );
  let m;
  while ((m = re.exec(flat)) !== null) {
    const [, seq, rawName, logicPart, basisPart] = m;
    const name = rawName.replace(/\s+/g, '').trim();
    const logic = (logicPart || DEFAULT_LOGIC).replace(/\s+/g, '').slice(0, 200);
    const basis = (basisPart || '').replace(/\s+/g, ' ').trim().slice(0, 1500);
    const text = [name, logic, basis].filter(Boolean).join(' · ');
    if (isJunkPolicyText(text)) continue;
    policies.push(buildPolicy({ category, name, logic, basis, seq, text, filePath: null }));
  }
  return policies;
}

function buildPolicy({ category, name, logic, basis, seq, text, filePath, meta = {} }) {
  const refId = refIdLiangkuStable(category, name, seq);
  return {
    doc_id: 'KB1-两库2025',
    ref_id: refId,
    layer: '规则',
    authority: '国家医疗保障局',
    doc_no: meta.docNo || null,
    doc_name: meta.title || meta.doc_name || '智能监管规则库、知识库',
    effective_from: meta.publishDate || null,
    effective_to: null,
    region: '全国',
    unit_type: '知识点',
    locator: category,
    text: text.slice(0, 2000),
    violation_tags: [],
    linked_rules: [],
    source_url: meta.sourceUrl || meta.articleUrl,
    verify_status: '✅爬虫入库(待人工抽检)',
    metadata: {
      crawl_source: 'liangku-pdf',
      batch: slugPart(meta.batch || meta.title || category, 16),
      rule_category: category,
      item_name: name,
      row_seq: Number(seq),
      content_key: `${slugPart(category, 20)}|${slugPart(name, 24)}|${seq}`,
      detect_logic: logic,
      payment_basis: basis,
      drug_codes: [],
      attachment: filePath,
    },
  };
}

export async function parseLiangkuPdf(filePath, meta = {}) {
  if (!fs.existsSync(filePath)) return { policies: [], problemDomains: [], stats: {} };
  const data = await pdfParse(fs.readFileSync(filePath));
  const category = categoryFromText(data.text, meta);
  const flat = data.text.replace(/\s+/g, '');
  let policies = parseDrugRows(flat, category);
  // 第二批手术折价走专用脚本，此处跳过
  if (/手术项目未按规定折价/.test(flat)) {
    return { policies: [], problemDomains: [], stats: { skipped: 'surgery-batch2' } };
  }
  policies = policies.map((p) => ({ ...p, metadata: { ...p.metadata, attachment: filePath } }));
  return {
    policies,
    problemDomains: [],
    stats: { liangku_rows: policies.length, pages: data.numpages, category },
  };
}

export function parseLiangkuPdfFromFile(filePath, meta) {
  return parseLiangkuPdf(filePath, meta);
}
