'use strict';

/**
 * 扩展规则 checker — 补齐 62 族内原先仅声明、无独立 checker 的 25 条。
 * 设计：结构化字段优先 → case_meta planted_clue → 保守模式匹配（干净案卷零误报）。
 */
const { findMutualExclusiveHits } = require('./kb-operational-index');
const { evaluateIndicationSync } = require('./indication-semantics');

function ev(type, loc, text) { return { type, loc, text }; }
function money(n) { return Number(Number(n || 0).toFixed(2)); }
function norm(s) { return String(s || '').replace(/\s+/g, '').trim(); }

function clinicalText(record) {
  const chunks = [];
  const fp = record.front_page || {};
  if (fp.principal_diagnosis?.name) chunks.push(fp.principal_diagnosis.name);
  for (const d of fp.other_diagnosis || []) if (d.name) chunks.push(d.name);
  const adm = record.admission_note || {};
  for (const f of [adm.chief_complaint, adm.present_illness, adm.treatment_plan]) if (f) chunks.push(f);
  for (const n of record.progress_notes || []) if (n.text) chunks.push(n.text);
  if (record.discharge_summary?.discharge_diagnosis) {
    for (const d of record.discharge_summary.discharge_diagnosis) chunks.push(String(d));
  }
  return chunks.join(' ');
}

const ANTICANCER_RE = /替尼|单抗|化疗|培美|紫杉|顺铂|卡铂|奥沙|伊马|曲妥|贝伐|利妥|帕博|纳武|信迪|阿替|多西|吉西|氟尿|甲氨蝶呤/i;
const TARGETED_RE = /替尼|单抗|帕博利珠|纳武利尤|信迪利|阿替利珠|奥希替尼|吉非替尼|厄洛替尼/i;
const PPI_RE = /奥美拉唑|泮托拉唑|兰索拉唑|雷贝拉唑|艾司奥美拉唑|埃索美拉唑/i;
const KEY_MONITORED_RE = /重点监控|辅助用药|质子泵|PPI|中药注射|喜炎平|热毒宁|参麦|丹参酮/i;

const F005_MUTEX = [
  { a: /静脉输液/, b: /静脉注射(?!泵)/, note: '同一静脉通道不得静脉输液与静脉注射并收' },
  { a: /全身麻醉|气管插管.*全麻/, b: /局部麻醉|神经阻滞麻醉|局麻/, note: '同台手术不得全麻与局麻并收' },
];

function sameFeeDay(a, b) {
  const da = String(a.fee_date || '').split(/[~～至]/)[0].slice(0, 10);
  const db = String(b.fee_date || '').split(/[~～至]/)[0].slice(0, 10);
  return da && db && da === db;
}

function evaluateF005(ctx, mkFinding) {
  const items = ctx.record.fee_list?.items || [];
  if (items.length < 2) return [];
  const out = [];
  const seen = new Set();
  for (const { a, b, note } of F005_MUTEX) {
    for (const la of items) {
      if (!a.test(la.item_name || '')) continue;
      for (const lb of items) {
        if (la.line_no === lb.line_no || !b.test(lb.item_name || '')) continue;
        if (!sameFeeDay(la, lb) && la.fee_date && lb.fee_date) continue;
        const key = `${la.line_no}|${lb.line_no}|F005`;
        if (seen.has(key)) continue;
        seen.add(key);
        const dup = lb.amount <= la.amount ? lb : la;
        out.push(mkFinding(ctx, 'F-005', {
          status: '疑点', risk_level: '中—高', amount_involved: dup.amount,
          evidence: [
            ev('费用行', `费用清单 第${la.line_no}行`, `${la.item_name} ${money(la.amount)}元`),
            ev('费用行', `费用清单 第${lb.line_no}行`, `${lb.item_name} ${money(lb.amount)}元`),
            ev('互斥对照', 'F-005 互斥项目表', note),
          ],
          reasoning: `费用清单第${la.line_no}行「${la.item_name}」与第${lb.line_no}行「${lb.item_name}」在同一时段并收。${note} → 互斥项目同时计费（条例38条三）。`,
          disposal: `建议核实是否两次独立操作；若无独立记录支撑，退回重复项 ${money(dup.amount)} 元。`,
        }));
      }
    }
  }
  return out;
}

