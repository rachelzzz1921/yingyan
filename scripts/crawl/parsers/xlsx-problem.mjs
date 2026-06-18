import XLSX from 'xlsx';
import fs from 'fs';
import { refIdProblem } from '../lib/normalize.mjs';

const DOMAIN_HINTS = [
  ['肿瘤', /肿瘤/],
  ['麻醉', /麻醉/],
  ['重症医学', /重症/],
  ['定点零售药店', /药店|零售/],
  ['心血管内科', /心血管|心内/],
  ['骨科', /骨科/],
  ['医学影像', /影像|放射/],
  ['血液净化', /血液净化|透析/],
  ['康复', /康复/],
  ['临床检验', /检验/],
  ['口腔', /口腔/],
  ['内分泌', /内分泌/],
  ['精神医学', /精神/],
];

function detectDomain(filename, sheetName, rowDomain) {
  if (rowDomain && String(rowDomain).trim()) return String(rowDomain).trim();
  const s = `${filename} ${sheetName}`;
  for (const [domain, re] of DOMAIN_HINTS) {
    if (re.test(s)) return domain;
  }
  if (/药店|零售/.test(filename)) return '定点零售药店';
  return '综合';
}

function findHeaderRowArray(rows) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const cells = row.map((c) => String(c).trim());
    if (cells.includes('序号') && cells.some((c) => /问题|典型/.test(c))) {
      return { headerIdx: i, headers: cells };
    }
  }
  return null;
}

function readAllSheets(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const out = [];
  for (const name of wb.SheetNames) {
    const matrix = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
    const hdr = findHeaderRowArray(matrix);
    if (hdr) {
      const rows = [];
      for (let i = hdr.headerIdx + 1; i < matrix.length; i++) {
        const row = matrix[i];
        if (!Array.isArray(row)) continue;
        const obj = {};
        hdr.headers.forEach((h, j) => {
          if (h) obj[h] = row[j] ?? '';
        });
        rows.push(obj);
      }
      out.push({ name, rows });
      continue;
    }
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' });
    out.push({ name, rows });
  }
  return out;
}

function pickField(row, candidates) {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const hit = keys.find((k) => String(k).includes(c));
    if (hit != null && String(row[hit]).trim() !== '') return row[hit];
  }
  return '';
}

export function parseProblemXlsx(filePath, meta = {}) {
  const sheets = readAllSheets(filePath);
  const domainMap = new Map();
  const fname = filePath.split('/').pop() || '';

  for (const { name, rows } of sheets) {
    for (const row of rows) {
      const noRaw = pickField(row, ['序号', '问题序号', '编号']);
      const type = pickField(row, ['问题类型', '类型', '违规类型']);
      const text = pickField(row, ['典型问题', '问题描述', '问题内容', '问题', '内容', '具体表现']);
      if (!text || String(text).length < 6) continue;
      const domain = detectDomain(fname, name, pickField(row, ['所属领域', '领域', '科室']));
      if (!domainMap.has(domain)) {
        domainMap.set(domain, {
          domain,
          version: '2025版',
          doc_no: meta.docNo || '医保函〔2025〕2号',
          verify_status: '✅爬虫入库(待人工抽检)',
          source_url: meta.sourceUrl || meta.articleUrl,
          items: [],
        });
      }
      const slot = domainMap.get(domain);
      const no = parseInt(String(noRaw).replace(/\D/g, ''), 10) || (slot.items.length + 1);
      if (slot.items.some((i) => i.no === no && i.text === String(text).trim())) continue;
      slot.items.push({
        no,
        type: String(type || '问题项').trim(),
        text: String(text).trim().slice(0, 500),
        verify: '✅爬虫入库(待人工抽检)',
      });
    }
  }

  const problemDomains = [...domainMap.values()].filter((d) => d.items.length > 0);
  const totalItems = problemDomains.reduce((n, d) => n + d.items.length, 0);
  return { policies: [], problemDomains, stats: { problem_items: totalItems, domains: problemDomains.length } };
}

export function parseProblemFromFile(filePath, meta) {
  if (!fs.existsSync(filePath)) return { policies: [], problemDomains: [], stats: {} };
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (ext === 'xlsx' || ext === 'xls') return parseProblemXlsx(filePath, meta);
  return { policies: [], problemDomains: [], stats: { skipped: ext } };
}

/** 将 problem domain items 也生成 PL 层 policy 条目供 RAG */
export function problemDomainsToPolicies(domains) {
  const policies = [];
  for (const d of domains) {
    for (const it of d.items) {
      policies.push({
        doc_id: 'KB1-问题清单2025',
        ref_id: refIdProblem(d.domain, it.no),
        layer: '清单',
        authority: '国家医疗保障局',
        doc_no: d.doc_no,
        doc_name: `典型问题清单（2025版）·${d.domain}`,
        effective_from: '2025-01-01',
        effective_to: null,
        region: '全国',
        unit_type: '问题项',
        locator: `序号${it.no}`,
        text: `[${d.domain}清单序号${it.no}·${it.type}] ${it.text}`,
        violation_tags: [it.type].filter(Boolean),
        linked_rules: [],
        source_url: d.source_url,
        verify_status: '✅爬虫入库(待人工抽检)',
        metadata: { domain: d.domain, item_no: it.no, type: it.type },
      });
    }
  }
  return policies;
}
