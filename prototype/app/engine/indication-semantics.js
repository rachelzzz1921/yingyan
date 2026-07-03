'use strict';

/**
 * 适应症限定（L3 indication_limited · 510 项）→ B-201 语义路径
 * 确定性层：关键词/诊断交叉 → 线索（保守，保 G0）
 * LLM 层：super 模式 + 有 API key 时结构化判定 → 可升疑点
 */
const { loadIndex } = require('./kb-operational-index');

const DRUG_FORM_SUFFIXES = ['分散片', '缓释片', '肠溶片', '咀嚼片', '泡腾片', '片', '胶囊', '颗粒', '口服液', '口服溶液', '注射液', '注射用', '干混悬剂'];
const { isReady } = require('./llm-provider');
const { structuredCall } = require('./structured-output');

const SKIP_DRUGS = /人血白蛋白|白蛋白注射液/;
const MAX_SYNC = 4;
const MAX_LLM = 5;

/** 已有专科 checker 的药品 —— 适应症索引层不再重复报（防 reconcile 抢主疑点） */
const DEDICATED_DRUG_CHECKERS = [
  { re: /人血白蛋白|白蛋白/, note: 'B-201 硬编码' },
  { re: /聚乙二醇化.*粒细胞刺激因子|长效.*升白/i, note: 'T-205 升白针' },
  { re: /奥希替尼|吉非替尼|厄洛替尼|阿法替尼|埃克替尼|达可替尼|阿来替尼|克唑替尼|塞瑞替尼|洛拉替尼/i, note: 'T-201 靶向' },
];

function skipDedicatedDrug(name) {
  return DEDICATED_DRUG_CHECKERS.find(d => d.re.test(String(name || '')));
}

/** 适应症：精确名 + 同 stem 不同剂型（恩替卡韦分散片↔颗粒） */
function drugStem(n) {
  let s = String(n || '').replace(/\s+/g, '');
  for (const suf of DRUG_FORM_SUFFIXES) {
    if (s.endsWith(suf)) { s = s.slice(0, -suf.length); break; }
  }
  return s;
}

function lookupIndicationConstraints(name) {
  const idx = loadIndex();
  if (!idx) return [];
  const n = norm(name);
  const pick = (key) => (idx.constraints[key] || []).filter(c => c.family === 'indication_limited').map(r => ({ ...r, matched: key }));
  if (idx.constraints[n]) return pick(n);
  const stem = drugStem(n);
  if (stem.length >= 3) {
    const keys = Object.keys(idx.constraints).filter(k => drugStem(k) === stem && pick(k).length);
    if (!keys.length) return [];
    // 同 stem 多剂型（如波生坦片 vs 分散片）→ 选与费用名最接近的索引键，避免 Object.keys 顺序误配
    keys.sort((a, b) => {
      const na = norm(a), nb = norm(b);
      const sa = (n.includes(na) || na.includes(n)) ? 1 : 0;
      const sb = (n.includes(nb) || nb.includes(n)) ? 1 : 0;
      if (sa !== sb) return sb - sa;
      return Math.abs(n.length - na.length) - Math.abs(n.length - nb.length);
    });
    return pick(keys[0]);
  }
  return [];
}

function norm(s) {
  return String(s || '').replace(/\s+/g, '').toLowerCase();
}

function collectClinicalText(record) {
  const chunks = [];
  const fp = record.front_page || {};
  if (fp.principal_diagnosis?.name) chunks.push(fp.principal_diagnosis.name);
  for (const d of fp.other_diagnosis || []) if (d.name) chunks.push(d.name);
  for (const d of record.admission_note?.preliminary_diagnosis || []) chunks.push(String(d));
  for (const n of record.progress_notes || []) if (n.text) chunks.push(n.text);
  if (record.discharge_summary?.discharge_diagnosis) {
    for (const d of record.discharge_summary.discharge_diagnosis) chunks.push(String(d));
  }
  if (record.pathology_report?.diagnosis) chunks.push(record.pathology_report.diagnosis);
  return chunks.join(' ');
}

/** 从「限…」支付依据提取可检索疾病/场景词 */
function extractIndicationTerms(basis) {
  const raw = String(basis || '');
  let seg = raw.replace(/^限/, '').split(/[。；;]/)[0];
  seg = seg.replace(/(患者|使用|支付|等情形|的局部治疗|治疗|用药|成人|儿童|及以上|以下).*$/, '');
  const terms = seg.split(/[、，,及与和\/\s]+/).map(t => t.trim()).filter(t => t.length >= 2);
  if (!terms.length && seg.length >= 2) terms.push(seg.slice(0, 24));
  return [...new Set(terms)].slice(0, 8);
}

function scoreIndicationMatch(clinical, basis) {
  const terms = extractIndicationTerms(basis);
  if (!terms.length) return { score: 0.5, terms, matched: [] };
  const c = norm(clinical);
  const matched = terms.filter(t => c.includes(norm(t)));
  const score = matched.length / terms.length;
  return { score, terms, matched };
}

function drugFeeLines(record) {
  return (record.fee_list?.items || []).filter(l => /药|西药|中成药|生物/.test(l.category || '') || /片|胶囊|注射液|颗粒/.test(l.item_name || ''));
}

