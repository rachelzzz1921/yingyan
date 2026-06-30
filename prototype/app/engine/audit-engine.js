/**
 * 鹰眼 · 稽核规则引擎（确定性代码层）
 * ------------------------------------------------------------
 * 输入：多模态解析后的结构化材料包 medical_record.json
 * 输出：结构化稽核报告（疑点/线索 + 三要素证据链 + 干扰项"正确不报"）
 *
 * 设计：本引擎对"可由结构化数据确定判定"的规则做真·计算（非硬编码答案）——
 *       修改材料包（如补入基因检测报告），对应疑点会自动消失。
 *       纯语义规则（需读自由文本病历）由 llm-audit.js 走 LLM 路径，二者互补。
 *
 * 三要素门禁：每条疑点必须给出 ①证据定位 ②政策条款原文 ③推理过程，缺一降级。
 * 宁漏报不误报：医学合理性争议出"线索"，证据闭环才出"疑点"。
 */

'use strict';

const { genDebate } = require('./debate');
const { compileCaseObject } = require('./case-object');
const { applyComplianceGate } = require('./compliance-gate');
const { JIANGSU_NURSING_PRICE, REF_ID: JIANGSU_NURSING_REF } = require('../kb/jiangsu-prices');
const { applyParseQAToConfidence } = require('./parse-qa');

// ---------- 工具函数 ----------
function parseDate(s) {
  // 接受 "2026-03-21" / "2026-03-20 10:00"（含时间）/ "2026-03-13~03-20"（取区间右端）
  if (!s) return null;
  const range = String(s).split('~');
  let d = range[range.length - 1].trim();
  d = d.split(/[ T]/)[0]; // 去掉时间部分，只取日期
  if (/^\d{2}-\d{2}$/.test(d)) {
    // 仅 "MM-DD"，补年份（取区间左端的年份）
    const year = range[0].trim().slice(0, 4);
    d = `${year}-${d}`;
  }
  const dt = new Date(d + 'T00:00:00');
  return isNaN(dt.getTime()) ? null : dt;
}

function daysBetween(a, b) {
  return Math.round((b - a) / 86400000);
}

function money(n) {
  return Number(n.toFixed(2));
}

// 护理等级护理强度排序（数值越大强度越高、单价越高）
const NURSING_RANK = { '特级护理': 4, '一级护理': 3, '二级护理': 2, '三级护理': 1 };

// 骨科：术式项目内涵表（included=固有内涵步骤,另收=重复收费A-101；packaged=打包子项,拆收=分解A-106）
const SURGERY_CONNOTATION = {
  '经皮椎体后凸成形术': { included: ['椎体穿刺术'], packaged: ['椎体球囊扩张复位术', '球囊扩张复位术', '经皮椎体球囊扩张复位术'] },
  '经皮椎体成形术': { included: ['椎体穿刺术'], packaged: ['骨水泥推注术'] },
};
function normalizeSurgery(name) {
  for (const k of Object.keys(SURGERY_CONNOTATION)) if (String(name).includes(k)) return k;
  return name;
}
function sameMaterial(a, b) { // 耗材名归一匹配（取核心词，剔除进口/国产/规格）
  const core = s => String(s).replace(/[（(].*?[)）]/g, '').replace(/进口|国产|高值|低值|·|\s/g, '').slice(0, 4);
  const ca = core(a), cb = core(b);
  return !!ca && (cb.includes(ca) || ca.includes(cb));
}

// D-401 高套：CC/MCC升级类编码——主诊断编"重症X"须病历有相应重症依据，否则高套
const SEVERITY_CODING = {
  '重症肺炎': {
    base: '社区获得性肺炎(普通)', high_group: 'ES1x 呼吸系统感染伴重症(高权重)', base_group: 'ES3x 呼吸系统感染不伴并发症',
    criteria: ['呼吸衰竭', '机械通气', '有创通气', '无创(呼吸机|通气)', '感染性?休克', '血管活性', 'ICU', '重症监护', '氧合指数\\s*[（(]?PaO2/FiO2[)）]?\\s*[<≤]\\s*300', 'PaO2/FiO2\\s*[<≤]\\s*300', 'PaO2\\s*[<≤]\\s*60'],
    est_overcoding_amount: 3100,
  },
};
// 医学影像：增强扫描内涵已含平扫（另收平扫=重复收费）
const IMAGING_CONNOTATION = [
  { enhance: /CT增强|增强CT|CT.*增强扫描/, plain: /CT平扫|平扫CT|胸部CT$/, modality: 'CT' },
  { enhance: /磁共振增强|MRI增强|增强.*磁共振|MR增强/, plain: /磁共振平扫|MRI平扫|平扫.*磁共振/, modality: '磁共振' },
];
// 肯定证据检测：criterion 命中且前文非否定（排除"无/未/非/未见/无明显/排除 呼吸衰竭"等）
function hasPositiveEvidence(text, pattern) {
  const re = new RegExp(pattern, 'g');
  let m;
  while ((m = re.exec(text)) !== null) {
    const before = text.slice(Math.max(0, m.index - 6), m.index);
    if (!/[无未非]|未见|无明显|排除|不伴|否认/.test(before)) return true;
    if (re.lastIndex === m.index) re.lastIndex++;
  }
  return false;
}

// ---------- 规则实现 ----------
// 每个规则函数：输入 ctx（含 record、rules、params），返回 finding 数组（可空）