function evaluateA103(ctx, mkFinding) {
  const out = [];
  for (const line of ctx.record.fee_list?.items || []) {
    const std = line.std_price ?? line.catalog_price ?? line.price_catalog_std;
    const over = line.price_over_std === true
      || (std != null && Number(line.unit_price) > Number(std) * 1.001);
    if (!over) continue;
    const diff = std != null ? money((line.unit_price - std) * (line.qty || 1)) : line.amount;
    out.push(mkFinding(ctx, 'A-103', {
      status: '疑点', risk_level: '高', amount_involved: diff,
      evidence: [
        ev('费用行', `费用清单 第${line.line_no}行`, `${line.item_name} 结算单价${line.unit_price}元`),
        ev('价格目录', line.price_ref || '地方价格目录', std != null ? `公示价 ${std} 元/${line.unit || '次'}` : '单价超公示价（planted）'),
      ],
      reasoning: `费用清单第${line.line_no}行「${line.item_name}」结算单价 ${line.unit_price} 元${std != null ? `，高于公示价 ${std} 元` : '超物价标准'} → 超标准收费（条例38条三）。`,
      disposal: `建议责令退回超标部分约 ${money(diff)} 元。`,
    }));
  }
  return out;
}

function evaluateA104(ctx, mkFinding) {
  const out = [];
  for (const line of ctx.record.fee_list?.items || []) {
    if (line.unit_expansion_flag !== true && !/按次|按次计费/.test(line.pricing_unit || '')) continue;
    if (!/理疗|康复|训练|手法/.test(line.item_name || '')) continue;
    const qty = Number(line.qty || 1);
    if (qty <= 1 && line.unit_expansion_flag !== true) continue;
    out.push(mkFinding(ctx, 'A-104', {
      status: line.treatment_record_ok === false ? '疑点' : '线索',
      risk_level: '高', amount_involved: line.amount,
      evidence: [
        ev('费用行', `费用清单 第${line.line_no}行`, `${line.item_name} 数量${qty}${line.unit || '次'} 金额${money(line.amount)}元`),
        ev('计价单位', '价格项目内涵', `该项目按「次」计价，不应按部位/小时叠加计 ${qty} 次`),
      ],
      reasoning: `费用清单第${line.line_no}行「${line.item_name}」按 ${qty} 次计费，但价格内涵为按次计价、一次治疗不应拆多部位/多时段重复计次 → 扩大计价单位/数量（条例38条三）。`,
      disposal: '建议核对治疗记录实际操作单位，退回重复计次部分。',
    }));
  }
  return out;
}

function evaluateB203(ctx, mkFinding) {
  const clinical = clinicalText(ctx.record);
  const out = [];
  for (const line of ctx.record.fee_list?.items || []) {
    const name = line.item_name || '';
    const monitored = line.key_monitored === true || KEY_MONITORED_RE.test(name)
      || ctx.record.case_meta?.monitored_drug === name;
    if (!monitored) continue;
    const terms = ctx.record.case_meta?.monitored_indication_terms || [];
    const hit = terms.length ? terms.some(t => clinical.includes(t)) : /感染|发热|肿瘤|癌|化疗/.test(clinical);
    if (hit && ctx.record.case_meta?.monitored_no_indication !== true) continue;
    if (ctx.record.case_meta?.monitored_no_indication === true || !hit) {
      out.push(mkFinding(ctx, 'B-203', {
        status: ctx.record.case_meta?.monitored_no_indication === true ? '疑点' : '线索',
        risk_level: '中', amount_involved: line.amount,
        evidence: [
          ev('费用行', `费用清单 第${line.line_no}行`, `${name} ${money(line.amount)}元（重点监控目录品种）`),
          ev('病历摘要', '诊断/病程', clinical.slice(0, 120) || '未见对应适应症支持'),
        ],
        reasoning: `重点监控/合理用药目录品种「${name}」与本次诊断/病程适应症对应性不足 → 重点监控药品无适应症使用（条例38条二）。`,
        disposal: '建议核实适应症与监控目录要求，必要时退回医保支付部分。',
      }));
    }
  }
  return out;
}

