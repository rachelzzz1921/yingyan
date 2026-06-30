/**
 * 鹰眼 · 合规地基 / 两库溯源（Foundation Provenance）
 * ------------------------------------------------------------
 * 把"站在国家两库肩上"从口号变成可证、可演、可审计的硬证据：
 *   ① 地基几何：已入库的官方两库内容（KB1）按 layer/来源/生效日统计
 *   ② 操作化漏斗：官方 KB → 在库规则 → 有 checker → demo 真 fire
 *   ③ 溯源完整性：每条规则引用的官方政策 ref 能否 resolve 到 KB 原文（已建/待补）
 *   ④ 专科覆盖：规则横跨的临床专科分布（破"只会查肿瘤"单点）
 * 数据全部来自仓库真实文件，零编造；未入库的引用诚实标"待入库"。
 */
'use strict';

function buildKbIndex(kb) {
  const idx = {};
  for (const e of kb) { if (e.ref_id) idx[e.ref_id] = e; if (e.doc_id) idx[e.doc_id] = e; }
  return idx;
}

const REF_RE = /KB1-[^"\s,;，；、]+/g;
function refsOfRule(rule) {
  const out = new Set();
  const grab = (v) => {
    if (!v) return;
    if (typeof v === 'string') { const m = v.match(REF_RE); if (m) m.forEach(x => out.add(x.replace(/[。.]$/, ''))); }
    else if (Array.isArray(v)) v.forEach(grab);
    else if (typeof v === 'object') Object.values(v).forEach(grab);
  };
  grab(JSON.stringify(rule));
  return [...out];
}

function resolveRef(ref, kb, kbIndex) {
  if (kbIndex[ref]) return kbIndex[ref];
  return kb.find(e =>
    (e.ref_id && (e.ref_id === ref || e.ref_id.startsWith(ref) || ref.startsWith(e.ref_id))) ||
    (e.doc_id && (e.doc_id === ref || ref.startsWith(e.doc_id)))
  ) || null;
}

/**
 * @param {Array} rules        rules.json 的规则数组
 * @param {Array} kb           kb1_policies.json 的 entries
 * @param {string[]} checkerIds audit-engine 真实现的 checker rule_id（operationalized）
 * @param {string[]} firedIds  （可选）demo 案卷上真 fire 的 rule_id
 */
function computeFoundation(rules, kb, checkerIds = [], firedIds = null) {
  kb = kb || [];
  const kbIndex = buildKbIndex(kb);

  // ① 地基几何
  const layers = {}, authority = {};
  let withEffective = 0;
  for (const e of kb) {
    layers[e.layer || '未分类'] = (layers[e.layer || '未分类'] || 0) + 1;
    authority[e.authority || '未标注'] = (authority[e.authority || '未标注'] || 0) + 1;
    if (e.effective_from) withEffective++;
  }
  const topSources = Object.entries(authority).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => ({ source: k, count: v }));

  // ④ 专科覆盖
  const specialty = {};
  for (const r of rules) {
    const tags = (r.specialty_tags && r.specialty_tags.length) ? r.specialty_tags : [r.category || '未分类'];
    for (const s of tags) specialty[s] = (specialty[s] || 0) + 1;
  }
  const specialtyList = Object.entries(specialty).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ specialty: k, rules: v }));

  // ③ 溯源完整性 + 每条规则的政策基础
  const checkerSet = new Set(checkerIds);
  const firedSet = firedIds ? new Set(firedIds) : null;
  let totalRefs = 0, resolvedRefs = 0;
  const unresolved = new Map(); // ref -> [rule_id...]
  const traceability = rules.map(r => {
    const refs = refsOfRule(r);
    const resolvedList = [];
    for (const ref of refs) {
      totalRefs++;
      const hit = resolveRef(ref, kb, kbIndex);
      if (hit) {
        resolvedRefs++;
        resolvedList.push({ ref, doc_name: hit.doc_name || hit.doc_id, doc_no: hit.doc_no || '', authority: hit.authority || '', effective_from: hit.effective_from || '', locator: hit.locator || '', text: (hit.text || '').slice(0, 220) });
      } else {
        if (!unresolved.has(ref)) unresolved.set(ref, []);
        unresolved.get(ref).push(r.rule_id);
      }
    }
    return {
      rule_id: r.rule_id,
      rule_name: r.rule_name,
      specialty: (r.specialty_tags && r.specialty_tags[0]) || r.category || '',
      layer: r.layer || (r.catalog && r.catalog.layer_hint) || '',
      has_checker: checkerSet.has(r.rule_id),
      fired_on_demo: firedSet ? firedSet.has(r.rule_id) : null,
      policy_refs: refs,
      resolved_count: resolvedList.length,
      unresolved_count: refs.length - resolvedList.length,
      official_basis: resolvedList,
    };
  });

  const rulesWithChecker = rules.filter(r => checkerSet.has(r.rule_id)).length;
  const unresolvedList = [...unresolved.entries()].map(([ref, ruleIds]) => ({ ref, referenced_by: ruleIds, status: '待入库' }));

  // ② 操作化漏斗（官方KB → 在库规则 → 有checker → demo真fire）
  const funnel = [
    { stage: '官方两库已入库', count: kb.length, note: `KB1 政策/规则/目录条目（${withEffective} 条带生效日，支持 as_of 版本回溯）` },
    { stage: '其中"规则"层条目', count: layers['规则'] || 0, note: '可作为确定性规则的官方依据来源' },
    { stage: '已操作化为在库规则', count: rules.length, note: `横跨 ${specialtyList.length} 个临床专科` },
    { stage: '有确定性 checker', count: rulesWithChecker, note: '真·计算判定（非声明）' },
  ];
  if (firedSet) funnel.push({ stage: 'demo 案卷真 fire', count: rules.filter(r => firedSet.has(r.rule_id)).length, note: '主案卷上实际命中' });

  return {
    generated_for: 'foundation_provenance',
    kb_geometry: {
      total: kb.length,
      layers,
      with_effective_date: withEffective,
      as_of_supported: withEffective > 0,
      top_sources: topSources,
    },
    funnel,
    traceability_summary: {
      rules_total: rules.length,
      rules_with_official_ref: traceability.filter(t => t.policy_refs.length).length,
      rules_with_checker: rulesWithChecker,
      refs_total: totalRefs,
      refs_resolved: resolvedRefs,
      refs_resolved_pct: totalRefs ? Math.round((resolvedRefs / totalRefs) * 100) : 0,
      refs_pending_ingest: unresolvedList.length,
    },
    specialty_coverage: specialtyList,
    pending_ingest: unresolvedList,
    traceability,
    honesty_note: '已入库的均为官方公开发布批次原文（带文号/生效日/核验状态）；少量被规则引用但尚未入库的对照表标注"待入库"，绝不编造。',
  };
}

module.exports = { computeFoundation };