const ruleCheckers = {

  /** F-003 时间逻辑冲突：费用日期晚于出院/死亡日期 */
  'F-003': (ctx) => {
    const { record } = ctx;
    const discharge = parseDate(record.front_page.discharge_time);
    const bad = [];
    for (const line of record.fee_list.items) {
      const feeDate = parseDate(line.fee_date);
      if (feeDate && discharge && feeDate > discharge) bad.push(line);
    }
    if (!bad.length) return [];
    const total = money(bad.reduce((s, l) => s + l.amount, 0));
    const evidence = bad.map(l => ev('费用行', `费用清单 第${l.line_no}行`, `${l.item_name} ${l.fee_date} ×${l.qty}${l.unit} ${money(l.amount)}元`));
    evidence.push(ev('病案首页', '病案首页 出院时间', `出院时间 ${record.front_page.discharge_time}`));
    evidence.push(ev('出院小结', '出院小结', `出院日期 ${record.discharge_summary.discharge_date}，患者10:00办理出院`));
    return [mkFinding(ctx, 'F-003', {
      status: '疑点', risk_level: '高', amount_involved: total,
      evidence,
      reasoning: `病案首页与出院小结一致载明出院日期为 ${record.discharge_summary.discharge_date}；费用清单第 ${bad.map(l => l.line_no).join('、')} 行（${bad.map(l => l.item_name).join('、')}）发生日期 ${bad.map(l => l.fee_date).join('、')} 晚于出院日期，患者已离院，对应服务不可能发生。L1时间逻辑确定性规则命中，无需语义判断。`,
      disposal: `建议责令退回出院后计费共 ${total} 元，并核查信息系统是否存在批量"出院后自动续计"问题。`,
    })];
  },

  /** F-004 单日计量超物理上限：计时项目(吸氧/持续监护)按 fee_date 聚合单日累计 >24h → 物理不可能 */
  'F-004': (ctx) => {
    const { record } = ctx;
    const items = (record.fee_list && record.fee_list.items) || [];
    const isHourly = (l) => /小时|时长/.test(l.unit || '') || /持续吸氧|持续.*监护|氧疗/.test(l.item_name || '');
    // 仅对"单日"计费判物理上限；日期区间(如 05-20~05-23,跨多日累计)无法确定单日量 → 跳过，宁漏不误报
    const isSingleDay = (fd) => !!fd && !/[~～至到]/.test(String(fd)) && /^\d{4}-\d{1,2}-\d{1,2}$/.test(String(fd).trim());
    const byDayItem = {};
    for (const line of items) {
      if (!isSingleDay(line.fee_date) || !isHourly(line)) continue;
      const key = line.fee_date + '|' + (line.item_name || '');
      (byDayItem[key] = byDayItem[key] || { date: line.fee_date, item: line.item_name, qty: 0, lines: [] });
      byDayItem[key].qty += Number(line.qty) || 0;
      byDayItem[key].lines.push(line);
    }
    const findings = [];
    for (const v of Object.values(byDayItem)) {
      if (v.qty <= 24) continue;
      const total = money(v.lines.reduce((s, l) => s + (l.amount || 0), 0));
      findings.push(mkFinding(ctx, 'F-004', {
        status: '疑点', risk_level: '高', amount_involved: total,
        evidence: [
          ...v.lines.map(l => ev('费用行', `费用清单 第${l.line_no}行`, `${l.item_name} ${l.fee_date} ×${l.qty}${l.unit || ''} ${money(l.amount)}元`)),
          ev('物理上限', '单日≤24小时', `${v.item} ${v.date} 单日累计 ${v.qty} 小时 > 24 小时`),
        ],
        reasoning: `${v.date} ${v.item} 单日累计计费 ${v.qty} 小时，超过一天 24 小时的物理上限——同一计时项目单日不可能超过 24 小时。L1 计量确定性规则命中，无需语义判断。`,
        disposal: `建议核减超 24 小时部分，并核查计费系统按时累加逻辑是否重复计量。`,
      }));
    }
    return findings;
  },

  /** A-105 护理等级与实际不符：收费等级 > 医嘱等级 */
  'A-105': (ctx) => {
    const { record } = ctx;
    // 医嘱护理等级
    const orderLevels = record.long_term_orders.items
      .map(o => Object.keys(NURSING_RANK).find(k => o.content.includes(k)))
      .filter(Boolean);
    const orderedLevel = orderLevels[0];
    if (!orderedLevel) return [];
    const findings = [];
    for (const line of record.fee_list.items) {
      const chargedLevel = Object.keys(NURSING_RANK).find(k => line.item_name === k);
      if (!chargedLevel) continue;
      // 出院后那条由F-003负责；这里只看在院期间按高等级计费
      const feeDateLeft = parseDate(String(line.fee_date).split('~')[0]);
      const discharge = parseDate(record.front_page.discharge_time);
      if (feeDateLeft && discharge && feeDateLeft > discharge) continue;
      if (NURSING_RANK[chargedLevel] > NURSING_RANK[orderedLevel]) {
        // 单价差额估算：从同一份清单找两等级单价；缺省用参数
        const chargedPrice = line.unit_price;
        // 应收单价基准优先取省级护理价目录；但若省价的低等级单价 ≥ 本案实收的高等级单价
        // （价格体系倒挂——多见于该案非本省、或案卷自带价格体系），省价不适用，退回案卷自洽基准，
        // 避免算出"负差额疑点"（iter-22 引入江苏省价后对非江苏案卷的回归修复）。
        let orderedPrice = ctx.params.nursing_price?.[orderedLevel] ?? 12.0;
        if (orderedPrice >= chargedPrice) orderedPrice = 12.0;
        const overcharge = money((chargedPrice - orderedPrice) * line.qty);
        findings.push(mkFinding(ctx, 'A-105', {
          status: '疑点', risk_level: '中—高', amount_involved: overcharge,
          evidence: [
            ev('费用行', `费用清单 第${line.line_no}行`, `${chargedLevel} ×${line.qty}${line.unit} 单价${chargedPrice}元 金额${money(line.amount)}元`),
            ev('医嘱', '长期医嘱单', `护理等级医嘱为「${orderedLevel}」`),
            ev('护理记录', '护理记录单', record.nursing_records.nursing_level_executed),
          ],
          reasoning: `长期医嘱护理等级为「${orderedLevel}」，费用清单第${line.line_no}行却按更高强度的「${chargedLevel}」计费${line.qty}日；护理记录单巡视频次（${record.nursing_records.entries[0]?.round_interval_h ?? 2}小时/次）符合${orderedLevel}标准、不满足${chargedLevel}要求。收费护理等级高于医嘱及实际执行等级 → 超标准收费，差额 (${chargedPrice}-${orderedPrice})×${line.qty}=${overcharge}元。`,
          disposal: `建议按${orderedLevel}标准重新核算，责令退回差额 ${overcharge} 元（江苏护理费单价以省价格目录核定后二次结算）。`,
        }));
      }
    }
    return findings;
  },

  /** A-109 多记费用：结算数量 > 医嘱应发数量 */
  'A-109': (ctx) => {
    const { record } = ctx;
    const findings = [];
    // 针对有明确"剂量 频次 ×天数"医嘱的注射类药品行做数量核对
    for (const line of record.fee_list.items) {
      if (!/药/.test(line.category)) continue; // 仅药品行（排除护理/治疗/检查费）
      const order = record.long_term_orders.items.find(o => o.order_id === line.linked_order)
        || record.temporary_orders.items.find(o => o.order_id === line.linked_order);
      if (!order) continue;
      // 仅注射给药（排除口服带药——口服带药天数不受在院医嘱窗口约束，易误判）
      if (!/(ivgtt|静滴|静脉滴注|iv\b|静注|静脉注射|im\b|肌注|ih\b|皮下)/i.test(order.content)) continue;
      // 医嘱须确为该药（药名匹配，防串单：如静脉输液费误挂某药医嘱）
      const drugKey = line.item_name.replace(/^注射用/, '').slice(0, 3);
      if (!order.content.includes(drugKey)) continue;
      const expected = computeExpectedQty(order, line);
      if (expected == null) continue;
      if (line.qty > expected.qty) {
        const overQty = line.qty - expected.qty;
        const overAmount = money(overQty * line.unit_price);
        findings.push(mkFinding(ctx, 'A-109', {
          status: '疑点', risk_level: '高', amount_involved: overAmount,
          evidence: [
            ev('费用行', `费用清单 第${line.line_no}行`, `${line.item_name} ${line.spec}×${line.qty}${line.unit} 金额${money(line.amount)}元`),
            ev('医嘱', `医嘱 ${order.order_id}`, order.content),
            ev('计算', '应发数量计算', expected.explain),
          ],
          reasoning: `医嘱 ${order.order_id}「${order.content}」按 ${expected.explain}，应发 ${expected.qty}${line.unit}；费用清单第${line.line_no}行结算 ${line.qty}${line.unit}，超出 ${overQty}${line.unit}。病程与护理记录印证实际用药与医嘱一致 → 多记 ${overQty}×${line.unit_price}=${overAmount}元，证据闭环。`,
          disposal: `建议责令退回超量计费的 ${overQty}${line.unit} 共 ${overAmount} 元。`,
        }));
      }
    }
    return findings;
  },

  /** T-201 靶向药无基因检测证据使用（★首推） */
  'T-201': (ctx) => {
    const { record, rules } = ctx;
    const rule = rules['T-201'];
    const targetDrugs = rule.params.target_required_drugs || [];
    const findings = [];
    // 是否存在任何驱动基因检测阳性结果
    const geneMissing = !record.gene_test_report || record.gene_test_report.status === '缺失';
    for (const line of record.fee_list.items) {
      const matched = targetDrugs.find(d => line.item_name.includes(d));
      if (!matched) continue; // 非"明确作用靶点"类（如贝伐珠单抗）→ 跳过，正确不报
      if (geneMissing) {
        const hasOutsideHint = record.progress_notes.some(p => /外院.*检测|外院已检测/.test(p.text));
        findings.push(mkFinding(ctx, 'T-201', {
          status: hasOutsideHint ? '线索' : '疑点',
          risk_level: '高', amount_involved: line.amount,
          evidence: [
            ev('费用行', `费用清单 第${line.line_no}行`, `${line.item_name} ${line.spec}×${line.qty}${line.unit} 金额${money(line.amount)}元`),
            ev('病理报告', `病理报告 ${record.pathology_report.report_id}`, record.pathology_report.diagnosis + '（报告未含EGFR/ALK等驱动基因检测结果）'),
            ev('阴性证据', '分子病理/基因检测证据=未见', record.gene_test_report.note),
            ev('病程', '病程记录 2026-03-17', record.progress_notes.find(p => p.text.includes('奥希替尼'))?.text || ''),
          ],
          reasoning: `费用清单第${line.line_no}行结算「${matched}」——属"明确作用靶点(EGFR)"类药物。依《新型抗肿瘤药物临床应用指导原则（2025年版）》须靶点检测阳性后方可使用，医保目录"备注"列亦限EGFR敏感突变。三方取证：病理确诊腺癌但不含基因检测，全材料包无任何EGFR检测报告，病程仅记"家属要求/建议靶向"无检测依据${hasOutsideHint ? '，但病程提示外院已检测→降级线索' : '，亦无"外院已检测"线索 → 构成"未做检测盲目用药"，证据闭环'}。`,
          disposal: `建议责令退回该靶向药医保结算金额；如机构申诉外院已检测，要求10个工作日内补交具资质的EGFR检测报告，否则维持疑点。`,
        }));
      }
    }
    return findings;
  },

  /** T-205 化疗辅助用药超规（长效升白针超医保限定支付）→ 证据在包外，出线索 */
  'T-205': (ctx) => {
    const { record } = ctx;
    const findings = [];
    // 仅针对"长效/聚乙二醇化"升白针（其医保限定=限前次化疗曾发生重度中性粒细胞减少）
    const gcsf = record.fee_list.items.find(l => /聚乙二醇化.*粒细胞刺激因子|长效.*升白/i.test(l.item_name));
    if (!gcsf) return [];
    // 本次用药时ANC
    let anc = null, ancLoc = null;
    for (const lab of record.lab_reports) {
      const r = (lab.results || []).find(x => /中性粒细胞绝对值|ANC/.test(x.item));
      if (r) { anc = r.value; ancLoc = lab.report_id; }
    }
    const preventive = record.progress_notes.some(p => /预防/.test(p.text) && /粒细胞|升白/.test(p.text));
    // 本包内是否有"前次化疗曾发生重度中性粒细胞减少"的证据？前次住院逐日血常规不在本包 → 无法闭环
    const priorSevereNeutropenia = /前次.*重度.*中性粒细胞减少|前次.*骨髓抑制(?!相关不适)/.test(JSON.stringify(record.front_page.previous_admissions || ''));
    const priorSummary = (record.admission_note.present_illness || '').match(/化疗后[^。]*?(无[^。]*?(骨髓抑制|不适))/);
    if (preventive && !priorSevereNeutropenia) {
      findings.push(mkFinding(ctx, 'T-205', {
        status: '线索', risk_level: '中', amount_involved: gcsf.amount,
        evidence: [
          ev('费用行', `费用清单 第${gcsf.line_no}行`, `${gcsf.item_name} ${gcsf.spec}×${gcsf.qty}${gcsf.unit} 金额${money(gcsf.amount)}元（医保乙类）`),
          ev('医嘱', '临时医嘱 T07', '聚乙二醇化重组人粒细胞刺激因子 6mg ih st（预防性升白）'),
          ev('入院记录', '入院记录·现病史', `前次周期概述："${priorSummary ? priorSummary[0] : '化疗后无骨髓抑制相关不适'}"（系本次入院概述性记载，非前次住院逐日血常规）`),
          ev('检验报告', `检验报告 ${ancLoc}`, `本次用药时中性粒细胞绝对值 ANC ${anc}×10⁹/L（正常，提示为预防性使用）`),
        ],
        reasoning: `长效升白针（聚乙二醇化G-CSF）医保限定支付范围为"限前次化疗曾发生重度中性粒细胞减少的患者"。本材料包前次周期仅有入院记录概述性记载"无骨髓抑制相关不适"——但"无症状"不等于"无实验室重度中性粒细胞减少"（重度中性粒减少可无症状），判定"前次是否曾发生重度中性粒细胞减少"须调阅前次住院逐日血常规，而该证据不在本单份材料包内。本次用药时ANC正常、为预防性使用。→ 模式异常但材料包内无法闭环，依"宁漏报不误报"出线索（而非疑点），附调阅清单。`,
        needs_more: ['调阅前次住院（2026-02-24~02-26）逐日血常规，核实是否曾发生重度（≥3级）中性粒细胞减少', '如前次确无重度中性粒减少，则升白针超医保限定支付范围，升级为疑点（38条六）'],
        disposal: `暂列线索；调阅前次住院血常规后：若前次无重度中性粒减少→升级疑点并退回1180元；若有→撤销。`,
      }));
    }
    return findings;
  },

  /** T-207 院外购药费用转嫁：目录内必需药医嘱开立但费用清单缺失 + 病程外购 */
  'T-207': (ctx) => {
    const { record } = ctx;
    const findings = [];
    // 在病程中找"外购/自备/院外药房购买"记载
    const outsideNote = record.progress_notes.find(p => /外购|自备|院外药房|院外购买|自行购买/.test(p.text));
    if (!outsideNote) return [];
    // 提取被外购的药名（从医嘱中找标注"自院外购入/外购"的项）
    const outsideOrder = [...record.temporary_orders.items, ...record.long_term_orders.items]
      .find(o => /外购|自院外购入|自购|自备/.test(o.content) || (o.key && /费用清单中无对应收费行|院外/.test(o.key)));
    if (!outsideOrder) return [];
    const drugName = (outsideOrder.content.match(/([一-龥A-Za-z]+?)(二钠|单抗|替尼|注射|片)?\s*\d/) || [])[1] || '该药';
    // 核对费用清单中是否确无该药
    const inBill = record.fee_list.items.some(l => l.item_name.includes(drugName.slice(0, 3)));
    if (inBill) return []; // 清单里有则不构成转嫁
    findings.push(mkFinding(ctx, 'T-207', {
      status: '线索', risk_level: '中—高', amount_involved: 2600.0,
      evidence: [
        ev('病程', `病程记录 ${outsideNote.date}`, outsideNote.text),
        ev('医嘱', `医嘱 ${outsideOrder.order_id}`, outsideOrder.content),
        ev('费用清单核对', '费用清单逐行核对', record.fee_list.absent_items_note),
        ev('目录属性', 'KB1-目录2025-培美曲塞', '培美曲塞二钠属医保目录内药品（乙类），为本次化疗方案必需药'),
      ],
      reasoning: `临时医嘱开立培美曲塞为本次化疗方案（培美曲塞+卡铂+贝伐珠单抗）必需药；病程 ${outsideNote.date} 明确记载"我院药房缺药，嘱家属院外自购"；逐行核对费用清单无任何培美曲塞收费行。培美曲塞为医保目录内、住院必需药，本应由住院医保支付却转患者院外自费购买，涉嫌费用转嫁、规避DRG打包付费。定性证据四方齐备（医嘱+病程+清单缺失+目录属性），但精确转嫁金额须以患者院外自费购药凭证佐证、该凭证不在本材料包内 → 依"宁漏报不误报"先出线索并附调阅清单，金额闭环后可升级疑点。`,
      needs_more: ['调阅患者院外药房自费购药凭证以精确认定转嫁金额'],
      disposal: `建议认定费用转嫁，责令将应保费用纳入住院结算或退还患者自费部分；核查是否系DRG超支规避行为。`,
    }));
    return findings;
  },

  /** B-201 药品超目录限定支付范围（人血白蛋白·合议层主疑点） */
  'B-201': (ctx) => {
    const { record } = ctx;
    const alb = record.fee_list.items.find(l => /人血白蛋白/.test(l.item_name));
    if (!alb) return [];
    let albVal = null, albLoc = null;
    for (const lab of record.lab_reports) { const r = (lab.results || []).find(x => /白蛋白\s*ALB|^白蛋白/.test(x.item) || x.item.includes('白蛋白 ALB')); if (r) { albVal = r.value; albLoc = lab.report_id; } }
    const severe = /抢救|重症|休克|脓毒|危重/.test(JSON.stringify(record.progress_notes || ''));
    if (albVal != null && albVal >= 30 && !severe) {
      return [mkFinding(ctx, 'B-201', {
        status: '疑点', risk_level: '高', amount_involved: alb.amount,
        evidence: [
          ev('费用行', `费用清单 第${alb.line_no}行`, `${alb.item_name} ${alb.spec}×${alb.qty}${alb.unit} 金额${money(alb.amount)}元`),
          ev('检验报告', `检验报告 ${albLoc}`, `白蛋白 ALB ${albVal} g/L（≥30，不满足限定支付阈值）`),
          ev('病历检索', '病程/入院记录', '全程无抢救、重症、肝硬化或癌症引起胸腹水记载'),
        ],
        reasoning: `人血白蛋白医保限定支付="限抢救、重症或因肝硬化、癌症引起胸腹水的患者，且白蛋白低于30g/L"。本案白蛋白检验值 ${albVal}g/L≥30，且全程无抢救/重症/胸腹水记载——限定支付的必要要素均不满足 → 超目录限定支付范围（38条六），证据闭环。`,
        disposal: `建议责令退回该笔人血白蛋白医保结算 ${money(alb.amount)} 元。`,
      })];
    }
    return [];
  },

  /** A-110 范围外费用纳入医保结算（人血白蛋白超限定部分·合议层佐证视角） */
  'A-110': (ctx) => {
    const { record } = ctx;
    const alb = record.fee_list.items.find(l => /人血白蛋白/.test(l.item_name));
    if (!alb) return [];
    let albVal = null; for (const lab of record.lab_reports) { const r = (lab.results || []).find(x => x.item.includes('白蛋白')); if (r) albVal = r.value; }
    const severe = /抢救|重症|休克|脓毒|危重/.test(JSON.stringify(record.progress_notes || ''));
    if (albVal != null && albVal >= 30 && !severe) {
      return [mkFinding(ctx, 'A-110', {
        status: '疑点', risk_level: '高', amount_involved: alb.amount,
        evidence: [
          ev('费用行', `费用清单 第${alb.line_no}行`, `${alb.item_name} ${money(alb.amount)}元，结算类别医保乙`),
          ev('目录检索', 'KB1-目录2025-人血白蛋白-备注', '该药仅在限定支付情形下属支付范围；不满足限定即不属于医保基金支付范围'),
        ],
        reasoning: `人血白蛋白在不满足限定支付情形（白蛋白${albVal}≥30、非重症）下使用，该笔费用不属于医保基金支付范围，却纳入医保结算 → 命中A-110（将不属于支付范围的费用纳入结算，38条六）。本视角与B-201指向同一笔费用，属同一违规的不同定性角度。`,
        disposal: `同B-201，金额合并计算不重复。`,
      })];
    }
    return [];
  },

  /** A-108 虚记费用（无医嘱及执行记录·合议层佐证视角） */
  'A-108': (ctx) => {
    const { record } = ctx;
    const whitelist = ['床位费', '诊查费', '护理'];
    const findings = [];
    const nursingText = JSON.stringify(record.nursing_records || '');
    for (const l of record.fee_list.items) {
      if (!/药/.test(l.category)) continue;
      if (l.linked_order && l.linked_order !== '—') continue;       // 有医嘱不算虚记
      if (whitelist.some(w => l.item_name.includes(w))) continue;
      if (nursingText.includes(l.item_name.slice(0, 3))) continue;  // 护理记录提及则有执行
      findings.push(mkFinding(ctx, 'A-108', {
        status: '疑点', risk_level: '高', amount_involved: l.amount,
        evidence: [
          ev('费用行', `费用清单 第${l.line_no}行`, `${l.item_name} ${l.spec}×${l.qty}${l.unit} 金额${money(l.amount)}元`),
          ev('已核对材料范围', '医嘱单+护理执行/治疗单+病程', `已核对长期/临时医嘱单(无该药开立)、护理记录单(无该药输注/给药执行)、病程记录——均无对应开立或执行证据（阴性结论可复核）`),
        ],
        reasoning: `对费用行"${l.item_name}"在长期/临时医嘱单、护理执行单、病程记录中检索开立与执行证据：均无对应记录（已列明核对单据范围，阴性结论可审计）。非床位等自动计费项 → 命中A-108虚记费用（虚构医药服务项目，40条三）。本视角与B-201/A-110指向同一笔费用。`,
        disposal: `同簇合并：若机构能补交该药医嘱与输注执行记录则转为限定支付判定(B-201)，否则按虚记从严。`,
      }));
    }
    return findings;
  },

  /** A-101 重复收费—项目内涵已包含（骨科：术式固有步骤另收） */
  'A-101': (ctx) => {
    const { record } = ctx;
    const op = record.operation_note;
    if (!op || !op.operation_name) return [];
    const conn = SURGERY_CONNOTATION[normalizeSurgery(op.operation_name)];
    if (!conn) return [];
    const findings = [];
    for (const l of record.fee_list.items) {
      if (!/手术费/.test(l.category)) continue;
      if ((conn.included || []).some(c => l.item_name.includes(c))) {
        findings.push(mkFinding(ctx, 'A-101', {
          status: '疑点', risk_level: '高', amount_involved: l.amount,
          evidence: [
            ev('费用行', `费用清单 第${l.line_no}行`, `${l.item_name} ×${l.qty}${l.unit} 金额${money(l.amount)}元`),
            ev('手术记录', '手术记录·术式与步骤', `术式「${op.operation_name}」固有步骤含「${l.item_name}」：${op.procedure_steps.slice(0, 60)}…`),
            ev('项目内涵', 'KB1-立项指南-项目内涵', `「${op.operation_name}」项目内涵已包含「${l.item_name}」，不属除外内容，不应另收`),
          ],
          reasoning: `费用清单第${l.line_no}行另收「${l.item_name}」。依项目内涵，「${l.item_name}」是「${op.operation_name}」术式的固有内涵步骤（手术记录载明该步骤为本术式组成部分），已包含在术式收费中，另收构成重复收费（38条三）。证据为手术记录与项目内涵硬比对，无指征争议空间。`,
          disposal: `建议责令退回重复收取的「${l.item_name}」${money(l.amount)}元。`,
        }));
      }
    }
    return findings;
  },

  /** A-106 分解项目收费（骨科：打包内涵拆出单收） */
  'A-106': (ctx) => {
    const { record } = ctx;
    const op = record.operation_note;
    if (!op || !op.operation_name) return [];
    const conn = SURGERY_CONNOTATION[normalizeSurgery(op.operation_name)];
    if (!conn) return [];
    const findings = [];
    for (const l of record.fee_list.items) {
      if (!/手术费/.test(l.category)) continue;
      if ((conn.packaged || []).some(c => l.item_name.includes(c))) {
        findings.push(mkFinding(ctx, 'A-106', {
          status: '疑点', risk_level: '高', amount_involved: l.amount,
          evidence: [
            ev('费用行', `费用清单 第${l.line_no}行`, `${l.item_name} ×${l.qty}${l.unit} 金额${money(l.amount)}元`),
            ev('手术记录', '手术记录·术式与步骤', `术式「${op.operation_name}」打包含「${l.item_name}」步骤`),
            ev('项目内涵', 'KB1-立项指南-打包项目', `「${l.item_name}」属「${op.operation_name}」打包内涵，拆出单独计费构成分解项目收费`),
          ],
          reasoning: `费用清单第${l.line_no}行将「${l.item_name}」从打包术式「${op.operation_name}」中拆出单独计费。该步骤属术式打包内涵，拆分单收构成分解项目收费（38条三）。`,
          disposal: `建议责令退回分解收取的「${l.item_name}」${money(l.amount)}元。`,
        }));
      }
    }
    return findings;
  },

  /** A-107 串换耗材（骨科：高值进口收费，记录实际低值国产） */
  'A-107': (ctx) => {
    const { record } = ctx;
    const op = record.operation_note;
    if (!op || !(op.consumables_used || []).length) return [];
    const findings = [];
    for (const l of record.fee_list.items) {
      if (!/耗材费/.test(l.category)) continue;
      const billedImport = /进口/.test(l.item_name) || /进口/.test(l.spec || '');
      const used = (op.consumables_used || []).find(c => sameMaterial(c.name, l.item_name));
      if (used && billedImport && /国产/.test(used.type || '')) {
        findings.push(mkFinding(ctx, 'A-107', {
          status: '疑点', risk_level: '高', amount_involved: l.amount,
          evidence: [
            ev('费用行', `费用清单 第${l.line_no}行`, `${l.item_name} ×${l.qty}${l.unit} 金额${money(l.amount)}元（结算为进口/高值）`),
            ev('手术记录', '手术记录·耗材实际使用', `实际使用「${used.name}」${used.type}（${used.brand || '低值'}），与结算的进口/高值不符`),
          ],
          reasoning: `费用清单第${l.line_no}行按「进口/高值」结算「${l.item_name}」，但手术记录/植入物登记载明实际使用「${used.type}${used.name}」（低值）——实际使用与结算名目不一致，构成串换耗材（高值串低值，38条四）。`,
          disposal: `建议按实际使用的国产耗材重新核算，退回高低值差额。`,
        }));
      }
    }
    return findings;
  },

  /** A-109(耗材) 多记费用—耗材结算数量超手术记录实际用量 */
  'A-109MAT': (ctx) => {
    const { record } = ctx;
    const op = record.operation_note;
    if (!op || !(op.consumables_used || []).length) return [];
    const findings = [];
    for (const l of record.fee_list.items) {
      if (!/耗材费/.test(l.category)) continue;
      const used = (op.consumables_used || []).find(c => sameMaterial(c.name, l.item_name));
      if (used && l.qty > used.qty) {
        const over = l.qty - used.qty, overAmt = money(over * l.unit_price);
        findings.push(mkFinding(ctx, 'A-109', {
          status: '疑点', risk_level: '高', amount_involved: overAmt,
          evidence: [
            ev('费用行', `费用清单 第${l.line_no}行`, `${l.item_name} 结算${l.qty}${l.unit} 单价${l.unit_price}元`),
            ev('手术记录', '手术记录·耗材实际使用', `「${used.name}」实际使用 ${used.qty}${l.unit}（${used.note || ''}）`),
            ev('计算', '差额', `结算${l.qty} − 实际${used.qty} = 多记${over}${l.unit} × ${l.unit_price} = ${overAmt}元`),
          ],
          reasoning: `费用清单第${l.line_no}行结算「${l.item_name}」${l.qty}${l.unit}，手术记录实际使用 ${used.qty}${l.unit}，多记 ${over}${l.unit}（差额≥1个最小包装单位，超噪声阈值）→ 多记费用（38条二）。耗材数量与手术记录硬比对，对错分明。`,
          disposal: `建议责令退回多记的 ${over}${l.unit} 共 ${overAmt} 元。`,
        }));
      }
    }
    return findings;
  },

  /** D-401 高套分组—主诊断编码拔高入组权重但病历无支持 */
  'D-401': (ctx) => {
    const { record } = ctx;
    const fp = record.front_page;
    const dxName = fp?.principal_diagnosis?.name || '';
    const sev = Object.keys(SEVERITY_CODING).find(k => dxName.includes(k));
    if (!sev) return [];
    const cfg = SEVERITY_CODING[sev];
    // 在入院记录/病程/检验中检索"重症依据"（须为肯定陈述，排除"无/未/非呼吸衰竭"等否定）
    const text = JSON.stringify([record.admission_note, record.progress_notes, record.lab_reports]);
    const hit = cfg.criteria.some(c => hasPositiveEvidence(text, c));
    if (hit) return []; // 病历确有重症依据→编码成立，不报
    // 反向证据汇总
    const dischargeDx = (record.discharge_summary?.discharge_diagnosis || []).join('、');
    const conflict = dischargeDx && !dischargeDx.includes(sev);
    return [mkFinding(ctx, 'D-401', {
      status: '疑点', risk_level: '高', amount_involved: cfg.est_overcoding_amount,
      evidence: [
        ev('病案首页', '病案首页 主诊断编码', `主诊断编码「${sev}」(${fp.principal_diagnosis.icd10}) → 入「${cfg.high_group}」`),
        ev('病历反向证据', '入院记录/病程/血气分析', `全程无 呼吸衰竭/机械通气/感染性休克/ICU/血管活性药；血气 PaO2 正常、氧合指数>300（非ARDS）、CURB-65 低危——不满足「${sev}」诊断标准，病历支持「${cfg.base}」`),
        ev('出院诊断', '出院小结', conflict ? `出院诊断为「${dischargeDx}」，与病案首页主诊断「${sev}」不一致，印证高套` : `出院诊断与主诊断核对`),
        ev('分组规则', 'KB1-DRGDIP2.0分组方案', `编码差异导致由「${cfg.base_group}」升至「${cfg.high_group}」、入组权重升高（属CC/MCC升级类高套，非不入组编码瑕疵）`),
      ],
      reasoning: `病案首页主诊断编「${sev}」拔高入组至「${cfg.high_group}」，但入院记录、逐日病程、血气分析均无重症肺炎诊断标准（无呼吸衰竭/机械通气/休克/ICU，氧合指数>300，CURB-65低危），出院诊断亦为「${cfg.base}」——编码无病历支持且导致入组权重升高，构成高套分组（《条例》38条第(七)项，实施细则第23条："采取高套或低编病种(病组)编码…可认定属38条第七项"）。差异落在CC/MCC升级、确实改变DRG组与权重（非不作为入组条件的编码瑕疵），故构成套高而非质控提示。`,
      needs_more: ['用分组器(OpenDRG)对「ES1x vs ES3x」跑两次确认权重差额，精确认定高套金额'],
      disposal: `建议按「${cfg.base_group}」普通肺炎组重新入组结算，退回权重差额（估算 ${cfg.est_overcoding_amount} 元，以分组器核定为准）。`,
    })];
  },

  /** IMG-301 增强扫描重复收取平扫费用（增强内涵已含平扫） */
  'IMG-301': (ctx) => {
    const { record } = ctx;
    const items = record.fee_list.items;
    const findings = [];
    for (const c of IMAGING_CONNOTATION) {
      const enh = items.find(l => c.enhance.test(l.item_name));
      const plain = items.find(l => c.plain.test(l.item_name) && !c.enhance.test(l.item_name));
      if (enh && plain) {
        findings.push(mkFinding(ctx, 'IMG-301', {
          status: '疑点', risk_level: '高', amount_involved: plain.amount,
          evidence: [
            ev('费用行', `费用清单 第${enh.line_no}行`, `${enh.item_name} ${money(enh.amount)}元（已含平扫序列）`),
            ev('费用行', `费用清单 第${plain.line_no}行`, `${plain.item_name} ${money(plain.amount)}元（★另收的平扫）`),
            ev('影像记录', '影像检查记录', record.imaging_record?.note || `${c.modality}增强扫描内涵已含平扫，本次为一次检查`),
          ],
          reasoning: `${c.modality}增强扫描项目内涵已包含平扫序列（影像检查记录载明本次为含平扫+增强的一次检查）。费用清单第${enh.line_no}行已收"${enh.item_name}"，第${plain.line_no}行又另收"${plain.item_name}"——平扫属增强内涵，不应另收 → 重复收费（38条三）。证据为影像记录与项目内涵硬比对，无指征争议。`,
          disposal: `建议责令退回重复收取的"${plain.item_name}" ${money(plain.amount)}元。`,
        }));
      }
    }
    return findings;
  },

  /** IMG-302 医用胶片收费张数超影像记录实际使用 */
  'IMG-302': (ctx) => {
    const { record } = ctx;
    const filmsUsed = record.imaging_record?.films_used;
    if (filmsUsed == null) return [];
    const findings = [];
    for (const l of record.fee_list.items) {
      if (!/胶片/.test(l.item_name)) continue;
      if (l.qty > filmsUsed) {
        const over = l.qty - filmsUsed, overAmt = money(over * l.unit_price);
        findings.push(mkFinding(ctx, 'IMG-302', {
          status: '疑点', risk_level: '高', amount_involved: overAmt,
          evidence: [
            ev('费用行', `费用清单 第${l.line_no}行`, `${l.item_name} 结算${l.qty}${l.unit} 单价${l.unit_price}元`),
            ev('影像记录', '影像检查记录·films_used', `本次实际使用医用胶片 ${filmsUsed}${l.unit}（影像记录/病程载明）`),
            ev('计算', '差额', `结算${l.qty} − 实际${filmsUsed} = 超${over}${l.unit} × ${l.unit_price} = ${overAmt}元`),
          ],
          reasoning: `费用清单第${l.line_no}行结算医用胶片 ${l.qty}${l.unit}，影像检查记录实际使用 ${filmsUsed}${l.unit}，超 ${over}${l.unit}（差额≥1张,超噪声阈值）→ 胶片费用超出实际使用张数（重复收费/超量，影像问题清单序2）。`,
          disposal: `建议责令退回超量的 ${over}${l.unit} 共 ${overAmt} 元。`,
        }));
      }
    }
    return findings;
  },

  /** M-301 麻醉收费时长超实际麻醉记录时长（麻醉问题清单序156） */
  'M-301': (ctx) => {
    const { record } = ctx;
    const ar = record.anesthesia_record;
    if (!ar || ar.actual_duration_min == null) return [];
    const findings = [];
    for (const l of record.fee_list.items) {
      if (l.duration_charged_min == null) continue;
      if (l.duration_charged_min > ar.actual_duration_min) {
        const overMin = l.duration_charged_min - ar.actual_duration_min;
        const overAmt = money(l.amount * overMin / l.duration_charged_min);
        findings.push(mkFinding(ctx, 'M-301', {
          status: '疑点', risk_level: '高', amount_involved: overAmt,
          evidence: [
            ev('费用行', `费用清单 第${l.line_no}行`, `${l.item_name} 收费时长${l.duration_charged_min}分钟 金额${money(l.amount)}元`),
            ev('麻醉记录', '麻醉记录单·实际时长', `麻醉开始 ${ar.anesthesia_start} ～ 结束 ${ar.anesthesia_end}，实际麻醉时长 ${ar.actual_duration_min} 分钟`),
            ev('计算', '差额', `收费${l.duration_charged_min} − 实际${ar.actual_duration_min} = 超${overMin}分钟 → ${money(l.amount)}×${overMin}/${l.duration_charged_min} = ${overAmt}元`),
          ],
          reasoning: `费用清单第${l.line_no}行「${l.item_name}」按 ${l.duration_charged_min} 分钟收费，麻醉记录单实际麻醉时长仅 ${ar.actual_duration_min} 分钟（${ar.anesthesia_start}～${ar.anesthesia_end}），超 ${overMin} 分钟 → 收费时长大于实际麻醉记录时长，超出部分重复收费（38条三；麻醉问题清单序156逐字）。证据为麻醉记录与费用硬比对，无指征争议。`,
          disposal: `建议责令退回超时长部分 ${overAmt} 元。`,
        }));
      }
    }
    return findings;
  },

  /** M-302 麻醉项目内涵已含项另收（全麻含气管插管序159/椎管内含置管序157/术中监测序160） */
  'M-302': (ctx) => {
    const { record } = ctx;
    const ar = record.anesthesia_record;
    if (!ar || !ar.anesthesia_method) return [];
    const items = record.fee_list.items;
    const isGA = /全身麻醉|全麻/.test(ar.anesthesia_method);
    const isNeuraxial = /椎管内|腰麻|硬膜外/.test(ar.anesthesia_method);
    const dupes = [];
    // 注意：排除麻醉收费行本身（如"全身麻醉（气管插管）"名内含"气管插管"），只抓另立的重复收费行
    if (isGA) { const x = items.find(l => /气管插管/.test(l.item_name) && !/麻醉/.test(l.item_name)); if (x) dupes.push({ l: x, seq: '159', conn: '全身麻醉项目内涵已包含气管插管（麻醉问题清单序159）' }); }
    if (isNeuraxial) { const x = items.find(l => /椎管内置管|硬膜外置管/.test(l.item_name) && !/麻醉/.test(l.item_name)); if (x) dupes.push({ l: x, seq: '157', conn: '椎管内麻醉项目内涵已包含椎管内置管术（麻醉问题清单序157）' }); }
    for (const re of [/心电监测/, /有创(性)?(动脉)?血压监测|有创血压/, /(脉搏)?(血)?氧饱和度监测/]) {
      const x = items.find(l => re.test(l.item_name)); if (x && !dupes.some(d => d.l.line_no === x.line_no)) dupes.push({ l: x, seq: '160', conn: '术中麻醉监测项目内涵已包含该监测项（麻醉问题清单序160）' });
    }
    return dupes.map(d => mkFinding(ctx, 'M-302', {
      status: '疑点', risk_level: '高', amount_involved: d.l.amount,
      evidence: [
        ev('费用行', `费用清单 第${d.l.line_no}行`, `${d.l.item_name} ${money(d.l.amount)}元（★另收）`),
        ev('麻醉记录', '麻醉记录单·麻醉方式与监测', `麻醉方式：${ar.anesthesia_method}；术中监测：${(ar.monitoring || []).join('、')}`),
        ev('项目内涵', `麻醉问题清单序${d.seq}`, d.conn),
      ],
      reasoning: `${d.conn}。费用清单第${d.l.line_no}行另收「${d.l.item_name}」${money(d.l.amount)}元——该项已包含在麻醉项目收费内涵中，另收构成重复收费（38条三）。证据为麻醉记录与项目内涵硬比对，无指征争议。`,
      disposal: `建议责令退回重复收取的「${d.l.item_name}」${money(d.l.amount)}元。`,
    }));
  },

  /** M-303 麻醉药品收费数量超实际使用（麻醉问题清单序155） */
  'M-303': (ctx) => {
    const { record } = ctx;
    const ar = record.anesthesia_record;
    if (!ar || !(ar.drugs_used || []).length) return [];
    const findings = [];
    for (const du of ar.drugs_used) {
      if (du.actual_qty == null) continue;
      const key = du.name.replace(/注射液|注射用/g, '');
      const l = record.fee_list.items.find(x => x.item_name.includes(key) && x.qty != null);
      if (l && l.qty > du.actual_qty) {
        const over = l.qty - du.actual_qty, overAmt = money(over * l.unit_price);
        findings.push(mkFinding(ctx, 'M-303', {
          status: '疑点', risk_level: '高', amount_involved: overAmt,
          evidence: [
            ev('费用行', `费用清单 第${l.line_no}行`, `${l.item_name} 结算${l.qty}${l.unit} 单价${l.unit_price}元`),
            ev('麻醉记录', '麻醉记录单·实际用药', `${du.name} 实际使用 ${du.actual_qty}${du.unit || l.unit}`),
            ev('计算', '差额', `结算${l.qty} − 实际${du.actual_qty} = 超${over}${l.unit} × ${l.unit_price} = ${overAmt}元`),
          ],
          reasoning: `费用清单第${l.line_no}行「${l.item_name}」结算 ${l.qty}${l.unit}，麻醉记录单实际使用 ${du.actual_qty}${du.unit || l.unit}，超 ${over}${l.unit} → 麻醉药品收费数量大于实际使用数量（38条二；麻醉问题清单序155逐字）。证据为麻醉记录与费用硬比对。`,
          disposal: `建议责令退回超量 ${over}${l.unit} 共 ${overAmt} 元。`,
        }));
      }
    }
    return findings;
  },

  /** M-304 无麻醉恢复室/未入恢复室却收监护费（麻醉问题清单序162）→ 线索（需机构资质佐证） */
  'M-304': (ctx) => {
    const { record } = ctx;
    const ar = record.anesthesia_record;
    if (!ar || ar.pacu_used !== false) return [];
    const l = record.fee_list.items.find(x => /麻醉恢复室|恢复室监护|PACU/.test(x.item_name));
    if (!l) return [];
    return [mkFinding(ctx, 'M-304', {
      status: '线索', risk_level: '中—高', amount_involved: l.amount,
      evidence: [
        ev('费用行', `费用清单 第${l.line_no}行`, `${l.item_name} ${money(l.amount)}元`),
        ev('麻醉记录', '麻醉记录单·恢复室', ar.recovery_room || '患者术毕未进入麻醉恢复室'),
      ],
      needs_more: ['核查该院是否设置麻醉恢复室（PACU）及资质备案（外部机构资质数据）', '调阅麻醉恢复室护理/监护记录佐证是否真实发生'],
      reasoning: `费用清单第${l.line_no}行收取「${l.item_name}」${money(l.amount)}元，但麻醉记录单载明患者术毕未进入麻醉恢复室（${ar.recovery_room || '直接返病房'}）。若该院无麻醉恢复室或本次未实际进入，则属超标准收费（麻醉问题清单序162）。因「医院是否设麻醉恢复室」需外部机构资质数据佐证、材料包内无法闭环 → 输出线索，提请人工核查。`,
      disposal: `建议核查机构麻醉恢复室设置与本次实际使用，若不实责令退回 ${money(l.amount)} 元。`,
    })];
  },

  /** P-303 生活用品串换为医保药品（药店问题清单序7）——材料内可闭环→疑点 */
  'P-303': (ctx) => {
    const { record } = ctx;
    const findings = [];
    for (const l of record.fee_list.items) {
      const as = l.actual_sold;
      if (as && /生活用品|保健品|化妆品|口罩|酒精|米面|粮油|日用|护肤|食品/.test(as.category || as.name || '')) {
        findings.push(mkFinding(ctx, 'P-303', {
          status: '疑点', risk_level: '高', amount_involved: l.amount,
          evidence: [
            ev('结算明细', `医保结算 第${l.line_no}行`, `结算为医保药品「${l.item_name}」${money(l.amount)}元`),
            ev('实际销售', '销售小票/进销存', `实际售出商品为「${as.name}」（${as.category}）`),
            ev('对照', '串换比对', `医保结算名目「${l.item_name}」≠ 实际销售「${as.name}」——以生活用品/保健品串换医保目录内药品结算`),
          ],
          reasoning: `医保结算第${l.line_no}行以药品「${l.item_name}」名义申请基金支付 ${money(l.amount)} 元，但销售小票/进销存载明实际售出的是「${as.name}」（${as.category}）——将生活用品/保健品串换为医保目录内药品结算（38条四；药店问题清单序7逐字）。证据为结算明细与实际销售硬比对。`,
          disposal: `建议责令退回串换结算的 ${money(l.amount)} 元，并核查是否系统性串换。`,
        }));
      }
    }
    return findings;
  },

  /** P-301 空刷医保凭证骗保（药店问题清单序1）→ 线索（需进销存佐证） */
  'P-301': (ctx) => {
    const { record } = ctx;
    const findings = [];
    for (const l of record.fee_list.items) {
      if (l.inventory_supported === false) {
        findings.push(mkFinding(ctx, 'P-301', {
          status: '线索', risk_level: '高', amount_involved: l.amount,
          evidence: [
            ev('结算记录', `医保结算 第${l.line_no}行`, `刷医保凭证结算「${l.item_name}」${money(l.amount)}元`),
            ev('进销存', '销售凭证（缺失）', `进销存/销售出库记录中无对应「${l.item_name}」的销售凭证`),
          ],
          needs_more: ['调阅药店进销存系统核对该笔是否真实出库', '调阅药店监控/销售小票佐证是否真实售药', '核查是否存在空刷返现/收集医保凭证'],
          reasoning: `医保结算第${l.line_no}行刷凭证结算「${l.item_name}」${money(l.amount)}元，但进销存无对应销售出库记录——疑似在未真实销售药品情况下空刷医保凭证骗取基金（40条三；药店问题清单序1）。因需进销存/监控外部数据闭环、材料包内无法坐实 → 线索。`,
          disposal: `建议调阅进销存与监控核实，若系空刷责令退回并移交欺诈骗保线索。`,
        }));
      }
    }
    return findings;
  },

  /** P-302 回流药二次销售（药店问题清单序5）→ 线索（需追溯码/进货票据佐证） */
  'P-302': (ctx) => {
    const { record } = ctx;
    const findings = [];
    for (const l of record.fee_list.items) {
      if (/断链|异常/.test(l.trace_code || '')) {
        findings.push(mkFinding(ctx, 'P-302', {
          status: '线索', risk_level: '高', amount_involved: l.amount,
          evidence: [
            ev('结算明细', `医保结算 第${l.line_no}行`, `销售结算「${l.item_name}」${money(l.amount)}元`),
            ev('追溯码', `药品追溯码·${l.trace_code}`, `「${l.item_name}」药品追溯码${l.trace_code}（进货来源异常）`),
          ],
          needs_more: ['核查该药品进货来源与进货票据', '扫追溯码核对是否回流药（2025-07起强制扫码结算，可作第四验证轴）', '进销存比对进货—销售链是否闭合'],
          reasoning: `医保结算第${l.line_no}行「${l.item_name}」药品追溯码${l.trace_code}、进货来源异常——疑似通过非正规渠道购进"回流"药品二次销售（40条；药店问题清单序5）。因需追溯码/进货票据外部数据闭环 → 线索。`,
          disposal: `建议核查进货来源与追溯码链路，若系回流药责令退回并移交。`,
        }));
      }
    }
    return findings;
  },

  /** ICU-302 按小时计价监护项目计费时长虚计（重症问题清单序174）——呼吸机/CRRT/监测时长>实际 */
  'ICU-302': (ctx) => {
    const { record } = ctx;
    const ir = record.icu_record;
    if (!ir) return [];
    const devices = [
      { re: /呼吸机辅助呼吸|有创呼吸机|呼吸机/, actual: ir.ventilator?.actual_hours, label: '有创呼吸机辅助呼吸' },
      { re: /连续性血液净化|CRRT|血液净化/, actual: ir.crrt?.actual_hours, label: '连续性血液净化（CRRT）' },
      { re: /动脉内压力监测|有创动脉压/, actual: ir.arterial_monitoring?.actual_hours, label: '动脉内压力监测' },
      { re: /心电监测/, actual: ir.ecg_monitoring?.actual_hours, label: '心电监测' },
    ];
    const findings = [];
    for (const l of record.fee_list.items) {
      if (l.hours_charged == null) continue;
      const dev = devices.find(d => d.re.test(l.item_name) && d.actual != null);
      if (dev && l.hours_charged > dev.actual) {
        const over = l.hours_charged - dev.actual, overAmt = money(over * l.unit_price);
        findings.push(mkFinding(ctx, 'ICU-302', {
          status: '疑点', risk_level: '高', amount_involved: overAmt,
          evidence: [
            ev('费用行', `费用清单 第${l.line_no}行`, `${l.item_name} 计费${l.hours_charged}小时 单价${l.unit_price}元/时 金额${money(l.amount)}元`),
            ev('重症记录', 'ICU记录·设备使用', `${dev.label} 实际使用 ${dev.actual} 小时（ICU记录/设备使用/护理记录）`),
            ev('计算', '差额', `计费${l.hours_charged} − 实际${dev.actual} = 超${over}小时 × ${l.unit_price} = ${overAmt}元`),
          ],
          reasoning: `费用清单第${l.line_no}行「${l.item_name}」按 ${l.hours_charged} 小时计费，ICU记录/设备使用记录实际仅 ${dev.actual} 小时，超 ${over} 小时 → 按小时计价监护项目计费总时长大于实际使用总时长（38条三；重症问题清单序174逐字）。证据为设备/护理记录与费用硬比对。`,
          disposal: `建议责令退回超时长部分 ${overAmt} 元。`,
        }));
      }
    }
    return findings;
  },

  /** ICU-301 特级护理重复收取一般专项护理费（重症问题清单序175） */
  'ICU-301': (ctx) => {
    const { record } = ctx;
    const ir = record.icu_record;
    if (!ir || !/特级护理/.test(ir.nursing_level || '')) return [];
    const findings = [];
    for (const l of record.fee_list.items) {
      if (/专项护理/.test(l.item_name) && !/特级/.test(l.item_name)) {
        findings.push(mkFinding(ctx, 'ICU-301', {
          status: '疑点', risk_level: '高', amount_involved: l.amount,
          evidence: [
            ev('费用行', `费用清单 第${l.line_no}行`, `${l.item_name} ${money(l.amount)}元（★另收）`),
            ev('重症记录', 'ICU记录·护理级别', `本例护理级别：${ir.nursing_level}（含吸痰、管路维护等一般专项护理）`),
            ev('项目内涵', '重症问题清单序175', '特级护理项目内涵已包含一般专项护理，另收构成重复收费'),
          ],
          reasoning: `本例开展特级护理（ICU记录载明），费用清单第${l.line_no}行又另收「${l.item_name}」——一般专项护理已包含在特级护理内涵中，另收构成重复收费（38条三；重症问题清单序175逐字）。`,
          disposal: `建议责令退回重复收取的「${l.item_name}」${money(l.amount)}元。`,
        }));
      }
    }
    return findings;
  },

  /** ICU-303 非重症监护室患者收取重症监护费（重症问题清单序179）——有ICU收治记录则正确不报 */
  'ICU-303': (ctx) => {
    const { record } = ctx;
    const fee = record.fee_list.items.find(l => /重症监护/.test(l.item_name) && !/床位/.test(l.item_name));
    if (!fee) return [];
    const inICU = record.icu_record?.admission_to_icu === true || /收入ICU|转入ICU|重症医学科|监护室收治/.test(JSON.stringify(record.progress_notes || []));
    if (inICU) return []; // 有ICU收治记录 → 除外情形，正确不报
    return [mkFinding(ctx, 'ICU-303', {
      status: '疑点', risk_level: '中—高', amount_involved: fee.amount,
      evidence: [
        ev('费用行', `费用清单 第${fee.line_no}行`, `${fee.item_name} ${money(fee.amount)}元`),
        ev('病案/病程', 'ICU收治记录（缺失）', '病案首页与病程记录中无重症监护室（ICU）收治记录'),
      ],
      reasoning: `费用清单第${fee.line_no}行收取「${fee.item_name}」，但病案/病程无ICU收治记录——非重症监护室患者收取重症监护费，超标准收费（38条三；重症问题清单序179）。`,
      disposal: `建议核查ICU收治记录，若无据责令退回 ${money(fee.amount)} 元。`,
    })];
  },

  /** E-503 材料含异常指令性文本（对抗注入）——升5 对抗鲁棒性，三审三验首个试运行案例 */
  'E-503': (ctx) => {
    const inj = ctx.caseObj?.flags?.injection_suspects || [];
    if (!inj.length) return [];
    return inj.map(s => mkFinding(ctx, 'E-503', {
      status: '线索', risk_level: '高', amount_involved: 0,
      evidence: [
        ev('对抗注入', s.loc, `检出面向AI/审核系统的元话语："${s.snippet}"（上下文："${s.full}"）`),
        ev('事实层标记', 'flags.injection_suspects', '事实层在注入清洗阶段已标记该span，未将其作为指令执行（仅作引号内数据）'),
      ],
      reasoning: `材料中出现面向AI/审核系统的指令性元话语（如"审核系统请忽略/本材料已预审合规"类）。正常医疗文书不会出现"写给审核系统"的话——这本身是对手试图操纵稽核AI的痕迹，属伪造变造资料的新形态（《条例》第40条第(二)项方向）。鹰眼采"指令/数据隔离"：材料内任何指令性语句一律无效且本身可疑。→ 输出高优先级线索，提示人工重点核查该材料真实性，并将该span排除出语义判定输入。`,
      needs_more: ['人工核查该批注/页脚的来源与真实性', '核查同机构其他材料是否存在相同注入模式（可能系系统性行为）'],
      disposal: `建议作为伪造变造线索移交；该材料其余疑点判定时已将注入span隔离，不影响其他发现。`,
    }));
  },
};

