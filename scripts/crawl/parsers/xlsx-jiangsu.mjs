import XLSX from 'xlsx';
import fs from 'fs';
import { refIdJiangsuDrug } from '../lib/normalize.mjs';

const DEMO_DRUGS = ['奥希替尼', '培美曲塞', '贝伐珠单抗', '人血白蛋白', '聚乙二醇化重组人粒细胞刺激因子', '升白', '曲妥珠单抗', '帕博利珠单抗'];

function readSheet(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

function pickField(row, candidates) {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const hit = keys.find((k) => String(k).includes(c));
    if (hit != null && String(row[hit]).trim() !== '') return String(row[hit]).trim();
  }
  return '';
}

function isDemoDrug(name) {
  const n = String(name);
  return DEMO_DRUGS.some((d) => n.includes(d));
}

export function parseJiangsuXlsx(filePath, meta = {}) {
  const rows = readSheet(filePath);
  const policies = [];
  let idx = 0;
  for (const row of rows) {
    const code = pickField(row, ['医保编码', '药品代码', '编码', '国家医保代码']);
    const name = pickField(row, ['药品名称', '通用名', '注册名称', '名称']);
    const remark = pickField(row, ['备注', '限定', '支付范围', '医保支付标准', '支付标准']);
    const cls = pickField(row, ['医保类别', '甲乙类', '类别']);
    if (!name && !code) continue;
    if (!isDemoDrug(name) && rows.length > 30) continue;
    idx++;
    const refId = code ? refIdJiangsuDrug(code) : `KB1-江苏-药品目录-行${idx}`;
    policies.push({
      doc_id: 'KB1-江苏',
      ref_id: refId,
      layer: '目录',
      authority: '江苏省医保局',
      doc_no: meta.docNo || null,
      doc_name: meta.title || '江苏省药品目录数据库',
      effective_from: meta.publishDate || null,
      effective_to: null,
      region: '江苏省',
      unit_type: '药品行',
      locator: code || name,
      text: [name, cls && `类别:${cls}`, remark && `备注:${remark}`].filter(Boolean).join(' · ').slice(0, 2000),
      violation_tags: [],
      linked_rules: [],
      source_url: meta.sourceUrl || meta.articleUrl,
      verify_status: '✅爬虫入库(待人工抽检)',
      metadata: { drug_code: code, drug_name: name, insurance_class: cls, crawl_source: 'jiangsu-drug-db' },
    });
  }
  if (!policies.length) {
    for (const row of rows.slice(0, 50)) {
      const name = pickField(row, ['药品名称', '通用名', '注册名称', '名称']);
      const code = pickField(row, ['医保编码', '药品代码', '编码']);
      const remark = pickField(row, ['备注', '限定', '支付范围']);
      if (!name) continue;
      idx++;
      policies.push({
        doc_id: 'KB1-江苏',
        ref_id: code ? refIdJiangsuDrug(code) : `KB1-江苏-药品目录-行${idx}`,
        layer: '目录',
        authority: '江苏省医保局',
        doc_name: meta.title || '江苏省药品目录数据库',
        region: '江苏省',
        unit_type: '药品行',
        locator: code || name,
        text: [name, remark].filter(Boolean).join(' · ').slice(0, 2000),
        source_url: meta.sourceUrl,
        verify_status: '✅爬虫入库(待人工抽检)',
        metadata: { crawl_source: 'jiangsu-drug-db' },
      });
    }
  }
  return { policies, problemDomains: [], stats: { jiangsu_rows: policies.length } };
}

export function parseDrugNationalXlsx(filePath, meta = {}) {
  const rows = readSheet(filePath);
  const policies = [];
  for (const row of rows) {
    const name = pickField(row, ['药品名称', '通用名', '注册名称']);
    const remark = pickField(row, ['备注', '限定支付范围', '限定']);
    const cls = pickField(row, ['医保类别', '甲乙类', '类别']);
    if (!name) continue;
    if (!isDemoDrug(name) && rows.length > 40) continue;
    policies.push({
      doc_id: meta.doc_id || 'KB1-目录2025',
      ref_id: `KB1-目录2025-${name.slice(0, 20).replace(/\s/g, '')}`,
      layer: '目录',
      authority: '国家医疗保障局',
      doc_name: '国家基本医疗保险药品目录（2025年）',
      effective_from: '2026-01-01',
      region: '全国',
      unit_type: '药品行',
      locator: name,
      text: [name, cls && `类别:${cls}`, remark && `备注:${remark}`].filter(Boolean).join(' · '),
      source_url: meta.sourceUrl,
      verify_status: '✅爬虫入库(待人工抽检)',
      metadata: { crawl_source: 'drug-catalog-2025' },
    });
  }
  return { policies, problemDomains: [], stats: { drug_rows: policies.length } };
}

export function parseFromFile(filePath, parser, meta) {
  if (!fs.existsSync(filePath)) return { policies: [], problemDomains: [], stats: {} };
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (ext !== 'xlsx' && ext !== 'xls') return { policies: [], problemDomains: [], stats: { skipped: ext } };
  if (parser === 'xlsx-jiangsu') return parseJiangsuXlsx(filePath, meta);
  if (parser === 'xlsx-drug') return parseDrugNationalXlsx(filePath, meta);
  return { policies: [], problemDomains: [], stats: {} };
}