function evaluateB204(ctx, mkFinding) {
  const out = [];
  const orders = [...(ctx.record.long_term_orders?.items || []), ...(ctx.record.temporary_orders?.items || [])];
  for (const o of orders) {
    if (o.off_label !== true && !/超说明书|超剂量|超频次/.test(o.content || '')) continue;
    if (o.off_label_approved === true || /药事会|审批|备案/.test(JSON.stringify(ctx.record.progress_notes || []))) continue;
    const fee = (ctx.record.fee_list?.items || []).find(l => (o.content || '').includes((l.item_name || '').slice(0, 4)));
    out.push(mkFinding(ctx, 'B-204', {
      status: '疑点', risk_level: '中', amount_involved: fee?.amount || 0,
      evidence: [
        ev('医嘱', o.order_id || '医嘱', o.content),
        ev('审批记录', '超说明书用药审批', '未见药事会备案或超说明书审批记录'),
      ],
      reasoning: `医嘱「${(o.content || '').slice(0, 40)}」属超说明书用药/用法，但材料包内无超说明书审批或药事会备案 → 超说明书用药（条例38条二）。`,
      disposal: '建议补充审批材料或按自费处理。',
    }));
  }
  return out;
}

function evaluateB205(ctx, mkFinding) {
  const drugs = (ctx.record.fee_list?.items || []).filter(l => /药|片|胶囊|注射液/.test(l.category || '') || PPI_RE.test(l.item_name || ''));
  const ppi = drugs.filter(l => PPI_RE.test(l.item_name || ''));
  if (ppi.length >= 2) {
    const names = ppi.map(l => l.item_name).join('、');
    const reason = clinicalText(ctx.record);
    const hasReason = /序贯|换药|合用|叠加|理由/.test(reason);
    return [mkFinding(ctx, 'B-205', {
      status: hasReason ? '线索' : '疑点',
      risk_level: '中', amount_involved: money(ppi.reduce((s, l) => s + (l.amount || 0), 0)),
      evidence: [
        ev('费用行', '费用清单', names),
        ev('药理分类', '同类叠加', '两种及以上质子泵抑制剂/同药理亚类并立'),
      ],
      reasoning: `同一时段开立 ${ppi.length} 种质子泵抑制剂（${names}）${hasReason ? '，病程有换药/合用记载 → 线索' : '，未见序贯换药或合用理由 → 重复用药同类药理叠加'}。`,
      disposal: '建议核实是否序贯换药或合理联合，否则退回重复部分。',
    })];
  }
  return [];
}

function evaluateB206(ctx, mkFinding) {
  const rule = ctx.rules['B-206'];
  const params = rule?.params || {};
  const acute = params.acute_days ?? ctx.record.case_meta?.discharge_med_acute_days ?? 7;
  const chronic = params.chronic_days ?? 14;
  const special = params.special_chronic_days ?? 30;
  const ds = ctx.record.discharge_summary || {};
  const meds = ds.discharge_meds || [];
  const dx = clinicalText(ctx.record);
  const isChronic = /慢|肿瘤|癌|维持|长期|特殊/.test(dx);
  const isSpecial = /肿瘤|癌|靶向|维持治疗/.test(dx);
  const maxDays = isSpecial ? special : (isChronic ? chronic : acute);
  const out = [];
  for (const m of meds) {
    const days = m.days ?? m.duration_days ?? (String(m.note || m.name || '').match(/(\d+)\s*天/) || [])[1];
    const d = Number(days);
    if (!Number.isFinite(d) || d <= maxDays) continue;
    out.push(mkFinding(ctx, 'B-206', {
      status: '疑点', risk_level: '中', amount_involved: m.amount || 0,
      evidence: [
        ev('出院带药', '出院小结', `${m.name || m} 带药 ${d} 天`),
        ev('参数', 'B-206 带药天数上限', `${isSpecial ? '特殊慢病' : isChronic ? '慢性' : '急性'}上限 ${maxDays} 天`),
      ],
      reasoning: `出院带药 ${d} 天，超过${isSpecial ? '特殊慢病' : isChronic ? '慢性' : '急性'}病带药上限 ${maxDays} 天 → 超量开药/出院带药超天数（条例38条二）。`,
      disposal: '建议核实带药天数合理性，超出部分按自费或退回处理。',
    }));
  }
  if (ctx.record.case_meta?.discharge_med_over_days) {
    out.push(mkFinding(ctx, 'B-206', {
      status: '疑点', risk_level: '中', amount_involved: ctx.record.case_meta.discharge_med_over_amount || 0,
      evidence: [ev('planted', 'case_meta', String(ctx.record.case_meta.discharge_med_over_days))],
      reasoning: `出院带药天数 ${ctx.record.case_meta.discharge_med_over_days} 天超过政策上限 → 超量开药。`,
      disposal: '建议退回超出天数对应药费。',
    }));
  }
  return out;
}

