'use strict';
// ============================================================================
// 证据链解析器 — 实现规格 §4/§5/§6/§7（数据侧，与规则覆盖度分开）
//
// 第一性原理（§1.1）：钱→行为→指征。锚是「结算费用明细行」（§1.2）。
// 每一层回答一问：枢纽(医嘱/发药)=合法性 · 执行(手术/护理/重症)=真实性 · 客观(检验/病理)=合理性。
//
// 本模块只做「建链 + 算完整度 + 产出 missing_evidence 事件」。不拆组套、不算剂量、
// 不改完整度以外的任何东西（§10 反模式#9）。方向单一：完整度→规则（§7），绝不反向。
// ============================================================================

const path = require('path');
const fs = require('fs');
const { mergeOnsiteLinks } = require('./evidence-link-store');

let EXP = null;
function expectations() {
  if (EXP) return EXP;
  EXP = JSON.parse(fs.readFileSync(path.join(__dirname, 'evidence-expectations.json'), 'utf8'));
  return EXP;
}

// material_type → 层（§3）。0=锚 1=枢纽 2=执行 3=客观 context=就诊上下文（横切）
const LAYER = {
  order: 1, dispense: 1, trace_code: 1,
  surgery_record: 2, anesthesia_record: 2, nursing_record: 2, icu_record: 2, progress_note: 2,
  lab_report: 3, pathology_gene_report: 3, gene_report: 3, imaging_record: 3,
  admission_record: 'context', discharge_summary: 'context', case_front_page: 'context',
};
const LAYER_LABEL = { 0: '锚·费用明细行', 1: '枢纽·合法性', 2: '执行·真实性', 3: '客观·合理性', context: '就诊上下文' };
const MAT_LABEL = {
  order: '医嘱单', dispense: '发药/进销存', trace_code: '追溯码',
  surgery_record: '手术记录', anesthesia_record: '麻醉记录', nursing_record: '护理记录',
  icu_record: '重症记录', progress_note: '病程记录',
  lab_report: '检验报告', pathology_gene_report: '病理/基因', gene_report: '基因检测', imaging_record: '影像记录',
  admission_record: '入院记录', discharge_summary: '出院小结', case_front_page: '病案首页',
};
const WEIGHT = { explicit: 1.0, inferred: 0.85, contextual: 0.6, none: 0 };

// ---------- 时间工具 ----------
function parseDate(s) {
  if (!s) return null;
  const str = String(s).trim();
  // "2026-03-13~03-20"（跨日区间）取起点；"2026-03-14 10:00" / "2026-03-14"
  const start = str.split('~')[0].trim();
  const m = start.match(/(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0));
}
function feeRange(feeDate) {
  const str = String(feeDate || '').trim();
  if (str.includes('~')) {
    const [a, b] = str.split('~').map(x => x.trim());
    const start = parseDate(a);
    // 尾段可能只写 "03-20"，补年月
    let end = parseDate(b);
    if (!end && start && /^\d{2}-\d{2}$/.test(b)) end = new Date(start.getFullYear(), Number(b.slice(0, 2)) - 1, Number(b.slice(3)));
    return { start, end: end || start };
  }
  const d = parseDate(str);
  return { start: d, end: d };
}

// 医嘱执行窗（§4.2）：临时=开立±24h；长期=[start,stop]，无stop取出院
function orderWindow(order, dischargeDate) {
  const t0 = parseDate(order.start || order.time);
  if (!t0) return null;
  if (order.stop) return { from: t0, to: parseDate(order.stop) };
  if (order.start) return { from: t0, to: dischargeDate || new Date(t0.getTime() + 30 * 86400000) };
  // 临时医嘱 ±24h
  return { from: new Date(t0.getTime() - 86400000), to: new Date(t0.getTime() + 86400000) };
}
function windowsOverlap(feeR, win) {
  if (!feeR.start || !win || !win.from) return false;
  const fs_ = feeR.start.getTime(), fe = (feeR.end || feeR.start).getTime();
  const ws = win.from.getTime(), we = (win.to || win.from).getTime();
  return fs_ <= we && fe >= ws;
}

