/** 文号、日期、ref_id 归一化 */

export function normalizeDocNo(raw) {
  if (!raw) return null;
  return String(raw)
    .replace(/\[/g, '〔').replace(/\]/g, '〕')
    .replace(/\s+/g, '')
    .trim();
}

export function extractDocNo(text) {
  if (!text) return null;
  const patterns = [
    /国医保发〔\d{4}〕\d+号/,
    /国医保办发〔\d{4}〕\d+号/,
    /医保函〔\d{4}〕\d+号/,
    /苏医保发〔\d{4}〕\d+号/,
    /国家医疗保障局令第\d+号/,
    /国务院令第\d+号/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return normalizeDocNo(m[0]);
  }
  return null;
}

export function extractEffectiveDate(text) {
  if (!text) return null;
  const m = text.match(/自(\d{4})年(\d{1,2})月(\d{1,2})日起(?:正式)?(?:施行|执行)/);
  if (m) {
    const y = m[1];
    const mo = String(m[2]).padStart(2, '0');
    const d = String(m[3]).padStart(2, '0');
    return `${y}-${mo}-${d}`;
  }
  return null;
}

export function extractPublishDate(html, url) {
  const m1 = html.match(/发布时间[：:]\s*(\d{4}-\d{2}-\d{2})/);
  if (m1) return m1[1];
  const m2 = url?.match(/art\/(\d{4})\/(\d{1,2})\/(\d{1,2})\//);
  if (m2) return `${m2[1]}-${String(m2[2]).padStart(2, '0')}-${String(m2[3]).padStart(2, '0')}`;
  return null;
}

export function stripHtmlText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\u3000/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function slugPart(s, max = 24) {
  return String(s || '项')
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max) || '项';
}

export function refIdLiangku(batch, category, idx) {
  return `KB1-两库2025-${slugPart(batch, 12)}-${slugPart(category, 16)}-${idx}`;
}

export function refIdProblem(domain, no) {
  return `KB1-问题清单2025-${slugPart(domain, 8)}-${no}`;
}

export function refIdJiangsuDrug(code) {
  return `KB1-江苏-药品目录-${String(code).replace(/\s/g, '')}`;
}

export function refIdDrugNational(name) {
  return `KB1-目录2025-${slugPart(name, 20)}`;
}

export function refIdArticle(docId, articleNo) {
  const n = String(articleNo).replace(/第|条/g, '').trim();
  return `${docId}-第${n}条`;
}