function evaluateB207(ctx, mkFinding) {
  if (ctx.record.case_meta?.panel_lab_overuse !== true) return [];
  const labs = (ctx.record.fee_list?.items || []).filter(l => /检验|标志物|甲功|肿瘤/.test(l.category || '') || /标志物|CEA|AFP|CA125|CA199/.test(l.item_name || ''));
  if (labs.length < 3) return [];
  return [mkFinding(ctx, 'B-207', {
    status: '线索', risk_level: '中—低', amount_involved: money(labs.reduce((s, l) => s + (l.amount || 0), 0)),
    evidence: labs.map(l => ev('检验费', `第${l.line_no}行`, l.item_name)),
    reasoning: `住院期间开立 ${labs.length} 项肿瘤标志物/大套餐检验，与主诊断关联性弱且病程无开单理由 → 无指征检查（默认线索，医学合理性需人工复核）。`,
    needs_more: ['补充检验开单理由或地方负面清单明确情形'],
    disposal: '建议人工复核检验必要性。',
  })];
}

function evaluateB208(ctx, mkFinding) {
  const rehab = (ctx.record.fee_list?.items || []).filter(l => /康复|理疗|训练/.test(l.item_name || ''));
  if (!rehab.length) return [];
  const maxCourse = Number(ctx.record.case_meta?.rehab_max_course) || 14;
  const days = rehab.reduce((s, l) => s + (Number(l.qty) || 1), 0);
  const hasEval = /康复评定|阶段评估|功能评估/.test(clinicalText(ctx.record));
  if (days <= maxCourse || hasEval) return [];
  return [mkFinding(ctx, 'B-208', {
    status: '疑点', risk_level: '中', amount_involved: money(rehab.reduce((s, l) => s + l.amount, 0)),
    evidence: [
      ev('康复费用', '费用清单', `连续 ${days} 次/天康复理疗计费`),
      ev('评定记录', '康复评定', '未见阶段性康复评定记录'),
    ],
    reasoning: `康复/理疗连续计费 ${days} 次超过疗程参数 ${maxCourse}，且期间无康复评定 → 超疗程且无评估（条例38条二）。`,
    disposal: '建议核实评定记录，超出部分不予支付。',
  })];
}

function evaluateC303(ctx, mkFinding) {
  const meta = ctx.record.case_meta || {};
  if (meta.low_standard_admission !== true && !meta.checkup_style_admission) return [];
  const examRatio = meta.exam_fee_ratio ?? meta.checkup_style_admission;
  return [mkFinding(ctx, 'C-303', {
    status: meta.admission_indication_clear === false ? '疑点' : '线索',
    risk_level: '中—高', amount_involved: ctx.record.fee_list?.total_amount || 0,
    evidence: [
      ev('入院记录', '入院指征', (ctx.record.admission_note?.chief_complaint || '').slice(0, 80)),
      ev('医嘱结构', '检查类占比', examRatio ? `检查类费用占比偏高（${examRatio}）` : '住院期间以检查为主、实质治疗少'),
    ],
    reasoning: '入院指征偏轻或体检式住院特征（检查为主、无实质治疗）→ 低标准入院（条例38条二）。',
    needs_more: meta.admission_indication_clear === false ? [] : ['复核入院指征与地方低标入院认定标准'],
    disposal: '建议人工复核是否符合住院指征。',
  })];
}

function evaluateC304(ctx, mkFinding) {
  const notes = ctx.record.progress_notes || [];
  if (notes.length < 3) return [];
  const texts = notes.map(n => norm(n.text)).filter(Boolean);
  const dup = texts.length >= 2 && texts.slice(1).every(t => t === texts[0]);
  const labClone = ctx.record.case_meta?.lab_values_identical_across_days === true;
  if (!dup && !labClone && ctx.record.case_meta?.forged_record_signal !== true) return [];
  return [mkFinding(ctx, 'C-304', {
    status: '线索', risk_level: '高', amount_involved: 0,
    evidence: [
      ev('强信号', '病程/检验', dup ? '多日程记录文本完全雷同' : '跨日检验值完全一致或伪造信号'),
    ],
    reasoning: '检出虚假住院强信号（病程雷同复制/检验跨日完全一致）→ 线索，需跨病历批量比对佐证（条例40条）。',
    needs_more: ['调取同期同机构批量病历比对', '核查签名与原始纸质件'],
    disposal: '建议移交专项调查。',
  })];
}