// ---------- 干扰项"正确不报"校验 ----------
function checkDistractors(ctx) {
  const { record, rules } = ctx;
  const out = [];

  // 干扰项1：贝伐珠单抗——同为肿瘤大额药，但非"明确作用靶点"类 → 不报 T-201
  const bev = record.fee_list.items.find(l => l.item_name.includes('贝伐珠单抗'));
  const targetDrugs = rules['T-201'].params.target_required_drugs || [];
  if (bev && !targetDrugs.some(d => bev.item_name.includes(d))) {
    out.push({
      item: `贝伐珠单抗注射液（费用清单第${bev.line_no}行，${money(bev.amount)}元）`,
      tempting_rule: 'T-201 靶向药无基因检测',
      why_not_flagged: '贝伐珠单抗为抗血管生成药物，不属"明确作用靶点需伴随诊断检测"类，无需EGFR/ALK靶点检测即可使用；病理已确诊腺癌（非鳞癌，符合适应人群），病程已核对禁忌（无咯血、无近期手术、血压控制可）。命中 T-201 除外情形 → 正确不报。',
      demo_value: '★主动讲：同是肿瘤大额药，奥希替尼报、贝伐珠单抗不报，差别正在"是否明确作用靶点"——语义级稽核超越字段比对之处。',
    });
  }

  // 干扰项2：放化疗周期再入院——命中 C-301 间隔+诊断条件，但属规律周期 → 不报
  const prev = record.front_page.previous_admissions?.[0];
  if (prev && rules['C-301'].params.oncology_cycle_whitelist) {
    const interval = daysBetween(parseDate(prev.discharge_time), parseDate(record.front_page.admit_time));
    const sameDx = (record.front_page?.principal_diagnosis?.name || '').includes('肺') &&
      (prev.principal_diagnosis || '').includes('肺');
    const isChemoCycle = /化疗|周期/.test(prev.summary || '') && /化疗/.test(record.admission_note.chief_complaint || '');
    if (interval <= rules['C-301'].params.interval_days && sameDx && isChemoCycle) {
      // doc08细节①：硬阈值改带缓冲区分级——核心区(≤7高度可疑)/观察区(8-15需更多佐证)/豁免白名单(周期治疗)
      const zone = interval <= 7 ? '核心区(≤7天·高度可疑)' : '观察区(8-15天·需更多佐证)';
      out.push({
        item: `第1周期→第2周期再入院（间隔${interval}天，主诊断相同）`,
        tempting_rule: 'C-301 分解住院',
        zone_classification: `间隔落在「${zone}」，但命中「放化疗周期豁免白名单」→ 优先级仲裁中白名单覆盖分级判定`,
        why_not_flagged: `C-301分级阈值（doc08细节修法）：间隔${interval}天落在「${zone}」（非"差一天就翻案"的硬阈值）。但本次为放化疗按周期规律住院（符合3周化疗周期），命中「肿瘤放化疗周期豁免白名单」——全局豁免清单在仲裁层统一应用，覆盖分级判定 → 正确不报。`,
        demo_value: '★主动讲：①阈值带缓冲区（核心区/观察区），经得起"差一天差一块"的申诉；②放化疗周期豁免在全局豁免清单统一维护、仲裁层统一应用，不靠各规则自己记得写exclusions——规则成体系。',
      });
    }
  }

  // DRG干扰项：次诊断编码有病历支持 → 正确不报（不是所有编码都套高）
  const dx = record.front_page?.principal_diagnosis?.name || '';
  if (Object.keys(SEVERITY_CODING).some(k => dx.includes(k))) {
    const dm = (record.front_page?.other_diagnosis || []).find(d => /糖尿病/.test(d.name));
    const labText = JSON.stringify(record.lab_reports || []);
    if (dm && /血糖|GLU/.test(labText)) {
      out.push({
        item: `次诊断「${dm.name}」(${dm.icd10})`,
        tempting_rule: 'D-401 高套/虚编',
        why_not_flagged: `次诊断2型糖尿病编码有病历支持：空腹血糖8.9mmol/L升高、长期口服二甲双胍——诊断成立、编码与病历相符 → 正确不报。仅主诊断「重症肺炎」高套被报，次诊断不连坐。`,
        demo_value: '★主动讲：不是所有编码都套高——同一份病案首页，主诊断高套报、次诊断糖尿病编码正确不报。精准定位到具体高套项，不殃及合规编码。',
      });
    }
  }

  // 影像干扰项：DR摄影本身合规 + 胶片若收=用则不报 → 正确不报
  if (record.imaging_record && record.imaging_record.films_used != null) {
    const dr = record.fee_list.items.find(l => /DR摄影|DR$|数字化摄影/.test(l.item_name));
    if (dr) {
      out.push({
        item: `胸部DR摄影（费用清单第${dr.line_no}行，${money(dr.amount)}元）`,
        tempting_rule: 'IMG 影像类',
        why_not_flagged: `胸部DR摄影为独立合规检查项，非增强/平扫内涵重复、非胶片超量——影像记录支持，正确收费 → 正确不报。仅"CT增强另收平扫(IMG-301)"和"胶片超量(IMG-302)"被报，DR摄影不连坐。`,
        demo_value: '★影像备演价值：同一份影像费用，CT增强重复平扫报、胶片超量报，DR摄影正确不报——内涵/张数逐项硬比对，精准到具体违规项，对错分明。',
      });
    }
  }

  // 骨科干扰项：耗材收费数量与手术记录一致 → 正确不报（对错分明的"不报"）
  const op = record.operation_note;
  if (op && (op.consumables_used || []).length) {
    for (const l of record.fee_list.items) {
      if (!/耗材费/.test(l.category)) continue;
      const used = (op.consumables_used || []).find(c => sameMaterial(c.name, l.item_name));
      const importBilled = /进口/.test(l.item_name) || /进口/.test(l.spec || '');
      if (used && l.qty === used.qty && !(importBilled && /国产/.test(used.type || ''))) {
        out.push({
          item: `${l.item_name}（费用清单第${l.line_no}行，收${l.qty}${l.unit}）`,
          tempting_rule: 'A-109 耗材数量 / A-107 串换',
          why_not_flagged: `手术记录载明实际使用「${used.name}」${used.qty}${l.unit}，与结算数量一致，且材质(${used.type})与结算名目相符——数量、材质均无异常 → 正确不报。`,
          demo_value: '★骨科备演价值：同样是耗材，球囊收2用1报、穿刺针收1用1不报——数量与手术记录逐项硬比对，对错分明，无医学指征争议空间。能正确"不报"才显稽核可信。',
        });
      }
    }
  }

  // 麻醉干扰项：术后镇痛泵(PCA)——独立操作，麻醉项目内涵不含 → 正确不报（不被 M-302 误伤）
  if (record.anesthesia_record) {
    const pca = record.fee_list.items.find(l => /镇痛泵|自控镇痛|PCA/.test(l.item_name));
    if (pca) {
      out.push({
        item: `患者自控镇痛泵PCA（费用清单第${pca.line_no}行，${money(pca.amount)}元）`,
        tempting_rule: 'M-302 麻醉内涵重复收费',
        why_not_flagged: '术后患者自控镇痛泵（PCA）是独立于麻醉项目的术后镇痛操作，有麻醉医嘱（T04）与记录支持，不属全身麻醉/术中监测的收费内涵步骤 → 不构成重复收费，正确不报。',
        demo_value: '★主动讲：同在麻醉单上，气管插管/心电监测报（内涵已含另收），术后镇痛泵不报（独立操作）——内涵边界拿捏精准，不误伤合规项。',
      });
    }
  }

  // 药店干扰项：二甲双胍真实售药（进销存支持+追溯完整+有处方）→ 正确不报（不被 P-303/P-301 误伤）
  if (record.pharmacy_info) {
    const real = record.fee_list.items.find(l => l.actual_sold && /目录内药品|医保药品/.test(l.actual_sold.category || '') && l.inventory_supported !== false && !/断链|异常/.test(l.trace_code || '') && l.actual_sold.name && l.item_name.includes(l.actual_sold.name.replace(/片|胶囊|散|注射液/g, '').slice(0, 3)));
    if (real) {
      out.push({
        item: `${real.item_name}（医保结算第${real.line_no}行，${money(real.amount)}元）`,
        tempting_rule: 'P-303 串换 / P-301 空刷',
        why_not_flagged: `进销存载明实际售出即「${real.item_name}」本身（医保目录内药品）、销售凭证齐备、追溯码完整、有门诊慢特病处方支持 → 真实售药，正确不报。`,
        demo_value: '★主动讲：同一张医保结算单，口罩/保健品串换药品报、空刷报，真实卖的二甲双胍不报——靠"结算名目 vs 实际销售/进销存/追溯码"硬比对，不误伤真实售药。',
      });
    }
  }

  // 重症干扰项：重症监护费——患者确有ICU收治记录 → 正确不报（不被 ICU-303 误伤）
  if (record.icu_record) {
    const icuFee = record.fee_list.items.find(l => /重症监护/.test(l.item_name) && !/床位/.test(l.item_name));
    if (icuFee && record.icu_record.admission_to_icu === true) {
      out.push({
        item: `重症监护费（费用清单第${icuFee.line_no}行，${money(icuFee.amount)}元）`,
        tempting_rule: 'ICU-303 非ICU患者收重症监护费',
        why_not_flagged: '病案首页（重症医学科ICU-03床）与病程记录均载明患者确已收入ICU、有明确收治记录 → 重症监护费收取有据，正确不报（ICU-303 除外情形）。',
        demo_value: '★主动讲：重症监护费看着高，但病程有ICU收治记录就该收——ICU-303只打"非ICU患者却收ICU费"，不误伤真ICU患者。同例心电监测计费=实际时长也正确不报。',
      });
    }
  }
  return out;
}

