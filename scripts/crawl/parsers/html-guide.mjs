import * as cheerio from 'cheerio';
import { slugPart, stripHtmlText, extractDocNo, extractEffectiveDate } from '../lib/normalize.mjs';

function specialtyFromTitle(title) {
  const m = title.match(/《([^》]+)医疗服务价格项目立项指南/);
  if (m) return m[1].trim();
  const m2 = title.match(/《([^》]+)立项指南/);
  if (m2) return m2[1].trim();
  return title.replace(/[《》]/g, '').slice(0, 24);
}

function extractMappingCount(text) {
  const m = text.match(/映射整合为(\d+)项/);
  return m ? parseInt(m[1], 10) : null;
}

function extractTableRows(bodyHtml, baseUrl) {
  const $ = cheerio.load(bodyHtml || '');
  const rows = [];
  $('table tr').each((_, tr) => {
    const cells = $(tr).find('td,th').map((__, c) => $(c).text().replace(/\s+/g, ' ').trim()).get();
    if (cells.length >= 2 && cells.some((c) => c.length > 1)) rows.push(cells);
  });
  return rows;
}

function rowToPolicy(cells, meta, idx) {
  const joined = cells.join(' | ');
  const name = cells.find((c) => /费|诊查|护理|手术|治疗|检查/.test(c)) || cells[0];
  const code = cells.find((c) => /^[A-Z0-9\-]{6,}$/.test(c)) || '';
  const unit = cells.find((c) => /次|日|项|小时|床/.test(c) && c.length < 8) || '';
  const specialty = meta.specialty || '立项指南';
  const refId = `KB1-立项指南-${slugPart(specialty, 12)}-${slugPart(name || `行${idx}`, 16)}`;
  return {
    doc_id: 'KB1-立项指南',
    ref_id: refId,
    layer: '目录',
    authority: '国家医疗保障局',
    doc_no: meta.docNo || null,
    doc_name: meta.title || '全国医疗服务价格项目立项指南',
    effective_from: meta.publishDate || null,
    effective_to: null,
    region: '全国',
    unit_type: '价格项目',
    locator: name || `行${idx}`,
    text: [name, code && `编码:${code}`, unit && `单位:${unit}`, joined].filter(Boolean).join(' · ').slice(0, 2000),
    violation_tags: [],
    linked_rules: [],
    source_url: meta.articleUrl || meta.sourceUrl,
    verify_status: '✅爬虫入库(待人工抽检)',
    metadata: {
      crawl_source: 'guide-col201',
      specialty,
      project_code: code,
      pricing_unit: unit,
      batch_title: meta.title,
    },
  };
}

export function parseHtmlGuide(article, seed = {}) {
  const title = article.title || seed.name || '';
  const text = article.text || stripHtmlText(article.bodyHtml || '');
  const specialty = specialtyFromTitle(title);
  const docNo = seed.doc_no || article.docNo || extractDocNo(text);
  const effectiveFrom = seed.effective_from || extractEffectiveDate(text) || article.publishDate;
  const meta = {
    title,
    specialty,
    docNo,
    publishDate: article.publishDate,
    articleUrl: article.url,
    sourceUrl: seed.url,
  };
  const policies = [];
  const mappingN = extractMappingCount(text);

  const tableRows = extractTableRows(article.bodyHtml, article.url);
  const dataRows = tableRows.filter((r) => !r.every((c) => /序号|项目|编码|名称/.test(c)));
  if (dataRows.length) {
    dataRows.forEach((cells, i) => {
      if (cells.join('').length < 4) return;
      policies.push(rowToPolicy(cells, meta, i + 1));
    });
  }

  const bianzhiM = text.match(/编制说明[：:]([\s\S]{20,800})/);
  const summaryText = bianzhiM?.[1]?.trim() || text.slice(0, 1200);
  if (summaryText.length >= 20) {
    policies.push({
      doc_id: 'KB1-立项指南',
      ref_id: `KB1-立项指南-${slugPart(specialty, 16)}-编制说明`,
      layer: '目录',
      authority: '国家医疗保障局',
      doc_no: docNo,
      doc_name: title || '立项指南编制说明',
      effective_from: effectiveFrom,
      effective_to: null,
      region: '全国',
      unit_type: '批次说明',
      locator: specialty,
      text: [
        mappingN && `映射整合${mappingN}项`,
        summaryText,
      ].filter(Boolean).join(' · ').slice(0, 2000),
      violation_tags: [],
      linked_rules: [],
      source_url: article.url,
      verify_status: '✅爬虫入库(待人工抽检)',
      metadata: {
        crawl_source: 'guide-col201',
        specialty,
        mapping_item_count: mappingN,
        content_type: tableRows.length ? 'table+summary' : 'summary',
      },
    });
  }

  const listItems = [...text.matchAll(/(?:^|\n)\s*(\d+)[.、．]\s*([^\n]{8,120})/gm)];
  for (const [, no, item] of listItems.slice(0, 30)) {
    policies.push({
      doc_id: 'KB1-立项指南',
      ref_id: `KB1-立项指南-${slugPart(specialty, 12)}-项${no}`,
      layer: '目录',
      authority: '国家医疗保障局',
      doc_name: title,
      region: '全国',
      unit_type: '价格项目',
      locator: `项${no}`,
      text: item.trim().slice(0, 500),
      source_url: article.url,
      verify_status: '✅爬虫入库(待人工抽检)',
      metadata: { crawl_source: 'guide-col201', specialty, item_no: no },
    });
  }

  return { policies, problemDomains: [], stats: { guide_entries: policies.length, specialty } };
}