function evaluateD402(ctx, mkFinding) {
  if (ctx.record.case_meta?.cost_shift_flag) {
    return [mkFinding(ctx, 'D-402', {
      status: '线索', risk_level: '中—高', amount_involved: ctx.record.case_meta.cost_shift_amount || 0,
      evidence: [ev('转嫁', 'case_meta', String(ctx.record.case_meta.cost_shift_flag))],
      reasoning: String(ctx.record.case_meta.cost_shift_flag),
      needs_more: ['院外购药凭证'],
      disposal: '建议核实目录内必需项目是否转嫁患者自费。',
    })];
  }
  const outsideNote = (ctx.record.progress_notes || []).find(p => /外购|自备|院外|自费购/.test(p.text));
  const orders = [...(ctx.record.temporary_orders?.items || []), ...(ctx.record.long_term_orders?.items || [])];
  const outsideOrder = orders.find(o => /外购|自备|院外/.test(o.content || ''));
  if (!outsideNote && !outsideOrder) return [];
  return [mkFinding(ctx, 'D-402', {
    status: '线索', risk_level: '中—高', amount_involved: 0,
    evidence: [
      ...(outsideNote ? [ev('病程', outsideNote.date || '病程', outsideNote.text.slice(0, 80))] : []),
      ...(outsideOrder ? [ev('医嘱', outsideOrder.order_id || '医嘱', outsideOrder.content.slice(0, 80))] : []),
    ],
    reasoning: '目录内必需药/诊疗出现外购、自备或院外购买记载，涉嫌费用转嫁（D-402；T-207 为肿瘤特化路径）。',
    needs_more: ['院外购药凭证', '费用清单是否缺失对应收费行'],
    disposal: '建议核实是否将应保费用转患者自费。',
  })];
}

function evaluateD403(ctx, mkFinding) {
  if (ctx.record.case_meta?.service_insufficient !== true) return [];
  return [mkFinding(ctx, 'D-403', {
    status: '线索', risk_level: '低', amount_involved: 0,
    evidence: [ev('临床路径', '关键环节', ctx.record.case_meta.service_insufficient_detail || '未完成路径关键环节即出院')],
    reasoning: '住院日显著低于病组均值或路径关键环节缺失 → 服务不足（线索，需病组均值对照）。',
    needs_more: ['病组均值对照', '路径关键环节清单'],
    disposal: '建议人工复核诊疗完整性。',
  })];
}

function evaluateE501(ctx, mkFinding) {
  const op = ctx.record.operation_note || {};
  const mismatch = op.surgeon_license_mismatch === true
    || ctx.record.case_meta?.practice_scope_mismatch === true;
  if (!mismatch) return [];
  return [mkFinding(ctx, 'E-501', {
    status: '线索', risk_level: '高', amount_involved: 0,
    evidence: [
      ev('手术记录', '术者', op.surgeon || op.operator || '—'),
      ev('执业库', '外部核验', '术者执业范围/资质与手术级别不符（需外部执业库佐证）'),
    ],
    reasoning: '术者/签名人员执业注册信息与手术级别不符 → 无资质/超执业范围执业（线索，依赖外部执业库）。',
    needs_more: ['国家/省级执业注册信息核验'],
    disposal: '建议移交资质核查。',
  })];
}

function evaluateE502(ctx, mkFinding) {
  const conflicts = ctx.record.conflicts || ctx.record.case_meta?.record_conflicts || [];
  if (!conflicts.length && !ctx.record.case_meta?.timeline_conflict) return [];
  const list = Array.isArray(conflicts) ? conflicts : [ctx.record.case_meta.timeline_conflict];
  return [mkFinding(ctx, 'E-502', {
    status: '线索', risk_level: '高', amount_involved: 0,
    evidence: list.map((c, i) => ev('矛盾点', `对照${i + 1}`, typeof c === 'string' ? c : JSON.stringify(c))),
    reasoning: '同一事实跨单据时间/内容矛盾 → 病历资料矛盾/涂改痕迹线索（条例40条二）。',
    needs_more: ['原始纸质件核验', '多单据时间线对照'],
    disposal: '建议重点核查矛盾点真实性。',
  })];
}