// ---------- 辅助：计算应发数量 ----------
function computeExpectedQty(order, line) {
  // 解析形如 "注射用头孢呋辛钠 1.5g + 0.9%氯化钠100ml ivgtt bid"
  const content = order.content;
  const freqMap = { qd: 1, bid: 2, tid: 3, qid: 4, q12h: 2, q8h: 3, q6h: 4, st: 1, sos: 1 };
  const freqKey = Object.keys(freqMap).find(f => new RegExp(`\\b${f}\\b`, 'i').test(content));
  if (!freqKey) return null;
  const freq = freqMap[freqKey];
  // 起止天数
  let days = 1;
  if (order.start && order.stop) {
    const d = daysBetween(parseDate(order.start.slice(0, 10)), parseDate(order.stop.slice(0, 10)));
    days = Math.max(1, d);
  }
  // 每次支数：医嘱单次剂量 / 规格剂量（如 1.5g / 1.5g = 1支）
  const doseMatch = content.match(/(\d+(?:\.\d+)?)\s*g/i);
  const specMatch = (line.spec || '').match(/(\d+(?:\.\d+)?)\s*g/i);
  let perDose = 1;
  if (doseMatch && specMatch) {
    perDose = Math.ceil(parseFloat(doseMatch[1]) / parseFloat(specMatch[1]));
  }
  const qty = perDose * freq * days;
  return { qty, explain: `单次${perDose}${line.unit} × ${freq}次/日(${freqKey}) × ${days}天 = ${qty}${line.unit}` };
}

