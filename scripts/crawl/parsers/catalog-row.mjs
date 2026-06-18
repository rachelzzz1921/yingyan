const DEMO_DRUGS = ['奥希替尼', '培美曲塞', '贝伐珠单抗', '人血白蛋白', '聚乙二醇化重组人粒细胞刺激因子', '升白', '曲妥珠单抗', '帕博利珠单抗', '阿布昔替尼', '本维莫德'];

export function isDemoDrug(name) {
  const n = String(name || '');
  return DEMO_DRUGS.some((d) => n.includes(d));
}

/** 从 PDF 纯文本行中启发式抽取药品目录行 */
export function extractDrugRowsFromText(text, opts = {}) {
  const lines = String(text || '').split(/\n+/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const policies = [];
  let idx = 0;
  for (const line of lines) {
    if (line.length < 8 || line.length > 300) continue;
    const codeM = line.match(/[A-Z]{1,2}[A-Z0-9]{10,}/);
    const hasDrugHint = /片|胶囊|注射液|颗粒|丸|软膏|滴眼液|原料药/.test(line);
    const hasRemark = /限|备注|支付|乙类|甲类/.test(line);
    if (!codeM && !hasDrugHint && !hasRemark) continue;
    const nameM = line.match(/[\u4e00-\u9fa5]{2,20}(?:片|胶囊|注射液|颗粒|丸|软膏|滴眼液)?/);
    const name = nameM?.[0] || '';
    if (!name && !codeM) continue;
    if (opts.demoOnly && !isDemoDrug(name) && lines.length > 50) continue;
    idx++;
    policies.push({
      name,
      code: codeM?.[0] || '',
      remark: (line.match(/限[^。]{4,80}/) || [])[0] || '',
      cls: (line.match(/[甲乙]类/) || [])[0] || '',
      raw: line.slice(0, 400),
      idx,
    });
  }
  return policies;
}

export function drugRowsToPolicies(rows, meta, refPrefix = 'KB1-目录2025') {
  return rows.map((r) => ({
    doc_id: meta.doc_id || 'KB1-目录2025',
    ref_id: r.code ? `${refPrefix}-${r.code}` : `${refPrefix}-${r.name.slice(0, 16).replace(/\s/g, '')}-${r.idx}`,
    layer: '目录',
    authority: meta.authority || '国家医疗保障局',
    doc_no: meta.docNo || null,
    doc_name: meta.title || '药品目录',
    effective_from: meta.effective_from || '2026-01-01',
    effective_to: null,
    region: meta.region || '全国',
    unit_type: '药品行',
    locator: r.code || r.name,
    text: [r.name, r.cls && `类别:${r.cls}`, r.remark && `备注:${r.remark}`, r.raw].filter(Boolean).join(' · ').slice(0, 2000),
    violation_tags: [],
    linked_rules: [],
    source_url: meta.articleUrl || meta.sourceUrl,
    verify_status: '✅爬虫入库(待人工抽检)',
    metadata: {
      crawl_source: meta.crawl_source || 'pdf-catalog',
      drug_code: r.code,
      drug_name: r.name,
      parse_status: meta.parse_status || 'pdf-text',
      attachment: meta.attachment,
    },
  }));
}