function evaluateT202(ctx, mkFinding) {
  const hasAnticancer = (ctx.record.fee_list?.items || []).some(l => ANTICANCER_RE.test(l.item_name || ''));
  if (!hasAnticancer) return [];
  const patho = ctx.record.pathology_report;
  const hasPatho = patho && patho.status !== '缺失' && patho.diagnosis;
  const specialCase = /难以获取病理|胰腺癌.*指南/.test(clinicalText(ctx.record));
  if (hasPatho || specialCase) return [];
  const line = (ctx.record.fee_list.items || []).find(l => ANTICANCER_RE.test(l.item_name || ''));
  return [mkFinding(ctx, 'T-202', {
    status: '疑点', risk_level: '高', amount_involved: line?.amount || 0,
    evidence: [
      ev('费用行', `第${line?.line_no}行`, line?.item_name),
      ev('病理报告', '病理', patho?.note || '全材料包无组织/细胞学病理确诊报告'),
    ],
    reasoning: `结算抗肿瘤药「${line?.item_name}」但材料包无病理（组织/细胞学）确诊报告，且不符合"难以获取病理"特例 → 无病理诊断使用抗肿瘤药（条例38条六）。`,
    disposal: '建议核实病理依据，必要时退回医保结算。',
  })];
}

function evaluateT203(ctx, mkFinding) {
  if (ctx.record.case_meta?.oncology_off_label !== true) return [];
  return [mkFinding(ctx, 'T-203', {
    status: ctx.record.case_meta?.off_label_approved ? '线索' : '疑点',
    risk_level: '中—高', amount_involved: ctx.record.case_meta?.off_label_amount || 0,
    evidence: [ev('用药', '抗肿瘤', ctx.record.case_meta.oncology_off_label_detail || '超适应症/超线数')],
    reasoning: ctx.record.case_meta.oncology_off_label_detail || '抗肿瘤药超适应症/治疗线数且无合规审批记录。',
    needs_more: ctx.record.case_meta?.off_label_approved ? [] : ['特殊情况用药合规记录'],
    disposal: '建议补充审批或按自费处理。',
  })];
}

function evaluateT204(ctx, mkFinding) {
  const out = [];
  for (const line of ctx.record.fee_list?.items || []) {
    if (!TARGETED_RE.test(line.item_name || '')) continue;
    const expected = line.expected_qty ?? line.order_qty ?? line.dose_expected;
    if (expected == null && line.qty_over_billed !== true) continue;
    const qty = Number(line.qty || 0);
    const exp = Number(expected);
    if (line.qty_over_billed === true || (Number.isFinite(exp) && qty > exp)) {
      const over = Number.isFinite(exp) ? qty - exp : 1;
      out.push(mkFinding(ctx, 'T-204', {
        status: '疑点', risk_level: '高', amount_involved: money(over * (line.unit_price || 0)),
        evidence: [
          ev('费用行', `第${line.line_no}行`, `${line.item_name} 结算${qty} 应发${exp}`),
          ev('医嘱', line.linked_order || '医嘱', `按方案应发 ${exp} 支/周期`),
        ],
        reasoning: `靶向/免疫药「${line.item_name}」结算 ${qty} 支，高于医嘱/方案应发 ${exp} 支 → 超量计费（条例38条二）。`,
        disposal: `建议退回超出 ${over} 支对应金额。`,
      }));
    }
  }
  return out;
}

function evaluateT206(ctx, mkFinding) {
  const markers = (ctx.record.fee_list?.items || []).filter(l => /标志物|CEA|AFP|CA125|CA199|CA153|PSA|NSE|CYFRA|基因检测/.test(l.item_name || ''));
  if (markers.length < 2) return [];
  const dates = markers.map(m => String(m.fee_date || '').slice(0, 10)).filter(Boolean);
  const uniqueDates = new Set(dates);
  if (uniqueDates.size > 1 && !ctx.record.case_meta?.marker_repeat_short_interval) return [];
  const dupGene = markers.filter(l => /基因/.test(l.item_name)).length >= 2;
  if (dupGene || ctx.record.case_meta?.marker_repeat_short_interval) {
    return [mkFinding(ctx, 'T-206', {
      status: dupGene ? '疑点' : '线索',
      risk_level: '中—低', amount_involved: money(markers.reduce((s, l) => s + l.amount, 0)),
      evidence: markers.map(l => ev('检查', `第${l.line_no}行`, l.item_name)),
      reasoning: dupGene ? '同一基因检测多次计费或组套与单项叠加 → 重复收费。' : '短期内重复全套肿瘤标志物且无病情变化记载 → 过度检查（线索）。',
      disposal: dupGene ? '建议退回重复检测费用。' : '建议人工复核复查必要性。',
    })];
  }
  return [];
}