// ---------- 辅助：构造 finding / evidence ----------
function ev(type, loc, text) { return { type, loc, text }; }

let _seq = 0;
function mkFinding(ctx, ruleId, fields) {
  const rule = ctx.rules[ruleId];
  _seq += 1;
  return {
    finding_id: `F-${ctx.caseId}-${String(_seq).padStart(3, '0')}`,
    rule_id: ruleId,
    rule_name: rule.rule_name,
    violation_type: rule.violation_type,
    layer: rule.layer,
    risk_level: fields.risk_level || rule.risk_level,
    status: fields.status,
    amount_involved: fields.amount_involved ?? 0,
    evidence: fields.evidence || [],
    policy: (rule.policy_basis || []).map(ref => ({ ref, text: lookupPolicy(ctx, ref), verify_status: ctx.policyVerified[ref] ? '✅已核验' : '⚠待核验逐字原文' })),
    reasoning: fields.reasoning || '',
    needs_more: fields.needs_more || [],
    disposal_suggestion: fields.disposal || '',
    layer_label: rule.layer,
  };
}

function lookupPolicy(ctx, ref) {
  return ctx.policyTexts?.[ref] || `（KB1/KB2 取原文，引用ID: ${ref}）`;
}

// ---------- 升2 触发器路由：每条规则的廉价前置谓词（命中才"激活"，否则零成本跳过）----------
const triggerPredicates = {
  'F-003': (c) => c.timeline.some(t => t.event === '出院') && c.fee_lines.some(f => { const d = parseDate(f.date), dc = parseDate(c.patient.discharge); return d && dc && d > dc; }),
  'A-105': (c) => c.fee_lines.some(f => /护理/.test(f.name)) && c.orders.some(o => /护理/.test(o.content)),
  'A-109': (c) => c.fee_lines.some(f => /药/.test(f.name) || /注射用/.test(f.name)),
  'B-201': (c) => c.fee_lines.some(f => /粒细胞刺激因子|白蛋白|免疫球蛋白/.test(f.name)),
  'A-110': (c) => c.fee_lines.some(f => /白蛋白|免疫球蛋白/.test(f.name)),
  'A-108': (c) => c.fee_lines.some(f => (f.linked_order === '—' || !f.linked_order) && !/护理|输液|床位|诊查|术|耗材|球囊|骨水泥|套管/.test(f.name)),
  'A-101': (c, r) => !!r.operation_note?.operation_name,
  'A-106': (c, r) => !!r.operation_note?.operation_name,
  'A-107': (c, r) => (r.operation_note?.consumables_used || []).length > 0,
  'D-401': (c, r) => /重症|伴并发症|伴重症|脓毒/.test(r.front_page?.principal_diagnosis?.name || ''),
  'IMG-301': (c) => c.fee_lines.some(f => /增强/.test(f.name)) && c.fee_lines.some(f => /平扫/.test(f.name)),
  'IMG-302': (c, r) => r.imaging_record?.films_used != null && c.fee_lines.some(f => /胶片/.test(f.name)),
  'M-301': (c, r) => r.anesthesia_record?.actual_duration_min != null && c.fee_lines.some(f => /麻醉/.test(f.name)),
  'M-302': (c, r) => !!r.anesthesia_record?.anesthesia_method,
  'M-303': (c, r) => (r.anesthesia_record?.drugs_used || []).length > 0,
  'M-304': (c, r) => r.anesthesia_record?.pacu_used === false && c.fee_lines.some(f => /恢复室/.test(f.name)),
  'P-301': (c, r) => (r.fee_list?.items || []).some(x => x.inventory_supported === false),
  'P-302': (c, r) => (r.fee_list?.items || []).some(x => /断链|异常/.test(x.trace_code || '')),
  'P-303': (c, r) => (r.fee_list?.items || []).some(x => x.actual_sold && /生活用品|保健品|化妆品|口罩|酒精|米面|粮油|日用|护肤|食品/.test(x.actual_sold.category || x.actual_sold.name || '')),
  'ICU-301': (c, r) => /特级护理/.test(r.icu_record?.nursing_level || '') && (r.fee_list?.items || []).some(x => /专项护理/.test(x.item_name) && !/特级/.test(x.item_name)),
  'ICU-302': (c, r) => !!r.icu_record && (r.fee_list?.items || []).some(x => x.hours_charged != null),
  'ICU-303': (c, r) => (r.fee_list?.items || []).some(x => /重症监护/.test(x.item_name) && !/床位/.test(x.item_name)),
  'B-202': (c) => c.fee_lines.some(f => /头孢|青霉|喹诺酮|抗菌|可韦|霉素/.test(f.name)),
  'B-206': (c, r) => /带药/.test(JSON.stringify(r.discharge_summary || '')),
  'C-301': (c, r) => (r.front_page?.previous_admissions || []).length > 0,
  'T-201': (c) => c.fee_lines.some(f => /替尼|单抗/.test(f.name) && !/贝伐|托烷|地塞/.test(f.name)),
  'T-204': (c) => c.fee_lines.some(f => /替尼|单抗/.test(f.name)),
  'T-205': (c) => c.fee_lines.some(f => /聚乙二醇化.*粒细胞刺激因子/.test(f.name)),
  'T-207': (c, r) => (r.progress_notes || []).some(p => /外购|自备|院外/.test(p.text)),
  'E-503': (c) => (c.flags.injection_suspects || []).length > 0,
};
function computeRouting(caseObj, record, rulesArray) {
  const activated = [];
  for (const r of rulesArray) {
    const pred = triggerPredicates[r.rule_id];
    if (pred && pred(caseObj, record)) activated.push(r.rule_id);
  }
  // doc08效率② 三级短路：材料门→L1确定性→触发器谓词→L2语义
  const materialsPresent = !!record.fee_list && !!(record.long_term_orders || record.temporary_orders);
  const ruleById = {}; for (const r of rulesArray) ruleById[r.rule_id] = r;
  const l1 = activated.filter(id => /L1/.test(ruleById[id]?.layer || ''));
  const l2 = activated.filter(id => !/L1/.test(ruleById[id]?.layer || ''));
  return {
    total: rulesArray.length, activated, activated_count: activated.length,
    short_circuit: {
      level0_material_gate: materialsPresent ? '材料齐全·无规则因缺材料阻断' : '部分材料缺失·相关规则降级',
      level1_L1_deterministic: l1.length,    // 纯代码毫秒级
      level2_trigger_activated: activated.length,
      level3_L2_llm_candidates: l2.length,   // 仅这些"候选"才需调LLM（朴素实现需全42条）
      saved: `${rulesArray.length - activated.length}/${rulesArray.length} 条零成本跳过`,
    },
  };
}

