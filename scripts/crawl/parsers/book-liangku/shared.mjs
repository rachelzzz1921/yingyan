import path from 'path';
import { fileURLToPath } from 'url';
import { refIdLiangkuStable, slugPart } from '../../lib/normalize.mjs';
import { isJunkPolicyText } from '../../lib/quality.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
export const BOOK = path.join(ROOT, 'public-data-corpus/raw/mail-liangku/医疗保障基金智能监管规则库、知识库（2025年版）-1.pdf');
/** 真节标题：明细后紧跟「序号」；目录页为「明细……页码」不含序号 */
export const SEC_RE = /[\u201c"]?([\u4e00-\u9fa5（）()、·\-\s]{4,28})[\u201d"]规则对应知识点明细序号/g;

const JUNK_NAME = /^(男|女)与限定性别不符$|^使用了该药品|^参保人|^完善创新|^合计|^序号药品|使用了该药品|注射液|规则库|知识库|年版|第二部分|第一部分/;

export function isValidSectionName(name) {
  const n = String(name || '').trim();
  if (!n || n.length > 32 || n.length < 4) return false;
  if (/^\d/.test(n) || /\d{3,}/.test(n)) return false;
  if (JUNK_NAME.test(n)) return false;
  if (/[A-Za-z]{5,}/.test(n) && !/ICD|H2|DRG|DIP|HIV|HPV/.test(n)) return false;
  return /^[\u4e00-\u9fa5（）()、·\-\s\dA-Za-z]+$/u.test(n);
}

export function stripSectionHeader(chunk) {
  return String(chunk || '').replace(/^[\s\S]*?规则对应知识点明细序号/, '');
}

export function isTocChunk(chunk) {
  const body = stripSectionHeader(chunk);
  const head = body.slice(0, 160);
  if (/^\.{8,}/.test(head)) return true;
  if (/^\.+\d{1,4}/.test(head)) return true;
  if (/^目录|第一部分智能监管|第二部分智能监管规则列表/.test(head)) return true;
  if (/序号一级分类二级分类规则名称/.test(head.slice(0, 80))) return true;
  return false;
}

export function trailingEncodingCount(tail) {
  const m = String(tail || '').match(/(?:知识点对应(?:药品|耗材|项目)?代码数量)?(\d{1,6})$/);
  return m ? Number(m[1]) : null;
}

export function buildPolicy({ category, name, logic, basis, seq, text, code, encodingCount, meta, extraMeta = {} }) {
  const refId = refIdLiangkuStable(category, name, seq);
  return {
    doc_id: 'KB1-两库2025',
    ref_id: refId,
    layer: '规则',
    authority: '国家医疗保障局',
    doc_name: '医疗保障基金智能监管规则库、知识库（2025年版）',
    effective_from: '2026-02-12',
    region: '全国',
    unit_type: '知识点',
    locator: category,
    text: text.slice(0, 2000),
    violation_tags: [],
    linked_rules: [],
    source_url: meta?.sourceUrl || 'book-2025-pdf',
    verify_status: '✅爬虫入库(待人工抽检)',
    metadata: {
      crawl_source: 'liangku-book-2025',
      batch: '2025全书',
      rule_category: category,
      item_name: name,
      row_seq: Number(seq),
      content_key: `${slugPart(category, 20)}|${slugPart(name, 24)}|${seq}`,
      detect_logic: logic || null,
      payment_basis: basis || null,
      drug_codes: code ? [code] : [],
      encoding_count: encodingCount ?? null,
      attachment: BOOK,
      ...extraMeta,
    },
  };
}

export function pushPolicy(policies, row) {
  if (isJunkPolicyText(row.text)) return;
  policies.push(row);
}

export function extractSections(flat, scoreFn) {
  const hits = [...flat.matchAll(SEC_RE)]
    .map((m) => ({ cat: m[1].trim(), idx: m.index }))
    .filter((h) => isValidSectionName(h.cat));

  const candidates = new Map();
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].idx;
    const end = i + 1 < hits.length ? hits[i + 1].idx : flat.length;
    const chunk = flat.slice(start, end);
    if (isTocChunk(chunk)) continue;
    const prev = candidates.get(hits[i].cat) || [];
    prev.push({ cat: hits[i].cat, chunk, len: chunk.length });
    candidates.set(hits[i].cat, prev);
  }

  const sections = [];
  for (const [cat, list] of candidates) {
    let best = list[0];
    let bestScore = -1;
    for (const item of list) {
      const score = scoreFn ? scoreFn(item.chunk, cat) : item.len;
      if (score > bestScore) {
        best = item;
        bestScore = score;
      }
    }
    if (bestScore > 0) sections.push(best);
  }
  return sections;
}