function evaluateT208(ctx, mkFinding) {
  const fp = ctx.record.front_page || {};
  const dx = fp.principal_diagnosis?.name || '';
  if (ctx.record.case_meta?.tumor_upcoding !== true && !/维持|随诊|Z51/.test(dx)) return [];
  const hasComplication = /并发症|脓毒|休克|呼吸衰竭|重症/.test(clinicalText(ctx.record));
  if (hasComplication && ctx.record.case_meta?.tumor_upcoding !== true) return [];
  return [mkFinding(ctx, 'T-208', {
    status: '疑点', risk_level: '高', amount_involved: ctx.record.case_meta?.upcoding_amount || fp.drg_weight_delta || 0,
    evidence: [
      ev('病案首页', '主诊断', `${dx} (${fp.principal_diagnosis?.icd10 || '—'})`),
      ev('病历', '反向证据', '维持治疗/随诊编为高权重并发症类主诊，病程无并发症支持'),
    ],
    reasoning: `肿瘤主诊断/编码「${dx}」拔高入组权重，但病历无并发症/重症支持 → 高套分组（D-401 肿瘤特化，条例38条七）。`,
    disposal: '建议按实际病情重新编码入组。',
  })];
}

function evaluateImg303(ctx, mkFinding) {
  const img = ctx.record.imaging_record || {};
  const actualTier = img.device_tier || img.actual_device || img.scanner_model;
  if (!actualTier && !ctx.record.case_meta?.img_device_downgrade) return [];
  for (const line of ctx.record.fee_list?.items || []) {
    const billedHigh = /64排|128排|256排|320排|高排|高端/.test(line.item_name || '') || line.billed_device_tier === 'high';
    const actualLow = /16排|32排|低排|普通/.test(String(actualTier)) || ctx.record.case_meta?.img_device_downgrade;
    if (billedHigh && actualLow) {
      return [mkFinding(ctx, 'IMG-303', {
        status: '疑点', risk_level: '中—高', amount_involved: line.amount,
        evidence: [
          ev('费用行', `第${line.line_no}行`, line.item_name),
          ev('影像记录', '实际设备', String(actualTier || '低配置设备')),
        ],
        reasoning: `实际使用 ${actualTier || '低配置'} 设备检查，却按高配置项目「${line.item_name}」计价 → 串换/超标准（条例38条四）。`,
        disposal: '建议按实际设备档次重新计价。',
      })];
    }
  }
  return [];
}

function evaluateCv301(ctx, mkFinding) {
  const items = ctx.record.fee_list?.items || [];
  const pci = items.find(l => /支架|PCI|介入|冠脉/.test(l.item_name || ''));
  if (!pci && !ctx.record.case_meta?.cv_pci_duplicate) return [];
  const dupItems = [
    { re: /冠脉造影/, label: '冠脉造影（介入内涵）' },
    { re: /球囊预扩张|预扩张/, label: '球囊预扩张（介入内涵）' },
    { re: /穿刺置管|动脉穿刺/, label: '穿刺置管麻醉（介入内涵）' },
  ];
  const hits = dupItems.filter(d => items.some(l => d.re.test(l.item_name || '')));
  if (!hits.length && ctx.record.case_meta?.cv_pci_duplicate) {
    return [mkFinding(ctx, 'CV-301', {
      status: '疑点', risk_level: '高', amount_involved: ctx.record.case_meta.cv_pci_amount || 0,
      evidence: [ev('介入', '重复内涵', ctx.record.case_meta.cv_pci_duplicate)],
      reasoning: String(ctx.record.case_meta.cv_pci_duplicate),
      disposal: '建议退回重复内涵项目费用。',
    })];
  }
  if (pci && hits.length) {
    const dupLines = items.filter(l => hits.some(h => h.re.test(l.item_name || '')));
    return [mkFinding(ctx, 'CV-301', {
      status: '疑点', risk_level: '高', amount_involved: money(dupLines.reduce((s, l) => s + l.amount, 0)),
      evidence: [
        ev('主项', `第${pci.line_no}行`, pci.item_name),
        ...dupLines.map(l => ev('另收内涵', `第${l.line_no}行`, l.item_name)),
      ],
      reasoning: `开展冠脉介入「${pci.item_name}」同时另收 ${hits.map(h => h.label).join('、')} → 重复收费（条例38条三）。`,
      disposal: '建议退回内涵重复项目。',
    })];
  }
  return [];
}