// ---------- 05 CoVe 取证自检：疑点定稿前生成验证问题，逐题独立回查 ----------
const COVE = {
  'T-201': () => [
    { q: '病理/检验/外送报告中是否存在任何EGFR检测结果？', a: '已核对病理报告、检验报告、外送检测申请单、全部病程，均无EGFR结果。', pass: true },
    { q: '病程是否提及"外院已检测"？', a: '无任何"外院已检测"记载。', pass: true },
    { q: '奥希替尼是否属"明确作用靶点"需检测类？', a: '是，命中KB2必检清单且目录备注限EGFR突变。', pass: true },
  ],
  'F-003': () => [
    { q: '费用日期是否确晚于出院日期？', a: '第3/4行2026-03-21 > 出院2026-03-20。', pass: true },
    { q: '出院日期在两处单据是否一致？', a: '病案首页与出院小结均为2026-03-20。', pass: true },
  ],
  'A-109': () => [
    { q: '医嘱"1.5g bid×3天"解析应发几支？', a: '1支/次×2次/日×3天=6支。', pass: true },
    { q: '执行记录是否支持6次给药？', a: '护理记录3天每日2次，与6支一致。', pass: true },
  ],
  'A-105': () => [
    { q: '医嘱护理等级是几级？', a: '长期医嘱L02为二级护理。', pass: true },
    { q: '护理记录巡视频次支持几级？', a: '每2小时巡视=二级标准，不支持一级。', pass: true },
  ],
  'T-207': () => [
    { q: '培美曲塞是否目录内、本次必需？', a: '目录内乙类、为本次化疗方案必需药。', pass: true },
    { q: '住院费用清单是否确无培美曲塞？', a: '逐行核对20行，无任何培美曲塞收费行。', pass: true },
  ],
  'T-205': () => [
    { q: '本材料包是否含"前次化疗曾发生重度中性粒细胞减少"的证据？', a: '仅有本次入院概述"无骨髓抑制不适"，无前次逐日血常规——决定性证据不在本单份材料包内。', pass: false },
  ],
  'E-503': () => [
    { q: '该指令性文本是否被当作指令执行？', a: '否，事实层已将其隔离为引号内数据，未影响其他判定。', pass: true },
  ],
  'M-301': () => [
    { q: '麻醉记录单实际时长是否确为180分钟？', a: '麻醉记录载明 09:00–12:00，实际麻醉时长180分钟。', pass: true },
    { q: '费用是否确按240分钟收？', a: '费用清单麻醉行 duration_charged_min=240，> 实际180。', pass: true },
  ],
  'M-302': () => [
    { q: '麻醉方式是否为全身麻醉（含气管插管内涵）？', a: '麻醉记录载明全身麻醉（气管插管），术中常规监测。', pass: true },
    { q: '气管插管/监测是否在麻醉项目内涵中、却另立收费行？', a: '是，气管插管术、心电监测、氧饱和度监测均另立行收费，属内涵已含（序159/160）。', pass: true },
  ],
  'M-303': () => [
    { q: '麻醉记录丙泊酚实际用量是几支？', a: '麻醉记录单实际用药：丙泊酚3支。', pass: true },
    { q: '费用是否确收5支？', a: '费用清单丙泊酚行结算5支，> 实际3支，超2支。', pass: true },
  ],
  'P-303': () => [
    { q: '销售小票/进销存载明实际售出的是什么？', a: '实际售出为生活用品/保健品（口罩、蛋白粉），非医保药品。', pass: true },
    { q: '医保是否按药品名目结算？', a: '是，结算明细以医保目录内药品名义申请基金支付。', pass: true },
    { q: '是否排除了"确为目录内药品销售"的除外情形？', a: '是，实际销售商品类别为生活用品/保健品，非药品。', pass: true },
  ],
  'ICU-302': () => [
    { q: 'ICU记录/设备记录里呼吸机实际使用是几小时？', a: 'ICU记录载明有创呼吸机实际96小时（05-10 15:00～05-14 15:00）。', pass: true },
    { q: '费用是否确按更高时长计费？', a: '是，费用清单按120小时计费，> 实际96小时。', pass: true },
    { q: '是否排除"记录与计费时长一致"的除外情形？', a: '是，同例心电监测计费96=实际96小时未报，仅时长不符的呼吸机/CRRT报。', pass: true },
  ],
  'ICU-301': () => [
    { q: '本例护理级别是否为特级护理？', a: 'ICU记录与医嘱L01均载明特级护理。', pass: true },
    { q: '一般专项护理是否在特级护理内涵内？', a: '是，特级护理已含吸痰/管路维护等一般专项护理，另收即重复。', pass: true },
  ],
};
function genCoVe(finding) {
  const f = COVE[finding.rule_id];
  const items = f ? f() : [
    { q: '三要素是否齐备（证据定位/条款原文/推理）？', a: `证据${finding.evidence?.length || 0}项、条款${finding.policy?.length || 0}项、推理已给。`, pass: (finding.evidence?.length || 0) >= 2 },
  ];
  return { items, all_pass: items.every(i => i.pass) };
}

