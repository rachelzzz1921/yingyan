'use strict';

/**
 * L3 操作索引 · 四族 + F-001/F-002/C-301/C-302/B-202 数据驱动 checker
 * 消费 kb_operational_index.json 中 usage_limit / second_line / facility_level / insurance_type
 */
const { lookupConstraints } = require('./kb-operational-index');
const { MALE_ONLY, FEMALE_ONLY } = require('./precheck-native');

function ev(type, loc, text) { return { type, loc, text }; }
function norm(s) { return String(s || '').replace(/\s+/g, '').trim(); }
function drugFeeLines(record) {
  return (record.fee_list?.items || []).filter(l => /药|西药|中成药|生物/.test(l.category || '') || /片|胶囊|注射液|颗粒|乳膏|软膏/.test(l.item_name || ''));
}

function parseUsageCaps(basis) {
  const b = String(basis || '');
  const caps = {};
  const mDay = b.match(/单次最多支付(\d+)天|最多支付(\d+)天|不超过(\d+)天|限(\d+)天/);
  if (mDay) caps.maxDays = Number(mDay[1] || mDay[2] || mDay[3] || mDay[4]);
  const mDaily = b.match(/每日[^\d]{0,6}(\d+)次|每天(\d+)次/);
  if (mDaily) caps.maxPerDay = Number(mDaily[1] || mDaily[2]);
  if (/每住院1次|住院期间1次|每住院一次/.test(b)) caps.perStay = 1;
  return caps;
}

function feeDayKey(feeDate) {
  const raw = String(feeDate || '').trim();
  if (!raw) return '';
  return raw.split(/[~～至]/)[0].trim().slice(0, 10);
}