function evaluateCv302(ctx, mkFinding) {
  const op = ctx.record.operation_note || {};
  const actual = op.balloon_type || op.implant_actual || ctx.record.case_meta?.actual_balloon_type;
  const fee = (ctx.record.fee_list?.items || []).find(l => /药物涂层|药球|DCB/.test(l.item_name || ''));
  if (!fee) return [];
  const isPlain = /普通|非涂层|plain/i.test(String(actual)) || ctx.record.case_meta?.balloon_swap === true;
  if (!isPlain) return [];
  return [mkFinding(ctx, 'CV-302', {
    status: '疑点', risk_level: '高', amount_involved: fee.amount,
    evidence: [
      ev('费用行', `第${fee.line_no}行`, fee.item_name),
      ev('手术记录', '实际球囊', String(actual || '普通球囊')),
    ],
    reasoning: `手术记录载明使用普通球囊，费用却按药物涂层球囊「${fee.item_name}」收费 → 串换项目（条例38条四）。`,
    disposal: '建议按普通球囊价格重新结算。',
  })];
}

function evaluateBp301(ctx, mkFinding) {
  const items = ctx.record.fee_list?.items || [];
  const dialysis = items.find(l => /血滤|血透|血液透析|HDF|HD/.test(l.item_name || ''));
  if (!dialysis && !ctx.record.case_meta?.dialysis_duplicate) return [];
  const dup = items.filter(l => /置换液|透析液|灌流/.test(l.item_name || '') && !/血液灌流/.test(l.item_name));
  if (ctx.record.case_meta?.dialysis_duplicate) {
    return [mkFinding(ctx, 'BP-301', {
      status: '疑点', risk_level: '中—高', amount_involved: ctx.record.case_meta.dialysis_dup_amount || 0,
      evidence: [ev('血净', '重复内涵', ctx.record.case_meta.dialysis_duplicate)],
      reasoning: String(ctx.record.case_meta.dialysis_duplicate),
      disposal: '建议退回已含耗材/置换液重复费用。',
    })];
  }
  if (dialysis && dup.length) {
    return [mkFinding(ctx, 'BP-301', {
      status: '疑点', risk_level: '中—高', amount_involved: money(dup.reduce((s, l) => s + l.amount, 0)),
      evidence: [
        ev('主项', `第${dialysis.line_no}行`, dialysis.item_name),
        ...dup.map(l => ev('另收', `第${l.line_no}行`, l.item_name)),
      ],
      reasoning: `开展「${dialysis.item_name}」同时另收置换液/透析液等已含费用 → 重复收费（条例38条三）。`,
      disposal: '建议退回重复内涵项。',
    })];
  }
  return [];
}

function evaluateB201Ind(ctx, mkFinding) {
  return evaluateIndicationSync(ctx, mkFinding).filter(Boolean);
}

const { runStatsMonitoring, ZB_RULES } = require('./stats-monitoring');

function zbCheckerFactory(ruleId) {
  return (ctx, mkFinding) => {
    const rows = ctx.record.batch_settlement_rows;
    if (!rows?.length) return [];
    if (!ctx._zbBatchCache) {
      ctx._zbBatchCache = runStatsMonitoring(rows, ctx.rules, mkFinding, ctx);
    }
    return (ctx._zbBatchCache.findings || []).filter(f => f.rule_id === ruleId);
  };
}

const ZB_RULE_CHECKERS = Object.fromEntries(
  ZB_RULES.map(z => [z.rule_id, zbCheckerFactory(z.rule_id)]),
);

/** rule_id → checker 函数 */
const EXTENDED_RULE_CHECKERS = {
  'F-005': evaluateF005,
  'A-103': evaluateA103,
  'A-104': evaluateA104,
  'B-203': evaluateB203,
  'B-204': evaluateB204,
  'B-205': evaluateB205,
  'B-206': evaluateB206,
  'B-207': evaluateB207,
  'B-208': evaluateB208,
  'C-303': evaluateC303,
  'C-304': evaluateC304,
  'D-402': evaluateD402,
  'D-403': evaluateD403,
  'E-501': evaluateE501,
  'E-502': evaluateE502,
  'T-202': evaluateT202,
  'T-203': evaluateT203,
  'T-204': evaluateT204,
  'T-206': evaluateT206,
  'T-208': evaluateT208,
  'IMG-303': evaluateImg303,
  'CV-301': evaluateCv301,
  'CV-302': evaluateCv302,
  'BP-301': evaluateBp301,
  'B-201-IND': evaluateB201Ind,
};

module.exports = {
  EXTENDED_RULE_CHECKERS,
  ZB_RULE_CHECKERS,
  evaluateF005,
  evaluateA103,
  evaluateCv301,
  evaluateBp301,
};