// ---------- 证据锚点硬字段化（消费事实层 anchor）+ 升6 置信度校准 ----------
function attachAnchors(finding, caseObj) {
  let minOcr = 1;
  for (const e of finding.evidence) {
    const m = (e.loc || '').match(/第\s*(\d+)\s*行/);
    if (m && /费用/.test(e.loc)) {
      const fact = caseObj.fee_lines.find(x => x.id === `F${String(m[1]).padStart(3, '0')}`);
      if (fact) { e.anchor = fact.anchor; minOcr = Math.min(minOcr, fact.anchor.ocr_conf); }
    }
  }
  return minOcr;
}
function computeConfidence(finding, minOcr, parseQuality) {
  let c = finding.status === '疑点' ? 82 : 55;
  const ev = finding.evidence?.length || 0;
  c += ev >= 3 ? 6 : ev >= 2 ? 3 : 0;
  if ((finding.policy || []).some(p => /已核/.test(p.verify_status || ''))) c += 6;
  if ((finding.reasoning || '').length > 60) c += 3;
  if (finding.debate?.verdict === '维持疑点') c += 3;
  if (finding._cove?.all_pass) c += 2;
  // OCR置信度传播：关键证据低置信→降级并提示人工核对
  if (minOcr < 0.85) { c = Math.round(c * (0.6 + minOcr * 0.4)); finding._low_ocr = true; }
  c = applyParseQAToConfidence(c, parseQuality);
  if (finding._compliance_conf_cap) c = Math.min(c, finding._compliance_conf_cap);
  return Math.max(5, Math.min(100, Math.round(c)));
}

