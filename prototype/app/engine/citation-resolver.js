'use strict';

const path = require('path');

function refOf(entry) {
  return entry?.ref_id || entry?.kb2_id || null;
}

function buildCitationIndex(kb1, kb2) {
  const entries = [];
  const byRefId = {};
  const byDocId = {};
  const add = (entry) => {
    if (!entry) return;
    const normalized = entry.kb2_id && !entry.ref_id ? { ...entry, ref_id: entry.kb2_id } : entry;
    const ref = refOf(normalized);
    if (ref) byRefId[ref] = normalized;
    if (normalized.doc_id) byDocId[normalized.doc_id] = normalized;
    entries.push(normalized);
  };
  for (const e of kb1?.entries || []) add(e);
  for (const e of kb2?.entries || []) add(e);
  entries.sort((a, b) => String(refOf(b) || '').length - String(refOf(a) || '').length);
  return { byRefId, byDocId, entries };
}

function resolveCitation(ref, index) {
  const key = String(ref || '').trim();
  if (!key || !index) return null;
  if (index.byRefId?.[key]) return index.byRefId[key];
  if (index.byDocId?.[key]) return index.byDocId[key];
  return (index.entries || []).find(e => {
    const rid = refOf(e);
    const docId = e.doc_id;
    return (rid && (rid === key || rid.startsWith(key) || key.startsWith(rid)))
      || (docId && (docId === key || key.startsWith(docId)));
  }) || null;
}

function normalizeBatch(entry) {
  const meta = entry?.metadata || {};
  const raw = `${meta.batch || ''} ${entry?.doc_name || ''}`;
  const m = raw.match(/第([一二三四五六七八九十]{1,3})批/);
  if (m) return `国家两库·第${m[1]}批`;
  if (meta.batch === '2025全书' || meta.crawl_source === 'liangku-book-2025') return '国家两库·2025年版';
  if (entry?.doc_id === 'KB1-条例') return '《医疗保障基金使用监督管理条例》';
  return null;
}

function validUrl(url) {
  const s = String(url || '').trim();
  const m = s.match(/https?:\/\/[^\s（(]+/i);
  if (!m) return null;
  try {
    const parsed = new URL(m[0]);
    if (/\/downfile\.jsp$/i.test(parsed.pathname) && !parsed.search) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function sourceKind(entry) {
  const ref = refOf(entry) || '';
  if (ref.startsWith('KB2')) return '临床指南';
  if (entry?.doc_id === 'KB1-条例' || ref.startsWith('KB1-条例')) return '法规条款';
  if (entry?.layer === '目录') return '目录';
  if (ref.startsWith('KB1-问题清单')) return '问题清单';
  if (ref.startsWith('KB1-两库') || entry?.metadata?.crawl_source) return '两库知识点';
  return entry?.layer || '政策条目';
}

function formatCitation(entry) {
  if (!entry) return null;
  const meta = entry.metadata || {};
  const codes = Array.isArray(meta.drug_codes)
    ? meta.drug_codes.filter(Boolean)
    : [meta.drug_or_item_code, meta.item_a_code, meta.item_b_code].filter(Boolean);
  const attachment = meta.attachment ? path.basename(String(meta.attachment)) : null;
  return {
    ref: refOf(entry),
    resolved: true,
    source_kind: sourceKind(entry),
    batch_label: normalizeBatch(entry),
    rule_category: meta.rule_category || null,
    item_name: meta.item_name || null,
    seq: meta.row_seq ?? null,
    codes: [...new Set(codes)],
    doc_name: entry.doc_name || entry.source || entry.doc_id || null,
    doc_no: entry.doc_no || null,
    locator: entry.locator || null,
    authority: entry.authority || null,
    region: entry.region || null,
    effective_from: entry.effective_from || null,
    source_url: validUrl(entry.source_url),
    attachment_name: attachment,
    verify_status: entry.verify_status || null,
    linked_rules: Array.isArray(entry.linked_rules) ? entry.linked_rules : [],
  };
}

function citationLine(citation, { exam = false } = {}) {
  if (!citation) return '';
  if (!citation.resolved && !citation.synthetic) {
    return exam
      ? `引用 ${citation.ref || ''} 未穿透到知识库条目 · 建议人工核对依据`
      : `引用 ${citation.ref || ''} 未穿透到知识库条目 · 转人工复核`;
  }
  if (citation.synthetic) {
    return `行业问题清单（聚合口径）${citation.ref ? ` · ${citation.ref}` : ''}`;
  }
  const parts = [];
  if (citation.source_kind === '法规条款') {
    parts.push(citation.batch_label || (citation.doc_name ? `《${citation.doc_name}》` : '法规条款'));
    if (citation.doc_no) parts.push(citation.doc_no);
    if (citation.locator) parts.push(citation.locator);
    if (citation.effective_from) parts.push(`自${citation.effective_from}施行`);
  } else if (citation.source_kind === '两库知识点') {
    if (citation.batch_label) parts.push(citation.batch_label);
    if (citation.rule_category || citation.item_name) {
      parts.push(`${citation.rule_category || '两库规则'}${citation.item_name ? `「${citation.item_name}」` : ''}`);
    }
    if (citation.seq != null) parts.push(`知识点 #${citation.seq}`);
    if (citation.codes?.length) parts.push(`代码 ${citation.codes[0]}`);
    if (citation.effective_from) parts.push(`生效 ${citation.effective_from}`);
  } else if (citation.source_kind === '目录') {
    if (citation.doc_name) parts.push(citation.doc_name);
    if (citation.locator) parts.push(citation.locator);
    if (citation.region && citation.region !== '全国') parts.push(citation.region);
  } else if (citation.source_kind === '问题清单') {
    parts.push('行业问题清单（聚合口径）');
    if (citation.locator) parts.push(citation.locator);
  } else {
    if (citation.doc_name) parts.push(citation.doc_name);
    if (citation.locator) parts.push(citation.locator);
  }
  return parts.filter(Boolean).join(' · ') || citation.ref || '';
}

function sanitizeEntry(entry) {
  if (!entry) return null;
  const out = JSON.parse(JSON.stringify(entry));
  if (out.metadata?.attachment) out.metadata.attachment = path.basename(String(out.metadata.attachment));
  return out;
}

module.exports = {
  buildCitationIndex,
  resolveCitation,
  formatCitation,
  normalizeBatch,
  citationLine,
  sanitizeEntry,
};