function parseDateLoose(s) {
  if (!s) return null;
  const m = String(s).match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

function daysBetween(a, b) {
  const da = parseDateLoose(a);
  const db = parseDateLoose(b);
  if (!da || !db) return null;
  return Math.round((da - db) / 86400000);
}

function hospitalLevelNum(record) {
  const lv = String(record.front_page?.hospital_level || record.case_meta?.hospital_level || '');
  if (/三级/.test(lv)) return 3;
  if (/二级/.test(lv)) return 2;
  if (/一级/.test(lv)) return 1;
  return null;
}

function insurancePool(record) {
  return String(record.front_page?.insurance_type || record.case_meta?.insurance_type || '');
}

function clinicalText(record) {
  const chunks = [];
  const fp = record.front_page || {};
  const adm = record.admission_note || {};
  if (fp.principal_diagnosis?.name) chunks.push(fp.principal_diagnosis.name);
  for (const d of fp.other_diagnosis || []) if (d.name) chunks.push(d.name);
  for (const field of [adm.chief_complaint, adm.present_illness, adm.treatment_plan]) if (field) chunks.push(field);
  for (const n of record.progress_notes || []) if (n.text) chunks.push(n.text);
  if (record.discharge_summary?.discharge_diagnosis) {
    for (const d of record.discharge_summary.discharge_diagnosis) chunks.push(String(d));
  }
  for (const lab of record.lab_reports || []) {
    for (const r of lab.results || []) chunks.push(`${r.item}${r.value}${r.flag || ''}`);
  }
  return chunks.join(' ');
}

const ABX_RE = /头孢|青霉素|青霉|喹诺酮|左氧|环丙|莫西|阿莫西林|万古|美罗|亚胺|哌拉|舒巴坦|抗菌|抗生素/i;
const INFECT_RE = /感染|发热|脓|CRP|PCT|白细胞|WBC|中性粒|培养|肺炎|菌血症|败血|黄痰|咳嗽.*痰|体温.*3[89]|体温.*4\d/i;
const FIRST_LINE_RE = /一线.*无效|一线.*不耐受|传统治疗无效|既往.*无效|不耐受.*一线|规范治疗无效/i;

/** F-001 性别—项目/药品冲突（L3 gender_limited + 硬编码模式） */
function evaluateGenderFeeConflicts(ctx, mkFinding) {
  const { record } = ctx;
  const sex = String(record.front_page?.sex || '').trim();
  if (!sex) return [];
  const out = [];
  const seen = new Set();
  for (const line of record.fee_list?.items || []) {
    const name = String(line.item_name || '');
    if (!name) continue;
    let conflict = null;
    if (sex === '女' && MALE_ONLY.test(name)) conflict = '男';
    if (sex === '男' && FEMALE_ONLY.test(name)) conflict = '女';
    const recs = lookupConstraints(name).filter(r => r.family === 'gender_limited' && r.cond.limit_sex);
    for (const rec of recs) {
      if (sex !== rec.cond.limit_sex) conflict = rec.cond.limit_sex;
    }
    if (!conflict || seen.has(`${line.line_no}|${name}`)) continue;
    seen.add(`${line.line_no}|${name}`);
    const exact = recs.some(r => r.cond.limit_sex === conflict && !r.cond.sex_inferred);
    out.push(mkFinding(ctx, 'F-001', {
      status: exact ? '疑点' : '线索',
      risk_level: exact ? '高' : '中',
      amount_involved: line.amount || 0,
      evidence: [
        ev('费用行', `费用清单 第${line.line_no}行`, `${name} ${line.amount}元`),
        ev('患者信息', '病案首页', `患者性别：${sex}；项目/药品限定：${conflict}性`),
      ],
      reasoning: `${sex}性患者费用清单第${line.line_no}行「${name}」与${conflict}性专属项目/药品限定冲突（两库区分性别使用 / 硬互斥）。`,
      disposal: exact ? `建议核实身份与项目必要性，涉嫌串换或登记错误。` : '建议复核性别登记与开立必要性。',
    }));
  }
  return out;
}

/** F-002 年龄—儿童限定药品冲突 */
function evaluateChildFeeConflicts(ctx, mkFinding) {
  const { record } = ctx;
  const age = Number(record.front_page?.age);
  if (!Number.isFinite(age)) return [];
  const out = [];
  const seen = new Set();
  for (const line of drugFeeLines(record)) {
    const name = String(line.item_name || '');
    const recs = lookupConstraints(name).filter(r => r.family === 'child_limited');
    for (const rec of recs) {
      const over = rec.cond.age_max != null && age > rec.cond.age_max;
      const under = rec.cond.age_min != null && age < rec.cond.age_min;
      if (!over && !under) continue;
      const key = `${norm(name)}|${rec.refs?.[0] || rec.basis}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const rng = rec.cond.age_min != null ? `${rec.cond.age_min}-${rec.cond.age_max}岁` : `≤${rec.cond.age_max}岁`;
      out.push(mkFinding(ctx, 'F-002', {
        status: '疑点',
        risk_level: '高',
        amount_involved: line.amount || 0,
        evidence: [
          ev('费用行', `费用清单 第${line.line_no}行`, `${name} ${line.amount}元`),
          ev('患者信息', '病案首页', `患者年龄 ${age} 岁；两库限定 ${rng}`),
          ev('限定支付依据', (rec.refs || [])[0] || 'L3·child_limited', (rec.basis || '').slice(0, 120)),
        ],
        reasoning: `患者 ${age} 岁使用「${name}」，超出两库儿童限定区间（${rng}）——年龄与项目适用人群冲突。`,
        disposal: '建议核实年龄登记与用药合规性，超出限定区间部分按自费或退回处理。',
      }));
    }
  }
  return out;
}

/** F-006 限频/疗程（L3 usage_limit） */
function evaluateUsageLimitViolations(ctx, mkFinding) {
  const { record } = ctx;
  const out = [];
  const flaggedByName = new Map();
  for (const line of drugFeeLines(record)) {
    if (/★F-006|超疗程|超频/.test(String(line.flag || ''))) {
      flaggedByName.set(norm(line.item_name), line);
    }
  }
  for (const [n, flagLine] of flaggedByName) {
    const same = (record.fee_list?.items || []).filter(l => norm(l.item_name) === n || norm(l.item_name).includes(n));
    const totalDays = same.reduce((s, l) => s + (Number(l.qty) || 0), 0);
    const limit = Number(record.case_meta?.usage_limit_days) || 14;
    if (totalDays <= limit) continue;
    out.push(mkFinding(ctx, 'F-006', {
      status: '疑点',
      risk_level: '中',
      amount_involved: flagLine.amount || 0,
      evidence: [
        ev('费用行', `费用清单 第${flagLine.line_no}行`, `${flagLine.item_name} 累计${totalDays}天>上限${limit}天`),
        ev('埋点标记', 'fee flag', String(flagLine.flag || 'usage_limit')),
      ],
      reasoning: `「${flagLine.item_name}」累计计费 ${totalDays} 天，超过单次最多支付 ${limit} 天——限频/疗程超标准。`,
      disposal: '建议按超限部分责令退回或自费结算。',
    }));
  }
  const seen = new Set();
  for (const line of drugFeeLines(record)) {
    const name = String(line.item_name || '');
    const recs = lookupConstraints(name).filter(r => r.family === 'usage_limit');
    for (const rec of recs) {
      const caps = parseUsageCaps(rec.basis);
      if (!caps.maxDays && !caps.maxPerDay && !caps.perStay) continue;
      const key = `${norm(name)}|${(rec.refs || [])[0] || rec.basis}`;
      if (seen.has(key)) continue;

      const same = (record.fee_list?.items || []).filter(l => norm(l.item_name) === norm(name) || norm(l.item_name).includes(norm(name)) || norm(name).includes(norm(l.item_name)));
      let hit = null;
      if (caps.perStay && same.length > 1) {
        hit = { kind: 'perStay', count: same.length, limit: 1 };
      }
      if (caps.maxDays) {
        const totalDays = same.reduce((s, l) => s + (Number(l.qty) || 0), 0);
        if (totalDays > caps.maxDays) hit = { kind: 'maxDays', count: totalDays, limit: caps.maxDays };
      }
      if (caps.maxPerDay) {
        const byDay = new Map();
        for (const l of same) {
          const d = feeDayKey(l.fee_date);
          byDay.set(d, (byDay.get(d) || 0) + (Number(l.qty) || 1));
        }
        for (const [d, cnt] of byDay) {
          if (cnt > caps.maxPerDay) { hit = { kind: 'daily', day: d, count: cnt, limit: caps.maxPerDay }; break; }
        }
      }
      if (!hit) continue;
      seen.add(key);
      const primary = same[0] || line;
      const overAmt = Math.max(0, (line.amount || 0) * Math.max(0, (hit.count - hit.limit) / (hit.count || 1)));
      out.push(mkFinding(ctx, 'F-006', {
        status: '疑点',
        risk_level: '中',
        amount_involved: Math.round(overAmt * 100) / 100 || line.amount || 0,
        evidence: [
          ev('费用行', `费用清单 第${primary.line_no}行`, `${name} 累计计费超出两库限频/疗程`),
          ev('限定支付依据', (rec.refs || [])[0] || 'L3·usage_limit', (rec.basis || '').slice(0, 160)),
          ev('比对结论', 'L3·usage_limit', `检出：${hit.kind} 实际${hit.count} > 上限${hit.limit}${hit.day ? `（${hit.day}）` : ''}`),
        ],
        reasoning: `「${name}」医保限定：${(rec.basis || '').slice(0, 100)}。本案聚合计费${hit.count}${hit.kind === 'maxDays' ? '天' : '次'}，超过上限${hit.limit}——限频/疗程超标准（38条三）。`,
        disposal: '建议按超限部分责令退回或自费结算。',
      }));
      if (out.length >= 4) return out;
    }
  }
  return out;
}

/** B-209 药品限二线（L3 second_line） */
function evaluateSecondLine(ctx, mkFinding) {
  const clinical = clinicalText(ctx.record);
  const out = [];
  const seen = new Set();
  for (const line of drugFeeLines(ctx.record)) {
    const name = String(line.item_name || '');
    const recs = lookupConstraints(name).filter(r => r.family === 'second_line');
    for (const rec of recs) {
      const key = `${norm(name)}|${(rec.refs || [])[0] || rec.basis}`;
      if (seen.has(key)) continue;
      if (FIRST_LINE_RE.test(clinical)) continue;
      seen.add(key);
      out.push(mkFinding(ctx, 'B-209', {
        status: '线索',
        risk_level: '中',
        amount_involved: line.amount || 0,
        evidence: [
          ev('费用行', `费用清单 第${line.line_no}行`, `${name} ${line.amount}元`),
          ev('限定支付依据', (rec.refs || [])[0] || 'L3·second_line', (rec.basis || '').slice(0, 160)),
          ev('病历检索', '诊断/病程/检验', `未检索到「一线无效/不耐受」等二线前置证据`),
        ],
        reasoning: `「${name}」医保限定：${(rec.basis || '').slice(0, 120)}。本案病历未检出一线治疗无效或不耐受依据——材料包内难以闭环，先出线索。`,
        needs_more: ['调阅完整病历：一线用药史、疗效评估或不耐受记录'],
        disposal: '建议复核是否符合二线用药支付条件。',
      }));
      if (out.length >= 3) return out;
    }
  }
  return out;
}

/** B-210 机构级别限定（L3 facility_level） */
function evaluateFacilityLevel(ctx, mkFinding) {
  const lv = hospitalLevelNum(ctx.record);
  if (lv == null) return [];
  const out = [];
  const seen = new Set();
  for (const line of drugFeeLines(ctx.record)) {
    const name = String(line.item_name || '');
    const recs = lookupConstraints(name).filter(r => r.family === 'facility_level');
    for (const rec of recs) {
      const minLv = rec.cond.level_min || (/\b二级\b|二级及以上/.test(rec.basis || '') ? 2 : /\b三级\b|三级及以上/.test(rec.basis || '') ? 3 : null);
      if (!minLv || lv >= minLv) continue;
      const key = `${norm(name)}|${(rec.refs || [])[0] || rec.basis}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(mkFinding(ctx, 'B-210', {
        status: '线索',
        risk_level: '中',
        amount_involved: line.amount || 0,
        evidence: [
          ev('费用行', `费用清单 第${line.line_no}行`, `${name} ${line.amount}元`),
          ev('机构信息', '病案首页', `医疗机构级别：${ctx.record.front_page?.hospital_level || '—'}（解析为${lv}级）`),
          ev('限定支付依据', (rec.refs || [])[0] || 'L3·facility_level', (rec.basis || '').slice(0, 160)),
        ],
        reasoning: `「${name}」限定${minLv}级及以上医疗机构使用/处方，本案机构为${lv}级——机构级别可能不符，先出线索。`,
        disposal: '建议核实首次处方机构级别与医保支付规定。',
      }));
    }
  }
  return out;
}

/** B-211 险种限定（L3 insurance_type） */
function evaluateInsuranceType(ctx, mkFinding) {
  const ins = insurancePool(ctx.record);
  if (!ins) return [];
  const out = [];
  const seen = new Set();
  for (const line of drugFeeLines(ctx.record)) {
    const name = String(line.item_name || '');
    const recs = lookupConstraints(name).filter(r => r.family === 'insurance_type');
    for (const rec of recs) {
      const need = rec.cond.insurance || (/工伤/.test(rec.basis || '') ? '工伤' : /生育/.test(rec.basis || '') ? '生育' : null);
      if (!need) continue;
      const ok = (need === '工伤' && /工伤/.test(ins)) || (need === '生育' && /生育/.test(ins));
      if (ok) continue;
      const key = `${norm(name)}|${need}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(mkFinding(ctx, 'B-211', {
        status: '疑点',
        risk_level: '高',
        amount_involved: line.amount || 0,
        evidence: [
          ev('费用行', `费用清单 第${line.line_no}行`, `${name} ${line.amount}元`),
          ev('参保信息', '病案首页/结算', `险种：${ins}`),
          ev('限定支付依据', (rec.refs || [])[0] || 'L3·insurance_type', (rec.basis || '').slice(0, 80)),
        ],
        reasoning: `「${name}」限${need}保险支付，本案参保类型为「${ins}」——险种与限定支付范围不符。`,
        disposal: `建议核实险种后责令退回 ${line.amount} 元或改自费结算。`,
      }));
    }
  }
  return out;
}

/** B-202 无指征抗菌药物 */
function evaluateAntibioticIndication(ctx, mkFinding) {
  const { record } = ctx;
  const clinical = clinicalText(record);
  const hasInfection = INFECT_RE.test(clinical) || (record.front_page?.principal_diagnosis?.name && /感染|肺炎|脓毒|菌/.test(record.front_page.principal_diagnosis.name));
  const periOp = !!record.operation_note?.operation_name && /围手术|预防|术前|术后/.test(clinical + JSON.stringify(record.operation_note || {}));
  if (hasInfection || periOp) return [];
  const out = [];
  for (const line of drugFeeLines(record)) {
    const name = String(line.item_name || '');
    if (!ABX_RE.test(name)) continue;
    out.push(mkFinding(ctx, 'B-202', {
      status: '线索',
      risk_level: '中',
      amount_involved: line.amount || 0,
      evidence: [
        ev('费用行', `费用清单 第${line.line_no}行`, `${name} ${line.amount}元`),
        ev('病历检索', '诊断/病程/检验', '已检索：未见明确感染诊断或实验室/影像感染证据'),
        ev('除外核对', '手术/预防用药', periOp ? '围手术期预防情形' : '非围手术期预防情形'),
      ],
      reasoning: `费用清单使用抗菌药物「${name}」，但病历诊断/病程/检验检索未见感染证据，且不符合明确的围手术期预防情形——疑似无指征使用（38条二），材料包内先出线索。`,
      needs_more: ['补查体温单、CRP/PCT、培养、影像等感染佐证'],
      disposal: '建议结合完整病历复核抗菌药物使用指征。',
    }));
    if (out.length >= 2) break;
  }
  return out;
}

/** C-301 分解住院 */
function evaluateDecomposeAdmission(ctx, mkFinding) {
  const { record } = ctx;
  const prevList = record.front_page?.previous_admissions || [];
  if (!prevList.length) return [];
  const admit = record.front_page?.admit_time;
  const dx = record.front_page?.principal_diagnosis?.name || '';
  const intervalDays = Number(ctx.rules?.['C-301']?.params?.interval_days) || 15;
  const out = [];
  for (const prev of prevList) {
    const gap = daysBetween(admit, prev.discharge_time || prev.discharge);
    if (gap == null || gap > intervalDays || gap < 0) continue;
    const prevDx = prev.principal_diagnosis || prev.diagnosis || '';
    if (!prevDx || !dx || (norm(prevDx) !== norm(dx) && !norm(dx).includes(norm(prevDx)) && !norm(prevDx).includes(norm(dx)))) continue;
    const aggravating = /未愈|再入院|建议.*入院|继续治疗|方案连续|临近.*上限|分解/.test(String(prev.discharge_note || prev.note || '') + String(prev.flag || ''));
    const newOnset = /新发|急诊|加重|急性|转诊|转院/.test(clinicalText(record));
    if (!aggravating || newOnset) continue;
    out.push(mkFinding(ctx, 'C-301', {
      status: '疑点',
      risk_level: '高',
      amount_involved: record.fee_list?.total_amount || 0,
      evidence: [
        ev('前次住院', prev.admission_no || '前次病案', `出院 ${prev.discharge_time || prev.discharge}；诊断 ${prevDx}`),
        ev('本次住院', '病案首页', `入院 ${admit}；诊断 ${dx}；间隔 ${gap} 天`),
        ev('加重情节', '前次出院记录', (prev.discharge_note || prev.note || prev.flag || '前次出院提示再入院/未愈').toString().slice(0, 120)),
      ],
      reasoning: `同一患者相邻两次住院间隔 ${gap} 天（≤${intervalDays}天），主诊断高度相关，且前次出院记录存在「未愈/建议再入院」等加重情节，本次未见新发病情说明——疑似分解住院（38条一）。`,
      disposal: '建议调取两次住院完整病历合议，核实是否存在分解住院。',
    }));
    break;
  }
  return out;
}

/** C-302 挂床住院 */
function evaluateGhostBed(ctx, mkFinding) {
  const { record } = ctx;
  const nursing = record.nursing_records || {};
  // 仅当案卷显式标注护理记录覆盖天数或空窗天数时才判，避免缺护理单据的稀疏案卷误报
  if (nursing.days_documented == null && nursing.idle_days_gap == null) return [];
  const idleThreshold = Number(record.case_meta?.ghost_bed_days) || 3;
  const documented = nursing.days_documented ?? 0;
  const feeDays = (record.fee_list?.items || []).filter(l => /床位|护理|诊查/.test(l.item_name || '') && /日|天/.test(String(l.unit || '')));
  if (!feeDays.length) return [];
  const maxQty = Math.max(...feeDays.map(l => Number(l.qty) || 0));
  const explicitGap = Number(nursing.idle_days_gap);
  if (!Number.isFinite(explicitGap)) return [];
  const gap = explicitGap;
  if (gap < idleThreshold) return [];
  const amt = feeDays.reduce((s, l) => s + (l.amount || 0), 0);
  return [mkFinding(ctx, 'C-302', {
    status: '疑点',
    risk_level: '高',
    amount_involved: Math.round(amt * 0.3 * 100) / 100,
    evidence: [
      ev('护理记录', '护理记录单', `有记录天数/条目约 ${documented} 天`),
      ev('费用行', '床位/护理/诊查', `按日计费最高 ${maxQty} 日（${feeDays.map(l => `第${l.line_no}行${l.item_name}`).join('、')}）`),
      ev('空窗', '病程/护理', nursing.idle_note || `连续 ≥${idleThreshold} 日无护理/体征记录仍计费`),
    ],
    reasoning: `住院期间护理记录仅覆盖约 ${documented} 日，但床位/护理/诊查按日计费达 ${maxQty} 日，空窗 ≥${idleThreshold} 日——疑似挂床住院仍计费（38条一）。`,
    disposal: '建议调取体温单/护理记录核对空窗期是否仍计费。',
  })];
}

/** L3-DRX 重复开药 / 药品种类超标 */
function evaluateDuplicateRx(ctx, mkFinding) {
  const { record } = ctx;
  const lines = drugFeeLines(record);
  if (lines.length < 2) return [];
  const out = [];
  const byNorm = new Map();
  for (const line of lines) {
    const n = norm(line.item_name).replace(/\(.*?\)/g, '');
    if (!n) continue;
    if (!byNorm.has(n)) byNorm.set(n, []);
    byNorm.get(n).push(line);
  }
  for (const [name, group] of byNorm) {
    if (group.length < 2) continue;
    if (group.some(l => /★F-006|疗程内|续方/.test(String(l.flag || '')))) continue;
    const days = group.map(l => feeDayKey(l.fee_date)).filter(Boolean);
    const sameDayDup = days.length >= 2 && new Set(days).size < days.length;
    const rangeDup = group.every(l => !String(l.fee_date || '').includes('~'));
    if (!sameDayDup && !rangeDup) continue;
    const recs = lookupConstraints(group[0].item_name).filter(r => r.family === 'duplicate_rx');
    const line = group[group.length - 1];
    out.push(mkFinding(ctx, 'L3-DRX', {
      status: '疑点',
      risk_level: '中',
      amount_involved: line.amount || 0,
      evidence: [
        ev('费用行', `费用清单 第${group.map(g => g.line_no).join('/')}行`, `同一药品「${group[0].item_name}」重复开立 ${group.length} 次`),
        ev('限定支付依据', (recs[0]?.refs || [])[0] || 'L3·duplicate_rx', recs[0]?.basis || '重复开药监管'),
      ],
      reasoning: `费用清单中「${group[0].item_name}」出现 ${group.length} 条独立计费行——疑似重复开药或拆分开立（L3 duplicate_rx）。`,
      disposal: '建议核对医嘱与处方，合并重复开立或责令退回重复部分。',
    }));
    if (out.length >= 2) return out;
  }
  const distinct = new Set(lines.map(l => norm(l.item_name).slice(0, 8)));
  const maxKinds = Number(ctx.rules?.['L3-DRX']?.params?.max_distinct_drugs) || 5;
  if (record.case_meta?.drug_kind_excess === true || distinct.size > maxKinds + 3) {
    out.push(mkFinding(ctx, 'L3-DRX', {
      status: '线索',
      risk_level: '中',
      amount_involved: lines.reduce((s, l) => s + (l.amount || 0), 0),
      evidence: [
        ev('费用聚合', '药品费用行', ` distinct 药品种类约 ${distinct.size} 种`),
        ev('监管阈值', 'L3-DRX', `药品种类超标监测阈值 ${maxKinds} 种（演示）`),
      ],
      reasoning: `本案药品费用行涉及约 ${distinct.size} 种不同药品，超过机构药品种类监测阈值——疑似药品种类超标（管理要求）。`,
      disposal: '建议结合处方点评与抗菌药物分级管理复核。',
    }));
  }
  return out;
}

const FEMALE_DX_RE = /宫颈|子宫|卵巢|阴道|妊娠|分娩|产科|月经|乳腺(?!癌.*男)/;
const MALE_DX_RE = /前列腺|睾丸|精囊|阴茎(?!.*癌.*女)/;
const PREGNANCY_DRUG_RE = /利巴韦林|甲氨蝶呤|华法林|异维A酸|米非司酮/i;
const TCM_INCOMPAT_RE = /甘草.*甘遂|乌头.*贝母|藜芦.*人参/i;

/** L3-CDM 编码/诊断手术不符 */
function evaluateCodingMismatch(ctx, mkFinding) {
  const { record } = ctx;
  const sex = String(record.front_page?.sex || '').trim();
  const age = Number(record.front_page?.age);
  const dx = record.front_page?.principal_diagnosis?.name || '';
  const icd = record.front_page?.principal_diagnosis?.icd10 || '';
  const ops = record.front_page?.operations || record.operation_note?.operations || [];
  const out = [];

  if (sex === '男' && FEMALE_DX_RE.test(dx)) {
    out.push(mkFinding(ctx, 'L3-CDM', {
      status: '疑点', risk_level: '高', amount_involved: 0,
      evidence: [
        ev('诊断', '病案首页', `主诊断：${dx}`),
        ev('患者信息', '病案首页', `性别：${sex}`),
      ],
      reasoning: `男性患者主诊断为「${dx}」，与性别专属疾病范畴不符——诊断与患者性别不符（编码监管）。`,
      disposal: '建议核实诊断编码与性别登记，修正错误编码或身份登记。',
    }));
  }
  if (sex === '女' && MALE_DX_RE.test(dx)) {
    out.push(mkFinding(ctx, 'L3-CDM', {
      status: '疑点', risk_level: '高', amount_involved: 0,
      evidence: [
        ev('诊断', '病案首页', `主诊断：${dx}`),
        ev('患者信息', '病案首页', `性别：${sex}`),
      ],
      reasoning: `女性患者主诊断为「${dx}」，与性别专属疾病范畴不符——诊断与患者性别不符。`,
      disposal: '建议核实诊断编码与性别登记。',
    }));
  }
  if (Number.isFinite(age) && age > 55 && /新生儿|早产|围产期/.test(dx)) {
    out.push(mkFinding(ctx, 'L3-CDM', {
      status: '疑点', risk_level: '中', amount_involved: 0,
      evidence: [ev('诊断', '病案首页', `${dx}（ICD ${icd}）`), ev('患者信息', '病案首页', `年龄 ${age} 岁`)],
      reasoning: `${age} 岁患者主诊断为「${dx}」——诊断与患者年龄明显不符。`,
      disposal: '建议复核诊断编码录入。',
    }));
  }
  if (record.case_meta?.coding_mismatch_flag) {
    out.push(mkFinding(ctx, 'L3-CDM', {
      status: '疑点', risk_level: '中', amount_involved: 0,
      evidence: [ev('编码对', '结算清单', String(record.case_meta.coding_mismatch_flag))],
      reasoning: `主诊断与主要手术操作编码相关性不足——${record.case_meta.coding_mismatch_flag}。`,
      disposal: '建议按编码规范修正主手术选择或诊断。',
    }));
  }
  for (const line of record.fee_list?.items || []) {
    const recs = lookupConstraints(line.item_name).filter(r => r.family === 'coding_mismatch');
    for (const rec of recs.slice(0, 1)) {
      out.push(mkFinding(ctx, 'L3-CDM', {
        status: '线索', risk_level: '中', amount_involved: line.amount || 0,
        evidence: [
          ev('费用行', `第${line.line_no}行`, line.item_name),
          ev('编码规则', (rec.refs || [])[0] || 'L3·coding_mismatch', (rec.basis || '').slice(0, 100)),
        ],
        reasoning: `费用项目「${line.item_name}」命中两库编码不符规则——${(rec.basis || '').slice(0, 80)}。`,
        disposal: '建议复核诊断/手术编码与费用项目对应关系。',
      }));
      return out;
    }
  }
  return out;
}

/** L3-SAF 用药安全 */
function evaluateSafetyRule(ctx, mkFinding) {
  const { record } = ctx;
  const out = [];
  const preg = /孕|产褥|妊娠/.test(clinicalText(record) + (record.front_page?.sex === '女' ? '' : ''));
  const isPregnant = record.case_meta?.pregnant === true || preg;
  for (const line of drugFeeLines(record)) {
    const name = String(line.item_name || '');
    const recs = lookupConstraints(name).filter(r => r.family === 'safety_rule');
    for (const rec of recs.slice(0, 1)) {
      out.push(mkFinding(ctx, 'L3-SAF', {
        status: '线索', risk_level: '中', amount_involved: line.amount || 0,
        evidence: [
          ev('费用行', `第${line.line_no}行`, name),
          ev('安全规则', (rec.refs || [])[0] || 'L3·safety_rule', (rec.basis || '').slice(0, 120)),
        ],
        reasoning: `「${name}」命中用药安全规则：${(rec.basis || '').slice(0, 100)}。`,
        disposal: '建议药师复核禁忌症与相互作用。',
      }));
      if (out.length >= 2) return out;
    }
    if (isPregnant && PREGNANCY_DRUG_RE.test(name)) {
      out.push(mkFinding(ctx, 'L3-SAF', {
        status: '疑点', risk_level: '高', amount_involved: line.amount || 0,
        evidence: [
          ev('费用行', `第${line.line_no}行`, name),
          ev('患者状态', '病历', '妊娠期/哺乳期用药风险'),
        ],
        reasoning: `妊娠期/哺乳期患者使用「${name}」——命中妊娠期用药安全监测（38条二）。`,
        disposal: '建议核实妊娠状态与用药必要性，不符合者拒付或转自费。',
      }));
      return out;
    }
  }
  if (record.case_meta?.drug_interaction_flag) {
    out.push(mkFinding(ctx, 'L3-SAF', {
      status: '线索', risk_level: '中', amount_involved: 0,
      evidence: [ev('相互作用', '医嘱/费用', String(record.case_meta.drug_interaction_flag))],
      reasoning: `检出潜在药物相互作用：${record.case_meta.drug_interaction_flag}。`,
      disposal: '建议药师会诊。',
    }));
  }
  return out;
}

/** L3-TCM 中药饮片用法/配伍 */
function evaluateTcmUsage(ctx, mkFinding) {
  const { record } = ctx;
  const herbs = (record.fee_list?.items || []).filter(l => /中药|饮片|草药/.test(l.category || '') || /饮片|黄芪|甘草|人参|乌头|贝母/.test(l.item_name || ''));
  if (herbs.length < 2 && !record.case_meta?.tcm_incompat_flag) return [];
  const names = herbs.map(h => h.item_name).join('、');
  if (record.case_meta?.tcm_incompat_flag || TCM_INCOMPAT_RE.test(names)) {
    return [mkFinding(ctx, 'L3-TCM', {
      status: '疑点', risk_level: '中', amount_involved: herbs.reduce((s, h) => s + (h.amount || 0), 0),
      evidence: [
        ev('中药费用', '费用清单', names || record.case_meta.tcm_incompat_flag),
        ev('配伍规则', 'L3·tcm_usage_rule', '十八反/十九畏配伍禁忌'),
      ],
      reasoning: `中药饮片组合「${names || record.case_meta.tcm_incompat_flag}」涉嫌违反配伍禁忌——中药饮片配伍禁忌监管。`,
      disposal: '建议中医科复核处方配伍。',
    })];
  }
  for (const line of herbs) {
    const recs = lookupConstraints(line.item_name).filter(r => r.family === 'tcm_usage_rule');
    if (recs.length) {
      return [mkFinding(ctx, 'L3-TCM', {
        status: '线索', risk_level: '中', amount_involved: line.amount || 0,
        evidence: [ev('饮片', `第${line.line_no}行`, line.item_name), ev('用法规则', (recs[0].refs || [])[0], recs[0].basis?.slice(0, 80))],
        reasoning: `「${line.item_name}」命中中药饮片用法规则——${(recs[0].basis || '').slice(0, 80)}。`,
        disposal: '建议复核饮片用法与支付范围。',
      })];
    }
  }
  return [];
}

/** L3-DS 结算/明细数据异常 */
function evaluateDataSupervision(ctx, mkFinding) {
  const { record } = ctx;
  const out = [];
  const fp = record.front_page || {};
  if (!fp.principal_diagnosis?.icd10 && record.case_meta?.require_icd10 !== false) {
    out.push(mkFinding(ctx, 'L3-DS', {
      status: '线索', risk_level: '中', amount_involved: 0,
      evidence: [ev('结算清单', '病案首页', '主诊断 ICD-10 编码缺失')],
      reasoning: '医保结算清单主诊断 ICD-10 编码缺失——结算清单信息完整性异常。',
      disposal: '请补全诊断编码后重新上传。',
    }));
  }
  if (record.case_meta?.settlement_incomplete === true) {
    out.push(mkFinding(ctx, 'L3-DS', {
      status: '疑点', risk_level: '中', amount_involved: 0,
      evidence: [ev('结算清单', 'case_meta', '必填字段缺失（演示埋点）')],
      reasoning: '结算明细/清单必填字段缺失或格式错误——结算明细信息异常。',
      disposal: '请修正结算清单后重传。',
    }));
  }
  const admit = parseDateLoose(fp.admit_time);
  const discharge = parseDateLoose(fp.discharge_time);
  for (const line of record.fee_list?.items || []) {
    const fd = parseDateLoose(feeDayKey(line.fee_date));
    if (admit && fd && fd < admit) {
      out.push(mkFinding(ctx, 'L3-DS', {
        status: '疑点', risk_level: '中', amount_involved: line.amount || 0,
        evidence: [
          ev('费用行', `第${line.line_no}行`, `${line.item_name} 计费日 ${feeDayKey(line.fee_date)}`),
          ev('住院时段', '病案首页', `入院 ${fp.admit_time}`),
        ],
        reasoning: `费用计费日早于入院日——计费日期与住院时间不符。`,
        disposal: '建议核减入院前计费或修正日期。',
      }));
      return out;
    }
    if (discharge && fd && fd > discharge) {
      out.push(mkFinding(ctx, 'L3-DS', {
        status: '疑点', risk_level: '中', amount_involved: line.amount || 0,
        evidence: [
          ev('费用行', `第${line.line_no}行`, `${line.item_name} 计费日 ${feeDayKey(line.fee_date)}`),
          ev('住院时段', '病案首页', `出院 ${fp.discharge_time}`),
        ],
        reasoning: `费用计费日晚于出院日——计费日期与住院时间不符。`,
        disposal: '建议核减出院后计费。',
      }));
      return out;
    }
  }
  if (record.case_meta?.dept_mismatch === true) {
    out.push(mkFinding(ctx, 'L3-DS', {
      status: '线索', risk_level: '低', amount_involved: 0,
      evidence: [ev('科室', '费用/医嘱', '开立科室与执行科室不一致（演示）')],
      reasoning: '医疗服务项目限科室使用——开立/执行科室与项目限定不符。',
      disposal: '建议核对科室权限与项目限定。',
    }));
  }
  return out;
}

module.exports = {
  evaluateGenderFeeConflicts,
  evaluateChildFeeConflicts,
  evaluateUsageLimitViolations,
  evaluateSecondLine,
  evaluateFacilityLevel,
  evaluateInsuranceType,
  evaluateAntibioticIndication,
  evaluateDecomposeAdmission,
  evaluateGhostBed,
  evaluateDuplicateRx,
  evaluateCodingMismatch,
  evaluateSafetyRule,
  evaluateTcmUsage,
  evaluateDataSupervision,
};