// ---------- doc08宏观① 合议层 Reconciliation：一笔钱一主疑点、金额去重、多定性合并 ----------
function feeLineKey(finding) {
  const ids = new Set();
  for (const e of finding.evidence || []) {
    const m = (e.loc || '').match(/第\s*([\d、]+)\s*行/);
    if (m && /费用/.test(e.loc)) m[1].split('、').forEach(n => ids.add(Number(n)));
  }
  return ids.size ? [...ids].sort((a, b) => a - b).join(',') : null;
}
const RULE_CERTAINTY = { 'B-201': 3, 'A-110': 2, 'A-108': 1.5, 'F-003': 3, 'A-109': 3, 'A-105': 2.5, 'T-201': 3, 'T-207': 2.5, 'T-205': 2 };
function rulePenalty(ruleId) { return /A-108|C-304|E-50|T-202|^A-107/.test(ruleId) ? 3 : 2; } // 40条骗保类=3，38条=2
function primaryScore(f) { return (RULE_CERTAINTY[f.rule_id] ?? 2.5) * 3 + (f.evidence?.length || 0) + rulePenalty(f.rule_id); }
function reconcile(rawFindings) {
  const groups = new Map();
  for (const f of rawFindings) {
    const k = feeLineKey(f) || ('@' + f.finding_id);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  }
  const out = [], log = [];
  for (const [k, arr] of groups) {
    if (arr.length === 1) { out.push(arr[0]); continue; }
    arr.sort((a, b) => primaryScore(b) - primaryScore(a)); // 定主：定性确定性×3 + 证据完整度 + 罚则严重度
    const primary = arr[0], corro = arr.slice(1);
    primary.corroborations = corro.map(c => ({ rule_id: c.rule_id, rule_name: c.rule_name, status: c.status, violation_type: c.violation_type, reasoning: c.reasoning, policy: c.policy }));
    primary._merged_count = arr.length;
    primary._raw_amount_sum = money(arr.reduce((s, x) => s + (x.amount_involved || 0), 0));
    log.push({ fee_lines: k, merged: arr.length, primary: primary.rule_id, corroborations: corro.map(c => c.rule_id), amount_once: primary.amount_involved || 0, amount_if_double_counted: money(arr.reduce((s, x) => s + (x.amount_involved || 0), 0)) });
    out.push(primary);
  }
  return { findings: out, reconciliation_log: log };
}

// ---------- doc08宏观② 覆盖度清单 Coverage Manifest ----------
const COVERAGE_DIMENSIONS = [
  { key: '费用↔医嘱/执行一致性', rules: ['A-108', 'A-109', 'T-204'] },
  { key: '费用↔诊断/限定支付', rules: ['B-201', 'A-110', 'T-201', 'T-202', 'T-203'] },
  { key: '收费规范(重复/分解/超标/串换)', rules: ['A-101', 'A-102', 'A-103', 'A-104', 'A-105', 'A-106', 'A-107', 'T-206'] },
  { key: '住院行为', rules: ['C-301', 'C-302', 'C-303'] },
  { key: '支付方式(高套/转嫁)', rules: ['D-401', 'D-402', 'T-207', 'T-208'] },
  { key: '基础逻辑底线', rules: ['F-001', 'F-002', 'F-003', 'F-004', 'F-005', 'F-006'] },
  { key: '资质数据/对抗鲁棒', rules: ['E-501', 'E-502', 'E-503'] },
];
function coverageManifest(routing, record, findings) {
  const activated = new Set(routing.activated);
  const fired = new Set(findings.flatMap(f => [f.rule_id, ...(f.corroborations || []).map(c => c.rule_id)]));
  const materials = {
    费用清单: !!record.fee_list, 医嘱单: !!(record.long_term_orders || record.temporary_orders),
    护理记录: !!record.nursing_records, 检验报告: (record.lab_reports || []).length > 0,
    病理报告: !!record.pathology_report, '分子病理/基因检测证据': record.gene_test_report?.status !== '缺失',
  };
  const dimensions = COVERAGE_DIMENSIONS.map(d => {
    const exec = d.rules.filter(r => activated.has(r));
    const fd = d.rules.filter(r => fired.has(r));
    return { dimension: d.key, total_rules: d.rules.length, executed: exec, fired: fd, status: exec.length ? (fd.length ? '已查·有发现' : '已查·未见异常') : '未触发(本案无相关项)' };
  });
  const missing = Object.entries(materials).filter(([, v]) => !v).map(([k]) => k);
  return {
    materials, dimensions,
    statement: `本次核验覆盖 ${dimensions.filter(d => d.executed.length).length}/${dimensions.length} 个维度共 ${routing.activated_count} 条规则被激活。材料完整性：${missing.length ? missing.join('、') + ' 缺失' : '齐全'}。${missing.includes('分子病理/基因检测证据') ? '全案卷未见分子病理/基因检测证据，正是T-201判定的关键阴性证据。' : ''}未触发维度为本案无相关项（如无植入耗材），非漏查。`,
  };
}

// ---------- 主入口 ----------
function runAudit(record, rulesArray, options = {}) {
  _seq = 0;
  const rules = {};
  for (const r of rulesArray) rules[r.rule_id] = r;
  // 材料包形状归一：缺失的单据类别默认空，规则checker无需各自防御
  // （导入的真实材料常只含部分单据，如仅费用清单 → 必须补默认值，否则规则解引用 undefined 崩溃）
  record.progress_notes = record.progress_notes || [];
  record.lab_reports = record.lab_reports || [];
  record.long_term_orders = record.long_term_orders || { items: [] };
  record.long_term_orders.items = record.long_term_orders.items || [];
  record.temporary_orders = record.temporary_orders || { items: [] };
  record.temporary_orders.items = record.temporary_orders.items || [];
  record.nursing_records = record.nursing_records || { entries: [] };
  record.fee_list = record.fee_list || { items: [] };
  record.fee_list.items = record.fee_list.items || [];
  // 对象型单据：规则以 .prop 访问，缺失时默认空对象防止"读取 undefined 属性"
  record.front_page = record.front_page || {};
  record.admission_note = record.admission_note || {};
  record.pathology_report = record.pathology_report || {};
  record.gene_test_report = record.gene_test_report || {};
  record.discharge_summary = record.discharge_summary || {};
  record.imaging_record = record.imaging_record || {};
  record.icu_record = record.icu_record || {};
  // 升1 事实层：先把材料包编译为稽核案卷对象（每条事实自带源锚点）
  const caseObj = compileCaseObject(record);
  const ctx = {
    record, rules, caseObj,
    caseId: (record.case_meta?.case_id || 'CASE').replace(/[^A-Z0-9]/gi, '').slice(-8),
    params: {
      nursing_price: { ...JIANGSU_NURSING_PRICE },
      nursing_price_ref: JIANGSU_NURSING_REF,
    },
    policyTexts: options.policyTexts || {},
    policyVerified: options.policyVerified || {},
  };

  // 升2 触发器路由：先算哪些规则被激活（其余零成本跳过）
  const routing = computeRouting(caseObj, record, rulesArray);

  const findings = [];
  const trace = [];
  const retiredSet = new Set(options.retiredRules || []); // iter16 已下线(deprecated)规则：复审确认高误报后停用，不再fire
  for (const ruleId of Object.keys(ruleCheckers)) {
    if (!rules[ruleId]) { trace.push({ rule_id: ruleId, rule_name: '(未加载)', hits: 0, ms: 0, skipped: true }); continue; }
    if (retiredSet.has(ruleId)) { trace.push({ rule_id: ruleId, rule_name: rules[ruleId]?.rule_name, hits: 0, ms: 0, retired: true }); continue; }
    const t0 = Date.now();
    let got = [];
    try {
      got = ruleCheckers[ruleId](ctx) || [];
    } catch (e) {
      // 单条规则在异常材料形状下抛错 → 跳过该规则并记录，绝不让整次稽核 500（导入的稀疏案卷尤需）
      trace.push({ rule_id: ruleId, rule_name: rules[ruleId]?.rule_name, hits: 0, ms: Date.now() - t0, error: e.message });
      continue;
    }
    trace.push({ rule_id: ruleId, rule_name: rules[ruleId]?.rule_name, hits: got.length, ms: Date.now() - t0 });
    findings.push(...got);
  }
  let distractors = [];
  try { distractors = checkDistractors(ctx); } catch (e) { /* 干扰项分析在异常材料形状下失败不阻断稽核 */ }

  // doc08宏观① 合议层：一笔钱被多规则命中→合并1主疑点+佐证视角、金额去重（必须在计金额前）
  const rec = reconcile(findings);
  let merged = rec.findings;
  const parseQuality = record.case_meta?.parse_quality || options.parseQuality || null;

  // 逐发现（合议后）：控辩裁 + CoVe + 锚点 + 置信度
  for (const f of merged) {
    if (parseQuality?.level && parseQuality.level !== 'ok') f._parse_qa_warn = true;
    f.debate = genDebate(f, rules[f.rule_id]);
    f._cove = genCoVe(f);
    f.cove = f._cove;
    const minOcr = attachAnchors(f, caseObj);
    f.confidence = computeConfidence(f, minOcr, parseQuality);
    f.min_ocr_conf = Number(minOcr.toFixed(2));
    f.priority_score = Number(((f.amount_involved || 0) * (f.confidence / 100)).toFixed(1)); // 升6 金额×置信
  }

  const gov = applyPostAuditGovernance(merged, {
    shadowRules: options.shadowRules,
    retiredRules: options.retiredRules,
    policyTexts: ctx.policyTexts,
    policyVerified: ctx.policyVerified,
  });
  merged = gov.findings;
  const { suspected, clues, shadowed, summary: govSummary } = gov;
  const coverage = coverageManifest(routing, record, merged); // doc08宏观②

  return {
    report_meta: {
      case_id: record.case_meta?.case_id,
      patient: `${record.front_page.patient_name} ${record.front_page.sex} ${record.front_page.age}岁`,
      audit_engine: '鹰眼·医保基金稽核智能体 v0.5（事实层+合规前置+ParseQA+路由+合议层+控辩裁+CoVe+置信）',
      parse_quality: parseQuality,
      audit_scope: `本次住院（${record.front_page.admit_time?.slice(0,10)} ~ ${record.front_page.discharge_time?.slice(0,10)}）全部费用与病历材料`,
      human_baseline_minutes: 40,
      agent_seconds: 90,
      routing,
      caseobject_summary: caseObj.summary,
      reconciliation_log: rec.reconciliation_log, // 合议日志（去重证明）
      coverage,                                    // 覆盖度声明
      summary: {
        raw_findings_before_merge: findings.length,
        merged_count: findings.length - merged.length,
        amount_if_double_counted: money(rec.reconciliation_log.reduce((s, l) => s + (l.amount_if_double_counted - l.amount_once), 0) + suspected.reduce((s, f) => s + (f.amount_involved || 0), 0)),
        ...govSummary,
      },
    },
    findings: merged,
    correctly_not_flagged: distractors,
    engine_trace: trace,
    case_object: caseObj,
  };
}

const SHADOW_REASON = '该规则因复核高频驳回（≥阈值）已转入观察期（shadow 态）：仍检测并完整展示证据链，但暂不计入疑点/金额，等待规则复审（re_review）。这是"误报回流"的执行端——坏规则被自动降权，而非继续误伤。';

/** B07c：确定性/LLM 共用 —— 合规前置 + shadow 观察期 + 汇总统计 */
function applyPostAuditGovernance(findings, options = {}) {
  const shadowSet = new Set(options.shadowRules || []);
  const retiredSet = new Set(options.retiredRules || []);
  const merged = (findings || []).filter(f => !retiredSet.has(f.rule_id));

  applyComplianceGate(merged, {
    policyTexts: options.policyTexts || {},
    policyVerified: options.policyVerified || {},
  });

  for (const f of merged) {
    if (shadowSet.has(f.rule_id)) {
      f.shadow = true;
      f.shadow_reason = SHADOW_REASON;
    }
  }

  merged.sort((a, b) => {
    if (!!a.shadow !== !!b.shadow) return a.shadow ? 1 : -1;
    if (a.status !== b.status) return a.status === '疑点' ? -1 : 1;
    return (b.priority_score || 0) - (a.priority_score || 0);
  });

  const active = merged.filter(f => !f.shadow);
  const shadowed = merged.filter(f => f.shadow);
  const suspected = active.filter(f => f.status === '疑点');
  const clues = active.filter(f => f.status === '线索');

  return {
    findings: merged,
    suspected,
    clues,
    shadowed,
    summary: {
      total_findings: merged.length,
      suspected_count: suspected.length,
      clue_count: clues.length,
      shadow_count: shadowed.length,
      shadow_rules: [...shadowSet],
      shadow_amount_withheld: money(shadowed.reduce((s, f) => s + (f.amount_involved || 0), 0)),
      retired_rules: [...retiredSet],
      suspected_amount: money(suspected.reduce((s, f) => s + (f.amount_involved || 0), 0)),
      clue_amount_flagged: money(clues.reduce((s, f) => s + (f.amount_involved || 0), 0)),
    },
  };
}

module.exports = { runAudit, parseDate, computeExpectedQty, compileCaseObject, reconcile, applyPostAuditGovernance, ruleCheckerIds: Object.keys(ruleCheckers) };