// ---------- 关键词对应 ----------
function firstToken(name, len = 3) { return String(name || '').replace(/[（(].*$/, '').slice(0, len); }
function contentMatches(orderContent, itemName) {
  const c = String(orderContent || ''), n = String(itemName || '');
  if (!c || !n) return false;
  const key = firstToken(n, 3);
  if (key && c.includes(key)) return true;
  const key2 = firstToken(c, 3);
  return key2 && n.includes(key2);
}

// ---------- 费用类别 → 期望键（§5，config 驱动，含关键词覆盖）----------
function classify(item, exp) {
  const name = item.item_name || '';
  for (const ov of exp.keyword_override || []) {
    if (new RegExp(ov.when).test(name)) return { key: ov.key, guessed: false };
  }
  const cat = item.category || '';
  if (exp.category_map[cat]) return { key: exp.category_map[cat], guessed: false };
  // 兜底：按 med_code/名称前缀猜；都无 → unclassified（诚实标记）
  if (/药|片|胶囊|注射|颗粒|针/.test(cat + name)) return { key: 'drug_western', guessed: true };
  return { key: 'unclassified', guessed: true };
}
function inCodeset(name, exp, set) {
  return (exp.codesets[set] || []).some(k => String(name || '').includes(k));
}

// ---------- 案卷级：某类材料是否「已提供」(§6.3 分母修正) ----------
// 提供 = intake 声明了该 slot（哪怕内容为空/阴性），或记录里确有实体。
// 未提供 = 整卷根本没有该类型条目 ⇒ 从分母移除、标「材料未提供」、不触发疑点。
function materialProvided(record, type, manifest) {
  if (manifest && manifest.length) return manifest.includes(type) || materialHasContent(record, type);
  switch (type) {
    case 'order':
      // 医嘱「已提供」= 有医嘱明细，或任一费用行显式引用了医嘱号（最小 fixture 常只带引用不带明细）。
      return orderList(record).length > 0
        || (record.fee_list?.items || []).some(i => i.linked_order && i.linked_order !== '—' && i.linked_order !== '-');
    case 'dispense': return !!record.pharmacy_info;
    case 'trace_code': return (record.fee_list?.items || []).some(i => i.trace_code != null);
    case 'surgery_record': return !!(record.operation_note && (record.operation_note.doc_type || record.operation_note.operation_name));
    case 'anesthesia_record': return !!(record.anesthesia_record && (record.anesthesia_record.doc_type || record.anesthesia_record.anesthesia_method));
    case 'nursing_record': return (record.nursing_records?.entries || []).length > 0;
    case 'icu_record': return !!(record.icu_record && (record.icu_record.doc_type || record.icu_record.nursing_level || record.icu_record.admission_to_icu));
    case 'progress_note': return (record.progress_notes || []).length > 0;
    case 'lab_report': return (record.lab_reports || []).length > 0;
    case 'pathology_gene_report':
      return !!(record.pathology_report && (record.pathology_report.doc_type || record.pathology_report.diagnosis))
        || !!(record.gene_test_report && (record.gene_test_report.doc_type || record.gene_test_report.status));
    case 'gene_report':
      // 基因检测 slot：只要 intake 声明了基因检测单（哪怕 status=缺失）即视为「已提供」，
      // 使「靶向药无基因报告」落入「提供但对不上」→ 触发疑点（NSCLC 主线的 T-201 缺口）。
      return !!(record.gene_test_report && (record.gene_test_report.doc_type || record.gene_test_report.status));
    case 'imaging_record': return !!(record.imaging_record && (record.imaging_record.doc_type || record.imaging_record.studies || record.imaging_record.items || record.imaging_record.note));
    case 'admission_record': return !!(record.admission_note && (record.admission_note.doc_type || record.admission_note.chief_complaint));
    case 'discharge_summary': return !!(record.discharge_summary && (record.discharge_summary.doc_type || record.discharge_summary.discharge_date));
    case 'case_front_page': return !!(record.front_page && record.front_page.patient_name);
    default: return false;
  }
}
// 实体内容（可被行级匹配的真实证据），区别于「slot 已声明但为空」
function materialHasContent(record, type) {
  switch (type) {
    case 'order': return orderList(record).length > 0;
    case 'dispense': return !!record.pharmacy_info;
    case 'surgery_record': return !!record.operation_note?.operation_name;
    case 'anesthesia_record': return !!record.anesthesia_record?.anesthesia_method;
    case 'nursing_record': return (record.nursing_records?.entries || []).length > 0;
    case 'icu_record': return !!(record.icu_record?.admission_to_icu || record.icu_record?.nursing_level);
    case 'progress_note': return (record.progress_notes || []).length > 0;
    case 'lab_report': return (record.lab_reports || []).length > 0;
    case 'imaging_record': return !!(record.imaging_record?.studies || record.imaging_record?.items || record.imaging_record?.note);
    case 'pathology_gene_report': {
      const pathReal = record.pathology_report?.diagnosis && !/无病理|不适用/.test(record.pathology_report.diagnosis);
      const gene = record.gene_test_report || {};
      const geneReal = gene.status && !/缺失|未做|未检测|未送检|无/.test(gene.status);
      const geneResult = /突变|阳性|融合|扩增|野生|阴性/.test(String(gene.result || gene.status || ''));
      return !!(pathReal || (geneReal && geneResult));
    }
    case 'gene_report': {
      // 真实内容 = 有明确的驱动基因检测结论（阳性/突变/融合/扩增/野生），且 status 非「缺失」。
      const gene = record.gene_test_report || {};
      if (/缺失|未做|未检测|未送检/.test(String(gene.status || ''))) return false;
      return /突变|阳性|融合|扩增|野生|del|19del|21L858R/i.test(String(gene.result || ''));
    }
    case 'admission_record': return !!(record.admission_note?.chief_complaint);
    case 'discharge_summary': return !!(record.discharge_summary?.discharge_date);
    case 'case_front_page': return !!(record.front_page?.patient_name);
    case 'trace_code': return (record.fee_list?.items || []).some(i => /^[0-9A-Z]{10,}$/i.test(String(i.trace_code || '')));
    default: return false;
  }
}

function orderList(record) {
  return [
    ...(record.long_term_orders?.items || []),
    ...(record.temporary_orders?.items || []),
  ];
}

// ---------- 单节点行级匹配：返回 {match_type, weight, anchor, alternates, present} ----------
function resolveNode(record, item, type, dischargeDate) {
  const provided = null; // 由上层判定
  if (type === 'order') {
    const orders = orderList(record);
    const idMap = new Map(orders.map(o => [o.order_id, o]));
    const linked = item.linked_order && item.linked_order !== '—' && item.linked_order !== '-' ? item.linked_order : null;
    // L1 显式外键（linked_order 即 §4.1 的显式直连键；引用存在即「已下令」，明细未随案不降级）
    if (linked) {
      const o = idMap.get(linked);
      return { match_type: 'explicit', weight: WEIGHT.explicit, anchor: { material_id: linked, field: '医嘱内容', text: o ? o.content : `医嘱 ${linked}（费用行显式引用，明细未随案）` }, alternates: [] };
    }
    // L2 编码/关键词 + 时间窗
    const feeR = feeRange(item.fee_date);
    const cands = orders.filter(o => contentMatches(o.content, item.item_name) && windowsOverlap(feeR, orderWindow(o, dischargeDate)));
    if (cands.length) {
      cands.sort((a, b) => Math.abs((parseDate(a.start || a.time) || 0) - (feeR.start || 0)) - Math.abs((parseDate(b.start || b.time) || 0) - (feeR.start || 0)));
      const best = cands[0];
      // 一费用行多候选医嘱：取最近者建链，其余存 alternates，保持 inferred 折扣（歧义即不确定，§4.2）
      return {
        match_type: 'inferred', weight: WEIGHT.inferred,
        anchor: { material_id: best.order_id, field: '医嘱内容', text: best.content },
        alternates: cands.slice(1).map(o => ({ material_id: o.order_id, text: o.content })),
      };
    }
    return { match_type: 'none', weight: 0, anchor: null, alternates: [] };
  }

  if (type === 'dispense') {
    if (!record.pharmacy_info) return { match_type: 'none', weight: 0, anchor: null, alternates: [] };
    const as = item.actual_sold;
    const invBad = item.inventory_supported === false;
    const mism = as && !(String(item.item_name).includes(String(as.name || '').slice(0, 2)));
    if (invBad || mism) return { match_type: 'none', weight: 0, anchor: null, alternates: [], mismatch: true };
    return { match_type: 'inferred', weight: WEIGHT.inferred, anchor: { material_id: record.pharmacy_info.store_name || '进销存', field: '实际销售', text: as?.name || '进销存有记录' }, alternates: [] };
  }

  if (type === 'trace_code') {
    const ok = /^[0-9A-Z]{10,}$/i.test(String(item.trace_code || ''));
    if (ok) return { match_type: 'inferred', weight: WEIGHT.inferred, anchor: { material_id: item.trace_code, field: '追溯码', text: item.trace_code }, alternates: [] };
    return { match_type: 'none', weight: 0, anchor: null, alternates: [] };
  }

  if (type === 'gene_report') {
    if (materialHasContent(record, 'gene_report')) {
      const g = record.gene_test_report || {};
      return { match_type: 'explicit', weight: WEIGHT.explicit, anchor: { material_id: g.report_id || '基因检测', field: '检测结论', text: g.result || g.status }, alternates: [] };
    }
    return { match_type: 'none', weight: 0, anchor: null, alternates: [] };
  }

  if (type === 'pathology_gene_report') {
    if (materialHasContent(record, 'pathology_gene_report')) {
      const g = record.gene_test_report || {}, p = record.pathology_report || {};
      const txt = /突变|阳性|融合|扩增/.test(String(g.result || g.status || '')) ? (g.result || g.status) : (p.diagnosis || '病理/基因阳性');
      return { match_type: 'explicit', weight: WEIGHT.explicit, anchor: { material_id: g.report_id || p.report_id || '病理/基因', field: '诊断/检测结论', text: txt }, alternates: [] };
    }
    return { match_type: 'none', weight: 0, anchor: null, alternates: [] };
  }

  // 上下文层：入院/出院/病案首页 → contextual（点线，永不实线，§10#2）
  if (LAYER[type] === 'context') {
    if (materialHasContent(record, type)) return { match_type: 'contextual', weight: WEIGHT.contextual, anchor: { material_id: MAT_LABEL[type], field: '就诊上下文', text: '就诊区间/诊断上下文' }, alternates: [] };
    return { match_type: 'none', weight: 0, anchor: null, alternates: [] };
  }

  // 执行/客观类文书（手术/麻醉/护理/重症/病程/检验/影像）：无行级外键 → 关键词+存在性 = inferred
  if (materialHasContent(record, type)) {
    return { match_type: 'inferred', weight: WEIGHT.inferred, anchor: { material_id: MAT_LABEL[type], field: '记录/报告', text: `${MAT_LABEL[type]}存在且类别对应` }, alternates: [] };
  }
  return { match_type: 'none', weight: 0, anchor: null, alternates: [] };
}

// ---------- 冲销/退费配对（§4.2 边界）----------
function pairReversals(items) {
  const reversalOf = {};   // reversal line_no → original line_no
  const reversedBy = {};   // original line_no → reversal line_no
  const orphans = [];
  const negatives = items.filter(i => (i.amount || 0) < 0);
  for (const neg of negatives) {
    const orig = items.find(o => (o.amount || 0) > 0
      && Math.abs((o.amount || 0) + (neg.amount || 0)) < 0.01
      && o.category === neg.category
      && (parseDate(o.fee_date) || 0) <= (parseDate(neg.fee_date) || 0)
      && !reversedBy[o.line_no]);
    if (orig) { reversalOf[neg.line_no] = orig.line_no; reversedBy[orig.line_no] = neg.line_no; }
    else orphans.push(neg.line_no);
  }
  return { reversalOf, reversedBy, orphans };
}

// ---------- 是否门诊（§4.2 边界）----------
function isOutpatient(record) {
  if (record.pharmacy_info) return true;
  const scene = record.case_meta?.scene || '';
  if (/门诊|药店/.test(scene)) return true;
  const fp = record.front_page || {};
  if (fp.admission_no || fp.admit_time) return false;
  return true; // 无病案首页且无挂号 → 视门诊
}

// ============================================================================
// 主入口：resolveEvidence(record) — 一次性物化，只读（§4.3）
// ============================================================================
function resolveEvidence(record, opts = {}) {
  const exp = expectations();
  const items = (record.fee_list?.items || []).filter(Boolean);
  if (!items.length) return null;
  const manifest = record.material_manifest || null;
  const dischargeDate = parseDate(record.front_page?.discharge_time) || parseDate(record.discharge_summary?.discharge_date);
  const outpatient = isOutpatient(record);
  const rev = pairReversals(items);

  // 案卷级「提供」缓存
  const providedCache = {};
  const isProvided = (type) => {
    if (!(type in providedCache)) providedCache[type] = materialProvided(record, type, manifest);
    return providedCache[type];
  };

  const feeLines = [];
  const evidence_links = [];
  const missing_evidence = [];

  for (const item of items) {
    const feeLineId = item.fee_line_id || `${record.case_meta?.case_id || 'CASE'}-L${item.line_no}`;
    const amount = item.amount || 0;

    // 冲销配对：负数冲销行折叠为原始行标记，不单独参与完整度/疑点
    if (rev.reversalOf[item.line_no]) {
      feeLines.push({ fee_line_id: feeLineId, line_no: item.line_no, item_name: item.item_name, amount, category: item.category, is_reversal: true, reversal_of: rev.reversalOf[item.line_no], completeness: null, nodes: [] });
      continue;
    }
    if (rev.orphans.includes(item.line_no)) {
      // 孤儿负数行 → 信息数据监管类疑点（§4.2 / §7）
      missing_evidence.push({ fee_line_id: feeLineId, line_no: item.line_no, item_name: item.item_name, amount, material_type: 'settlement', expectation_key: 'reversal_orphan', auto_suspect: true, expected_reason: '负数冲销行找不到配对原始费用行，结算数据异常', rule_hint: '结算数据异常' });
      feeLines.push({ fee_line_id: feeLineId, line_no: item.line_no, item_name: item.item_name, amount, category: item.category, orphan_reversal: true, completeness: { score: 0, tier: '薄弱' }, nodes: [] });
      continue;
    }

    const cls = classify(item, exp);
    let spec = exp.expectations[cls.key] || exp.expectations.unclassified;
    let required = [...(spec.required || [])];
    let optional = [...(spec.optional || [])];

    // 升级规则（§5 escalations）
    const escalationsApplied = [];
    for (const esc of spec.escalations || []) {
      let hit = false;
      if (esc.when.startsWith('codeset:')) hit = inCodeset(item.item_name, exp, esc.when.slice(8));
      else if (esc.when === 'general_anesthesia') hit = /全麻|全身麻醉/.test((record.anesthesia_record?.anesthesia_method || '') + (record.operation_note?.anesthesia || ''));
      if (hit) { (esc.add_required || []).forEach(t => { if (!required.includes(t)) required.push(t); }); escalationsApplied.push(esc); }
    }

    // 门诊：床位/护理期望不适用（§4.2 边界）
    if (outpatient) { required = required.filter(t => !['nursing_record'].includes(t)); if (cls.key === 'bed_fee') required = []; }

    // 逐节点解析（required + optional）
    const nodes = [];
    const evalNode = (type, kind) => {
      const provided = isProvided(type);
      let res;
      if (!provided) { res = { match_type: 'not_provided', weight: 0, anchor: null, alternates: [] }; }
      else { res = resolveNode(record, item, type, dischargeDate); }
      const node = {
        material_type: type, label: MAT_LABEL[type] || type, layer: LAYER[type], layer_label: LAYER_LABEL[LAYER[type]],
        kind, provided, match_type: res.match_type, weight: res.weight,
        anchor: res.anchor, alternates: res.alternates || [], mismatch: !!res.mismatch,
      };
      nodes.push(node);
      // 物化关联行（§4.3）
      if (res.match_type !== 'not_provided') {
        evidence_links.push({ fee_line_id: feeLineId, material_type: type, material_id: res.anchor?.material_id || null, layer: LAYER[type], match_type: res.match_type, anchor_position: res.anchor ? { field: res.anchor.field, text: res.anchor.text } : null, alternates: (res.alternates || []).map(a => a.material_id) });
      }
      return node;
    };
    required.forEach(t => evalNode(t, 'required'));
    optional.forEach(t => evalNode(t, 'optional'));

    // 完整度（§6.1，分母只计已提供项 §6.3）
    const reqProvided = nodes.filter(n => n.kind === 'required' && n.provided);
    const optProvided = nodes.filter(n => n.kind === 'optional' && n.provided);
    const of = exp._meta.optional_factor;
    const num = reqProvided.reduce((s, n) => s + n.weight, 0) + optProvided.reduce((s, n) => s + n.weight * of, 0);
    const den = reqProvided.length * 1.0 + optProvided.length * of;
    let completeness = null;
    if (den > 0) {
      const score = Math.round((num / den) * 1000) / 1000;
      const tier = score >= exp._meta.tiers.complete ? '完整' : (score >= exp._meta.tiers.partial ? '部分' : '薄弱');
      completeness = { score, tier };
    }

    // 缺失即疑点（§7 producer）：required 且「已提供但 none」→ 事件（not_provided 不触发，诚实原则）
    for (const n of nodes) {
      if (n.kind !== 'required') continue;
      if (n.match_type !== 'none') continue;
      const reason = escalationReasonFor(escalationsApplied, n.material_type) || defaultExpectReason(cls.key, n.material_type);
      // order 缺口（无医嘱收费）已由 A-108/F-003 等一线规则覆盖且易受最小 fixture 影响 →
      // 保留在完整度/UI（灰虚框），但不自动新建疑点卡片，交一线规则裁决（§7 去重、避免双计与误报）。
      const autoSuspect = n.material_type !== 'order';
      missing_evidence.push({
        fee_line_id: feeLineId, line_no: item.line_no, item_name: item.item_name, amount, category: item.category,
        material_type: n.material_type, expectation_key: cls.key, auto_suspect: autoSuspect,
        expected_reason: reason, rule_hint: ruleHint(cls.key, n.material_type),
      });
    }

    feeLines.push({
      fee_line_id: feeLineId, line_no: item.line_no, item_name: item.item_name, amount, category: item.category,
      expectation_key: cls.key, class_guessed: cls.guessed,
      reversed_by: rev.reversedBy[item.line_no] || null,
      escalations: escalationsApplied.map(e => e.reason),
      completeness, nodes,
      missing_required: nodes.filter(n => n.kind === 'required' && n.match_type === 'none').map(n => n.material_type),
      not_provided: nodes.filter(n => n.match_type === 'not_provided').map(n => n.material_type),
      alternates_count: nodes.reduce((s, n) => s + (n.alternates?.length || 0), 0),
    });
  }

  // 案卷级完整度（金额加权，§6.1）。无可评估行 → null「未评估」，不误报 0（诚实原则）。
  const scored = feeLines.filter(l => l.completeness && !l.is_reversal);
  let caseScore = null, caseTier = '未评估';
  if (scored.length) {
    const totalAmt = scored.reduce((s, l) => s + Math.abs(l.amount), 0) || 1;
    caseScore = Math.round((scored.reduce((s, l) => s + l.completeness.score * Math.abs(l.amount), 0) / totalAmt) * 1000) / 1000;
    caseTier = caseScore >= exp._meta.tiers.complete ? '完整' : (caseScore >= exp._meta.tiers.partial ? '部分' : '薄弱');
  }

  // 分布直方图（§8.2 案卷头 hover）
  const dist = { 完整: { rows: 0, amount: 0 }, 部分: { rows: 0, amount: 0 }, 薄弱: { rows: 0, amount: 0 } };
  for (const l of scored) { const t = l.completeness.tier; dist[t].rows += 1; dist[t].amount += Math.abs(l.amount); }

  // 未提供的材料类型（案卷层面）
  const notProvidedTypes = Object.keys(providedCache).filter(t => !providedCache[t]);

  const chain = {
    version: 2, anchor: '结算费用明细行（主锚）',
    case_score: caseScore, case_tier: caseTier,
    fee_lines: feeLines, evidence_links, missing_evidence,
    not_provided_types: notProvidedTypes,
    distribution: dist,
    outpatient,
    reversal_pairs: Object.entries(rev.reversalOf).map(([r, o]) => ({ reversal: Number(r), original: Number(o) })),
    orphan_reversals: rev.orphans,
    // 兼容旧 UI（renderEvidenceChain 读 score/lines/weak_lines/statement）
    score: caseScore == null ? null : Math.round(caseScore * 100),
    lines: feeLines.filter(l => !l.is_reversal).map(l => ({ line_no: l.line_no, item: l.item_name, witness_count: (l.nodes || []).filter(n => n.match_type !== 'none' && n.match_type !== 'not_provided').length, witness_tables: (l.nodes || []).filter(n => n.match_type !== 'none' && n.match_type !== 'not_provided').map(n => n.label) })),
    weak_lines: scored.filter(l => l.completeness.tier === '薄弱').map(l => `第${l.line_no}行「${l.item_name}」`),
    statement: caseScore == null
      ? `本案卷可评估费用行不足（多为最小 fixture / 仅上下文材料），完整度未评估。（数据侧口径，与规则覆盖度分开）`
      : `以费用明细行为锚，${scored.length} 行计完整度，金额加权案卷完整度 ${Math.round(caseScore * 100)}/100（${caseTier}）。分布：完整 ${dist.完整.rows} 行 · 部分 ${dist.部分.rows} 行 · 薄弱 ${dist.薄弱.rows} 行${notProvidedTypes.length ? `；整卷未提供：${notProvidedTypes.map(t => MAT_LABEL[t] || t).join('、')}（已从分母移除，不计缺失）` : ''}。（数据侧口径，与规则覆盖度分开）`,
  };
  const includeOnsite = opts.includeOnsite
    || process.env.ONSITE_MODE === '1'
    || process.env.onsite_mode === '1';
  return includeOnsite ? mergeOnsiteLinks(record, chain, opts.caseId || opts.case_id) : chain;
}

// ---------- §7 缺失 → 规则映射 ----------
function ruleHint(key, mt) {
  const table = {
    order: '无医嘱收费',
    dispense: '收费与发药不符',
    gene_report: '超限定支付范围用药（指征缺失）',
    pathology_gene_report: '超限定支付范围用药（指征缺失）',
    lab_report: '有收费无报告',
    icu_record: '有收费无记录',
    nursing_record: '有收费无记录',
    progress_note: '有收费无记录',
  };
  if (mt === 'surgery_record') return key === 'anesthesia_fee' ? '收费项目与诊疗行为不符' : '有收费无记录';
  if (mt === 'anesthesia_record') return '收费项目与诊疗行为不符';
  return table[mt] || '有收费无记录';
}
function escalationReasonFor(escalations, mt) {
  const e = escalations.find(x => (x.add_required || []).includes(mt));
  return e ? e.reason : null;
}
function defaultExpectReason(key, mt) {
  const L = MAT_LABEL[mt] || mt;
  const byKey = {
    order: `本笔${MAT_LABEL_CAT(key)}费用未指向任何医嘱——无医嘱收费本身即违规（合法性缺口）`,
    dispense: `本笔药品费用无对应发药/进销存记录（钱货不对应）`,
    surgery_record: `本笔${MAT_LABEL_CAT(key)}收费无对应手术记录佐证执行（真实性缺口）`,
    anesthesia_record: `本笔麻醉相关收费无对应麻醉记录佐证执行（真实性缺口）`,
    nursing_record: `本笔护理费无对应护理记录佐证执行（真实性缺口）`,
    icu_record: `本笔监护费无对应重症/设备使用记录（真实性缺口）`,
    lab_report: `本笔检验费无对应检验报告（合理性缺口）`,
    pathology_gene_report: `本笔用药无对应病理/基因指征证据（合理性缺口）`,
  };
  return byKey[mt] || `本笔费用缺少必需证据「${L}」`;
}
function MAT_LABEL_CAT(key) {
  return { drug_western: '药品', drug_tcm: '中药', surgery_fee: '手术', anesthesia_fee: '麻醉', nursing_fee: '护理', lab_exam_fee: '检验', exam_fee: '检查', bed_fee: '床位', icu_fee: '监护', treatment_fee: '治疗', material_fee: '耗材' }[key] || '';
}

module.exports = { resolveEvidence, LAYER, LAYER_LABEL, MAT_LABEL, WEIGHT };