function mkIndicationFinding(ctx, mkFinding, line, constraint, clinical, match, status) {
  const ref = (constraint.refs || [])[0] || 'KB1-两库2025-药品限适应症';
  return mkFinding(ctx, 'B-201-IND', {
    status,
    risk_level: status === '疑点' ? '高' : '中',
    amount_involved: line.amount || 0,
    evidence: [
      { type: '费用行', loc: `费用清单 第${line.line_no}行`, text: `${line.item_name} ${line.amount}元` },
      { type: '限定支付依据', loc: ref, text: (constraint.basis || '').slice(0, 180) },
      { type: '病历诊断检索', loc: '入院/病程/出院诊断', text: `已检索：${clinical.slice(0, 100)}…；命中词：${match.matched.join('、') || '无'}` },
      { type: '判定路径', loc: 'L3·indication_limited', text: status === '线索' ? '语义层保守降级：适应症文本与诊断交叉不足，需人工复核' : '语义层判定：诊断与限定适应症不符' },
    ],
    reasoning: `「${line.item_name}」医保限定支付：${(constraint.basis || '').slice(0, 120)}。本案病历诊断/病程检索${match.matched.length ? `命中「${match.matched.join('、')}」` : '未命中限定适应症关键词'}——${status === '线索' ? '材料包内难以闭环，先出线索' : '超出目录限定支付范围（38条六）'}。`,
    needs_more: status === '线索' ? ['复核入院/出院诊断与药品说明书限定适应症是否一致'] : [],
    disposal: status === '疑点' ? `建议核实适应症后责令退回或自费 ${line.amount} 元。` : '建议调阅完整病历后复核限定支付合规性。',
  });
}

const SYNC_SCORE_MAX = 0.34;
const LLM_SCORE_MAX = 0.5;

/** sync / LLM 共用：每药品 stem 只保留一条最差匹配约束 */
function collectIndicationCandidates(record, { forLlm = false } = {}) {
  const clinical = collectClinicalText(record);
  const scoreMax = forLlm ? LLM_SCORE_MAX : SYNC_SCORE_MAX;
  const candidates = [];
  const seen = new Set();
  for (const line of drugFeeLines(record)) {
    const name = String(line.item_name || '');
    if (SKIP_DRUGS.test(name)) continue;
    if (skipDedicatedDrug(name)) continue;
    const constraints = lookupIndicationConstraints(name);
    const failing = constraints
      .map(c => ({ c, match: scoreIndicationMatch(clinical, c.basis) }))
      .filter(x => x.match.score < scoreMax);
    if (!failing.length) continue;
    failing.sort((a, b) => a.match.score - b.match.score);
    const { c, match } = failing[0];
    const key = `${drugStem(name)}|${(c.refs || [])[0] || c.basis}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ line, constraint: c, match, key });
  }
  return { clinical, candidates };
}

/** 同步语义层（始终可用，只出线索） */
function evaluateIndicationSync(ctx, mkFinding) {
  if (!loadIndex()) return [];
  const { clinical, candidates } = collectIndicationCandidates(ctx.record);
  const out = [];
  for (const { line, constraint: c, match } of candidates.slice(0, MAX_SYNC)) {
    out.push(mkIndicationFinding(ctx, mkFinding, line, c, clinical, match, '线索'));
  }
  return out;
}

/** LLM 语义层（super 模式，可升疑点） */
async function evaluateIndicationLlm(record, ctx, mkFinding) {
  if (!isReady() || !loadIndex()) return [];
  if (!candidates.length) return [];

  const batch = candidates.slice(0, MAX_LLM);
  const system = [
    '你是医保限定支付适应症判定助手。只依据给定病历摘要与药品限定支付原文，判断该次用药是否符合医保支付适应症。',
    '输出 JSON：{"items":[{"line_no":number,"status":"疑点|线索|合规","reason":"≤60字"}]}',
    '原则：证据不足→线索；明确不符→疑点；明确符合→合规。',
  ].join('\n');
  const user = [
    '## 病历摘要', clinical.slice(0, 2000),
    '## 待判定药品', JSON.stringify(batch.map(b => ({
      line_no: b.line.line_no,
      drug: b.line.item_name,
      limit_basis: b.constraint.basis,
      keyword_hits: b.match.matched,
    })), null, 2),
  ].join('\n');

  try {
    const out = await structuredCall({
      stage: '适应症语义(B-201)',
      system,
      user,
      maxTokens: 2000,
      schema: {
        type: 'object',
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              required: ['line_no', 'status'],
              properties: {
                line_no: { type: 'number' },
                status: { enum: ['疑点', '线索', '合规'] },
                reason: { type: 'string' },
              },
            },
          },
        },
      },
    });
    const findings = [];
    const seen = new Set();
    for (const item of out.items || []) {
      if (item.status === '合规') continue;
      const b = batch.find(x => x.line.line_no === item.line_no);
      if (!b) continue;
      if (seen.has(b.key)) continue;
      seen.add(b.key);
      findings.push(mkIndicationFinding(ctx, mkFinding, b.line, b.constraint, clinical, b.match, item.status === '疑点' ? '疑点' : '线索'));
    }
    return findings;
  } catch {
    return evaluateIndicationSync(ctx, mkFinding);
  }
}

module.exports = { evaluateIndicationSync, evaluateIndicationLlm, collectIndicationCandidates, collectClinicalText, scoreIndicationMatch };
