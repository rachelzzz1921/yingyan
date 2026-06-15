/* 鹰眼 · 稽核工作台 前端逻辑（原生JS，无框架） */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let RECORD = null, RULES = null, REPORT = null, FLAGGED_LINES = new Set();
let MODE = 'audit', INJECT = false, CURRENT_CASE = 'main';

const CASE_LABELS = {
  main: '肿瘤主线 · NSCLC', clean: '干净对照件', ortho: '骨科备演 · PKP', drg: 'DRG高套 · 重症肺炎',
  imaging: '医学影像 · CT增强', anes: '麻醉专科 · 全麻胆囊术', pharmacy: '门诊药店 · 串换/空刷',
  icu: '重症ICU · 呼吸机/CRRT', edge_egfr: '边界件 · 奥希替尼(应不报)', edge_gcsf: '边界件 · 升白针(应不报)',
  uploaded: '导入的材料',
};

function setWorkflowStep(n) {
  $$('.wf-step').forEach(el => {
    const s = Number(el.dataset.step);
    el.classList.toggle('active', s === n);
    el.classList.toggle('done', s < n);
  });
}

function renderCaseMeta() {
  const bar = $('#caseMetaBar');
  if (!bar || !RECORD) return;
  const m = RECORD.case_meta || {};
  const isClean = (m.embedded_violation_count ?? 0) === 0;
  const tagCls = isClean ? 'clean' : 'violation';
  const tagText = isClean ? '合规/干净件' : `预埋 ${m.embedded_violation_count} 处违规`;
  bar.innerHTML = `
    <div class="cmeta-left">
      <span class="cmeta-tag ${tagCls}">${tagText}</span>
      <strong>${esc(m.case_title || CASE_LABELS[CURRENT_CASE] || CURRENT_CASE)}</strong>
      <span class="muted">${esc(RECORD.front_page?.patient_name || '')} · ${esc(RECORD.front_page?.admit_dept || '')}</span>
    </div>
    <div class="cmeta-right muted">${esc(m.demo_note || m.embedded_note || '').slice(0, 120)}${(m.embedded_note || '').length > 120 ? '…' : ''}</div>`;
  bar.classList.remove('hidden');
}

// ---------- 文档标签配置 ----------
const TABS = [
  { key: 'front', label: '病案首页' },
  { key: 'admission', label: '入院记录' },
  { key: 'progress', label: '病程记录' },
  { key: 'orders', label: '医嘱单' },
  { key: 'nursing', label: '护理记录' },
  { key: 'lab', label: '检验报告' },
  { key: 'op', label: '手术记录' },
  { key: 'anes', label: '麻醉记录' },
  { key: 'icu', label: '重症记录' },
  { key: 'pharm', label: '药店/进销存' },
  { key: 'path', label: '病理/基因' },
  { key: 'fee', label: '费用清单' },
  { key: 'discharge', label: '出院小结' },
];
let activeTab = 'fee';

// ---------- 初始化 ----------
async function init() {
  try {
    const [health, rules, cases] = await Promise.all([
      fetch('/api/health').then(r => r.json()),
      fetch('/api/rules').then(r => r.json()),
      fetch('/api/cases').then(r => r.json()),
    ]);
    RULES = rules;
    $('#health').textContent = `规则 ${rules.rules.length} · 案卷 ${cases.length} · ${health.llm_ready ? 'LLM 就绪' : '确定性引擎'}`;
    $('#caseSelect').innerHTML = cases.map(c => {
      const lbl = CASE_LABELS[c.id] || c.id;
      const vio = c.violations === 0 ? '干净' : `${c.violations}违规`;
      return `<option value="${esc(c.id)}">${esc(lbl)} · ${vio}</option>`;
    }).join('');
    $('#caseSelect').onchange = (e) => loadCase(e.target.value);
    const qCase = new URLSearchParams(location.search).get('case');
    await loadCase(qCase && cases.some(c => c.id === qCase) ? qCase : 'main');
  } catch (e) {
    $('#docBody').innerHTML = `<div class="empty">加载失败：${esc(e.message)}<br><span class="muted">请确认已运行 node server.js</span></div>`;
  }
}
async function loadCase(id) {
  CURRENT_CASE = id;
  RECORD = await fetch('/api/case?id=' + encodeURIComponent(id)).then(r => r.json());
  INJECT = false; REPORT = null; FLAGGED_LINES = new Set();
  activeTab = 'fee';
  renderTabs(); renderDoc(activeTab);
  renderCaseMeta();
  setWorkflowStep(1);
  // 重置报告区
  $('#reportBody').classList.add('hidden'); $('#reportEmpty').classList.remove('hidden');
  $('#engineMode').textContent = '';
  const btn = $('#btnAudit'); if (btn) { btn.disabled = false; btn.textContent = '▶ 开始稽核'; }
}

function renderTabs() {
  $('#docTabs').innerHTML = TABS.map(t =>
    `<div class="doc-tab ${t.key === activeTab ? 'active' : ''}" data-tab="${t.key}">${t.label}${t.key === 'fee' && FLAGGED_LINES.size ? '<span class="dot"></span>' : ''}</div>`
  ).join('');
  $$('.doc-tab').forEach(el => el.onclick = () => { activeTab = el.dataset.tab; renderTabs(); renderDoc(activeTab); });
}

// ---------- 文档渲染 ----------
function renderDoc(key) {
  const r = RECORD, b = $('#docBody');
  if (key === 'front') {
    const f = r.front_page;
    b.innerHTML = sec('病案首页', `
      ${kv('患者姓名', f.patient_name)}${kv('性别 / 年龄', f.sex + ' / ' + f.age + '岁')}${kv('出生日期', f.birth_date)}
      ${kv('医保类型', f.insurance_type)}${kv('住院号', f.admission_no)}${kv('科室', f.admit_dept)}${kv('床号', f.bed_no)}
      ${kv('入院时间', f.admit_time)}${kv('出院时间', '<b style="color:var(--primary)">' + f.discharge_time + '</b>')}${kv('住院天数', f.actual_inpatient_days + '天')}`)
      + dh('诊断') + `<div class="kv"><span class="k">主要诊断</span><span class="v"><b>${esc(f.principal_diagnosis.name)}</b>　${esc(f.principal_diagnosis.tnm_stage)}（${esc(f.principal_diagnosis.note || '')}）</span></div>`
      + f.other_diagnosis.map(d => kv('其他诊断', d.name + '　' + (d.icd10 || ''))).join('')
      + dh('既往住院') + f.previous_admissions.map(p => `<div class="note-line"><b>${esc(p.admit_time?.slice(0,10))} ~ ${esc(p.discharge_time?.slice(0,10))}</b>　${esc(p.principal_diagnosis)}<br>${esc(p.summary)}</div>`).join('');
  }
  else if (key === 'admission') {
    const a = r.admission_note;
    b.innerHTML = dh('入院记录 · ' + a.record_time)
      + field('主诉', a.chief_complaint) + field('现病史', a.present_illness) + field('既往史', a.past_history)
      + field('查体', a.physical_exam) + field('初步诊断', a.preliminary_diagnosis.join('；')) + field('诊疗计划', a.treatment_plan);
  }
  else if (key === 'progress') {
    b.innerHTML = dh('病程记录（逐日）') + r.progress_notes.map(p =>
      `<div class="progress-entry"><span class="pdate">${esc(p.date)}</span><span class="ptype">${esc(p.type)} · ${esc(p.author)}</span><div class="prose">${esc(p.text)}</div></div>`).join('');
  }
  else if (key === 'orders') {
    b.innerHTML = dh('长期医嘱单') + ordTable(r.long_term_orders.items)
      + dh('临时医嘱单') + ordTable(r.temporary_orders.items);
  }
  else if (key === 'nursing') {
    const n = r.nursing_records;
    b.innerHTML = dh('护理记录单') + `<div class="note-line"><b>实际执行护理级别：</b>${esc(n.nursing_level_executed)}<br><span class="muted">${esc(n.note)}</span></div>`
      + n.entries.map(e => `<div class="progress-entry"><span class="pdate">${esc(e.date)}</span><span class="ptype">巡视间隔${e.round_interval_h}h · 测生命体征${e.vitals_count}次</span><div class="prose">${esc(e.text)}</div></div>`).join('');
  }
  else if (key === 'lab') {
    b.innerHTML = dh('检验报告') + r.lab_reports.map(L => `<div class="doc-section"><div class="kv"><span class="k">${esc(L.category)}</span><span class="v muted">${esc(L.report_id)} · ${esc(L.report_time)}</span></div>`
      + `<table class="fee-table"><tr><th>项目</th><th class="num">结果</th><th>参考</th><th>标志</th></tr>`
      + L.results.map(x => `<tr><td>${esc(x.item)}</td><td class="num"><b>${esc(x.value)}</b> ${esc(x.unit)}</td><td class="muted">${esc(x.ref)}</td><td>${flagCell(x.flag)}</td></tr>`).join('') + `</table></div>`).join('');
  }
  else if (key === 'op') {
    const op = r.operation_note;
    if ((!op || !op.operation_name) && r.imaging_record) {
      const ir = r.imaging_record;
      b.innerHTML = dh('影像检查记录') + (ir.studies || []).map(s => kv('检查', `<b>${esc(s.name)}</b>（${esc(s.modality || '')}）`) + field('所见/内涵', (s.report || '') + ' ' + (s.note || ''))).join('')
        + kv('实际胶片张数', `<b>${esc(ir.films_used)}</b> 张`) + `<div class="note-line muted">${esc(ir.note || '')}</div>`;
      return;
    }
    if (!op || !op.operation_name) { b.innerHTML = dh('手术/影像记录') + `<div class="note-line muted">本例无手术/影像记录。</div>`; return; }
    b.innerHTML = dh('手术记录 · ' + esc(op.operation_date))
      + kv('术式', `<b>${esc(op.operation_name)}</b>`) + kv('术者', op.surgeon || '') + kv('麻醉', op.anesthesia || '')
      + field('手术步骤', op.procedure_steps)
      + dh('术中耗材实际使用（稽核硬比对源）')
      + `<table class="fee-table"><tr><th>耗材</th><th class="num">实际用量</th><th>材质</th><th>备注</th></tr>`
      + (op.consumables_used || []).map(c => `<tr><td>${esc(c.name)}</td><td class="num"><b>${esc(c.qty)}</b>${esc(c.unit || '个')}</td><td>${esc(c.type || '')}${c.brand ? '·' + esc(c.brand) : ''}</td><td class="muted">${esc(c.note || '')}</td></tr>`).join('')
      + `</table>` + `<div class="note-line muted">${esc(op.note || '')}</div>`;
  }
  else if (key === 'anes') {
    const ar = r.anesthesia_record;
    if (!ar) { b.innerHTML = dh('麻醉记录') + `<div class="note-line muted">本例无麻醉记录。</div>`; return; }
    b.innerHTML = dh('麻醉记录单 · ' + esc(ar.anesthesiologist || ''))
      + kv('麻醉方式', `<b>${esc(ar.anesthesia_method || '')}</b>`)
      + kv('麻醉起止', `${esc(ar.anesthesia_start || '')} ~ ${esc(ar.anesthesia_end || '')}`)
      + kv('实际麻醉时长', `<b style="color:var(--red)">${esc(ar.actual_duration_min)}</b> 分钟　<span class="muted">（M-301 收费时长比对基准）</span>`)
      + kv('术中监测', (ar.monitoring || []).join('、'))
      + kv('气管插管', ar.intubation ? '是（全麻内涵已含，另收=重复 M-302）' : '否')
      + dh('麻醉药品实际用量（稽核硬比对源 · M-303）')
      + `<table class="fee-table"><tr><th>药品</th><th>规格</th><th class="num">实际用量</th></tr>`
      + (ar.drugs_used || []).map(d => `<tr><td>${esc(d.name)}</td><td>${esc(d.spec || '')}</td><td class="num"><b>${esc(d.actual_qty)}</b>${esc(d.unit || '支')}</td></tr>`).join('')
      + `</table>`
      + kv('麻醉恢复室(PACU)', ar.pacu_used === false ? `<b style="color:var(--red)">未进入</b>　<span class="muted">（M-304 恢复室监护费比对）</span>` : '已进入')
      + `<div class="note-line muted">${esc(ar.note || '')}</div>`;
  }
  else if (key === 'icu') {
    const ic = r.icu_record;
    if (!ic) { b.innerHTML = dh('重症记录') + `<div class="note-line muted">本例无重症监护(ICU)记录。</div>`; return; }
    const hourRow = (label, dev) => dev ? kv(label, `实际 <b style="color:var(--red)">${esc(dev.actual_hours)}</b> 小时${dev.start ? `　<span class="muted">${esc(dev.start)}~${esc(dev.end)}</span>` : ''}　<span class="muted">（ICU-302 计费时长比对基准）</span>`) : '';
    b.innerHTML = dh('重症监护记录单（ICU记录/设备使用记录）')
      + kv('ICU收治', ic.admission_to_icu ? `<b>是</b>　<span class="muted">${esc(ic.icu_admit || '')}~${esc(ic.icu_discharge || '')}</span>` : '否')
      + kv('护理级别', `<b>${esc(ic.nursing_level || '')}</b>　<span class="muted">（含吸痰/管路等一般专项护理，另收即 ICU-301 重复）</span>`)
      + dh('按小时计价设备/监护（稽核硬比对源 · ICU-302）')
      + hourRow('有创呼吸机辅助呼吸', ic.ventilator)
      + hourRow('连续性血液净化（CRRT）', ic.crrt)
      + kv('术中监测', (ic.monitoring || []).join('、'))
      + `<div class="note-line muted">${esc(ic.note || '')}</div>`;
  }
  else if (key === 'pharm') {
    const ph = r.pharmacy_info;
    if (!ph) { b.innerHTML = dh('药店/进销存') + `<div class="note-line muted">本例非门诊药店场景，无药店/进销存数据。</div>`; return; }
    const rows = (r.fee_list?.items || []).map(l => {
      const as = l.actual_sold;
      const mism = as && !(l.item_name.includes((as.name || '').slice(0, 2)));
      const invBad = l.inventory_supported === false;
      const traceBad = /断链|异常/.test(l.trace_code || '');
      const bad = mism || invBad || traceBad;
      const actual = invBad ? '<b style="color:var(--red)">（进销存无销售记录）</b>' : as ? `${esc(as.name)}<span class="muted">（${esc(as.category)}）</span>` : '—';
      return `<tr${bad ? ' style="background:#fff5f4"' : ''}><td>${l.line_no}</td><td>${esc(l.item_name)}　<span class="muted">¥${fmt(l.amount)}</span></td><td>${actual}</td><td>${traceBad ? '<b style="color:var(--red)">' + esc(l.trace_code) + '</b>' : esc(l.trace_code || '—')}</td></tr>`;
    }).join('');
    b.innerHTML = dh('药店医保定点信息')
      + kv('药店', `<b>${esc(ph.store_name)}</b>`) + kv('医保编码', ph.medical_insurance_code || '') + kv('统筹区', ph.pooling_region || '')
      + kv('追溯码要求', ph.trace_code_required_since || '')
      + dh('医保结算 vs 实际销售（进销存硬比对源）')
      + `<table class="fee-table"><thead><tr><th>行</th><th>医保结算名目</th><th>实际销售商品</th><th>追溯码</th></tr></thead><tbody>${rows}</tbody></table>`
      + `<div class="note-line muted">${esc(ph.note || '')}</div>`;
  }
  else if (key === 'path') {
    const p = r.pathology_report, g = r.gene_test_report;
    if (!p || p.diagnosis === '本例无病理（非肿瘤）' || /不适用|—/.test(p.report_id || '')) {
      b.innerHTML = dh('病理/基因') + `<div class="note-line muted">本例为${esc(r.front_page?.admit_dept || '非肿瘤')}病例，无病理/基因检测报告（相关肿瘤规则不适用）。</div>`; return;
    }
    b.innerHTML = dh('病理报告 · ' + p.report_time) + field('标本', p.specimen) + field('镜下', p.microscopic) + field('免疫组化', p.immunohistochemistry)
      + `<div class="kv"><span class="k">病理诊断</span><span class="v"><b style="color:var(--red)">${esc(p.diagnosis)}</b></span></div>` + `<div class="note-line muted">${esc(p.note)}</div>`
      + dh('基因检测报告') + `<div class="absent-note"><b>⚠ ${esc(g.status)}</b><br>${esc(g.note)}</div>`;
  }
  else if (key === 'fee') {
    b.innerHTML = feeTable(r);
  }
  else if (key === 'discharge') {
    const d = r.discharge_summary;
    b.innerHTML = dh('出院小结') + kv('住院', d.admit_date + ' ~ ' + d.discharge_date) + field('出院诊断', d.discharge_diagnosis.join('；')) + field('诊疗经过', d.hospital_course)
      + field('出院医嘱', d.discharge_orders.join('；')) + dh('出院带药') + d.discharge_meds.map(m => `<div class="note-line">${esc(m.name)}　<span class="muted">${esc(m.note || '')}</span></div>`).join('');
  }
}

function feeTable(r) {
  const items = r.fee_list.items;
  const rows = items.map(it => {
    const flagged = FLAGGED_LINES.has(it.line_no);
    return `<tr class="${flagged ? 'flagged' : ''}" id="fee-row-${it.line_no}">
      <td class="ln">${it.line_no}</td>
      <td>${esc(it.item_name)} <span class="muted">${esc(it.spec || '')}</span>${flagged ? `<span class="row-flag">⚠ ${esc(it.flag || '命中规则')}</span>` : ''}</td>
      <td class="muted">${esc(it.fee_date)}</td>
      <td class="num">${esc(it.qty)}${esc(it.unit)}</td>
      <td class="num">${esc(it.unit_price)}</td>
      <td class="num"><b>${esc(it.amount.toFixed(2))}</b></td>
      <td>${pill(it.insurance_class)}</td></tr>`;
  }).join('');
  return dh('费用结算明细（' + items.length + '行）')
    + `<table class="fee-table"><thead><tr><th>行</th><th>项目</th><th>日期</th><th class="num">数量</th><th class="num">单价</th><th class="num">金额</th><th>类别</th></tr></thead><tbody>${rows}</tbody></table>`
    + `<div class="fee-foot"><span>合计</span><span>¥ ${r.fee_list.total_amount.toFixed(2)}</span></div>`
    + `<div class="absent-note"><b>逐行核对提示（T-207）：</b>${esc(r.fee_list.absent_items_note)}</div>`;
}

function ordTable(items) {
  return `<table class="fee-table"><tr><th>编号</th><th>医嘱内容</th><th>起止</th></tr>` + items.map(o =>
    `<tr><td class="ln">${esc(o.order_id)}</td><td>${esc(o.content)}${o.key ? `<span class="row-flag" style="color:var(--amber)">※ ${esc(o.key)}</span>` : ''}</td><td class="muted">${esc(o.start ? o.start.slice(5, 16) : (o.time ? o.time.slice(5, 16) : ''))}${o.stop ? ' ~ ' + o.stop.slice(5, 10) : ''}</td></tr>`).join('') + `</table>`;
}

// 小工具
const kv = (k, v) => `<div class="kv"><span class="k">${esc(k)}</span><span class="v">${v}</span></div>`;
const sec = (h, body) => dh(h) + body;
const dh = (h) => `<div class="doc-h">📄 ${esc(h)}</div>`;
const field = (k, v) => `<div class="doc-section"><div class="three-label" style="color:var(--ink2)">${esc(k)}</div><div class="prose">${esc(v)}</div></div>`;
const pill = (c) => `<span class="pill ${/乙|甲/.test(c) ? 'yi' : ''}">${esc(c)}</span>`;
const flagCell = (f) => /升高|偏低|异常/.test(f) ? `<span style="color:var(--red)">${esc(f)}</span>` : `<span class="muted">${esc(f)}</span>`;

// ---------- 运行稽核 ----------
async function runAudit(opts = {}) {
  const btn = $('#btnAudit');
  const btnBar = $('#btnAuditBar');
  btn.disabled = true; btn.textContent = opts.llm ? 'LLM 分析中…' : '稽核中…';
  if (btnBar) { btnBar.disabled = true; btnBar.textContent = '稽核中…'; }
  setWorkflowStep(2);
  $('#reportEmpty').classList.add('hidden'); $('#reportBody').classList.add('hidden');
  // 扫描动画
  const rb = $('#reportBody'); rb.classList.remove('hidden');
  rb.innerHTML = scanningHTML();
  const logEl = $('#scanLog');
  const steps = ['加载材料包 · 多模态解析 {费用行, 医嘱项, 病程文本, 检验/病理报告}…',
    '跑 F 类 L1 确定性规则（时间/数量/互斥/频次）建立校验锚点…',
    '按三方验证轴跑 L2 语义规则（读病历自由文本）…',
    '费用↔医嘱/执行记录：有费无嘱、量超嘱、名称不符…',
    '费用↔诊断/病历：限定支付、范围外、靶点检测…',
    '命中疑点 → 强制取证（回查原文定位）→ 三要素门禁…',
    '误报防控：核对除外情形（贝伐无需靶点 / 放化疗周期白名单）…',
    '风险分级、生成结构化报告…'];
  for (let i = 0; i < steps.length; i++) {
    await sleep(150);
    const d = document.createElement('div'); d.style.animationDelay = '0s'; d.textContent = '› ' + steps[i]; logEl.appendChild(d);
  }
  // 调接口（带模式 + 注入开关）
  try {
    const q = opts.llm ? '?mode=llm' : (MODE === 'exam' ? '?mode=exam' : '');
    if (opts.llm) { const log = $('#scanLog'); if (log) { const d = document.createElement('div'); d.textContent = '› 🧠 真·LLM Agent 读病历自由文本推理中（稽核→CoVe→控辩裁，多次模型调用，较慢）…'; log.appendChild(d); } }
    const report = await fetch('/api/audit' + q, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ inject: INJECT, caseId: CURRENT_CASE }) }).then(r => r.json());
    INJECT = false;
    REPORT = report;
    FLAGGED_LINES = collectFlaggedLines(report);
    await sleep(250);
    renderReport(report);
    renderTabs();
    setWorkflowStep(3);
  } catch (e) {
    rb.innerHTML = `<div class="empty">稽核失败：${esc(e.message)}</div>`;
    setWorkflowStep(1);
  }
  btn.disabled = false; btn.textContent = '▶ 重新稽核';
  if (btnBar) { btnBar.disabled = false; btnBar.textContent = '▶ 开始稽核'; }
}

function collectFlaggedLines(report) {
  const set = new Set();
  for (const f of report.findings) for (const ev of f.evidence) {
    const m = (ev.loc || '').match(/第\s*([\d、]+)\s*行/);
    if (m) m[1].split('、').forEach(n => set.add(Number(n)));
  }
  return set;
}

let VIEW_EXAM = false; // iter20：当前是否体检（院端自查）视角——同一引擎，监管/院端两种措辞
function renderReport(report) {
  const m = report.report_meta, s = m.summary;
  const exam = m.panel === '体检'; VIEW_EXAM = exam;
  $('#engineMode').textContent = m.engine_mode || '';

  const cards = exam ? [
    { n: s.suspected_count, l: '风险点（待自查整改）', c: 'red', icon: 'doubt' },
    { n: s.clue_count, l: '线索（建议补全材料）', c: 'amber', icon: 'clue' },
    { n: '¥' + fmt(s.suspected_amount), l: '飞检暴露金额', c: 'money', icon: 'audit' },
    { n: RULES.rules.length, l: '已跑规则数', c: '', icon: 'rules' },
  ] : [
    { n: s.suspected_count, l: '疑点（证据闭环）', c: 'red', icon: 'doubt' },
    { n: s.clue_count, l: '线索（待复核）', c: 'amber', icon: 'clue' },
    { n: '¥' + fmt(s.suspected_amount), l: '疑点涉及金额', c: 'money', icon: 'audit' },
    { n: RULES.rules.length, l: '已跑规则数', c: '', icon: 'rules' },
  ];

  $('#reportBody').innerHTML = `
    ${reportHeroHTML(report, s, exam)}
    <div class="compare-banner">
      <div class="compare-col human"><span class="big">40<small>分钟</small></span><span>人工逐页审阅</span></div>
      <div class="vs">VS</div>
      <div class="compare-col agent"><span class="big">${(m.elapsed_ms != null && m.elapsed_ms < 1000) ? m.elapsed_ms + '<small>ms</small>' : '90<small>秒</small>'}</span><span>鹰眼 AI 初筛（实测 ${m.elapsed_ms ?? '—'}ms）</span></div>
    </div>
    <div class="mode-banner ${m.real_agent ? 'real' : (m.llm_needs_key ? 'warn' : 'det')}">${m.real_agent ? '🧠 真·LLM语义分析' : (m.llm_needs_key ? '⚠ 真·语义分析未启用' : '⚙ 确定性规则引擎')} · ${esc(m.engine_mode || '')}</div>
    ${exam ? `<div class="exam-banner">🏥 <b>体检模式（院端自查视角）</b>：同一套引擎、同一批命中，换院端口径——"疑点"即"飞检会暴露的风险点"，处置由"责令退回/移交"改为"<b>飞检前主动自查整改、主动退回</b>"。2026年起全国定点机构每年强制自查自纠，这就是医院医保办的"防飞检体检仪"。切回🛡稽核模式即监管对质口径。</div>` : ''}
    ${m.injected ? `<div class="exam-banner" style="background:var(--red-bg);color:var(--red);border-color:#f0c4c0">🪤 已注入对抗演示：材料中混入"写给AI的小抄"，看 E-503 如何把它当成证据。</div>` : ''}
    <div class="summary-cards">${cards.map(c => `<div class="scard ${c.c}"><img class="scard-icon" src="/brand/icons/${c.icon || 'rules'}.svg" alt="" width="28" height="28"><div class="scard-body"><div class="n">${c.n}</div><div class="l">${c.l}</div></div></div>`).join('')}</div>
    ${s.merged_count ? `<div class="recon-banner">🔗 <b>合议层</b>：合并前 ${s.raw_findings_before_merge} 条原始命中 → 去重后 <b>${s.total_findings} 条</b>（${s.merged_count} 条同笔费用多规则命中已合并）。疑点金额按费用行去重 <b>¥${fmt(s.suspected_amount)}</b>——若像传统做法各规则各算各的，会虚高到 <b style="color:var(--red)">¥${fmt(s.amount_if_double_counted)}</b>。<span class="muted">一笔钱一主疑点，杜绝"算三遍夸大"的对质把柄。</span></div>` : ''}
    ${s.shadow_count ? `<div class="shadow-banner">🌓 <b>规则状态机·观察期（shadow）</b>：${s.shadow_count} 条命中来自被复核高频驳回的规则（${esc((s.shadow_rules || []).join('、'))}）——已自动转入观察期，<b>暂不计入疑点/金额</b>（本可计 ¥${fmt(s.shadow_amount_withheld)}，已扣留待复审 re_review）。证据链仍完整展示但置灰沉底。<span class="muted">这是"误报回流"的执行端：坏规则被自动降权，而非继续误伤——闭环从"标记"走到"执行"。</span></div>` : ''}
    ${routingBar(m.routing)}
    <div class="findings-section"><h3 class="sect-title"><img src="/brand/icons/doubt.svg" alt="" width="18" height="18" style="vertical-align:-3px"> ${exam ? '风险点与线索（院端自查）' : '疑点与线索'} <span class="muted">${findingSummaryLine(s)}</span></h3><div id="findingsList">${report.findings.map(findingCard).join('')}</div></div>
    <div class="findings-section"><h3 class="sect-title green"><img src="/brand/icons/ok.svg" alt="" width="18" height="18" style="vertical-align:-3px"> 正确「不报」（误报防控 · 宁漏报不误报）</h3><div id="distractorList">${(report.correctly_not_flagged || []).map(distractorCard).join('')}</div></div>
    ${renderCoverage(m.coverage)}
  `;
  $$('.f-head').forEach(el => el.onclick = () => el.parentElement.classList.toggle('open'));
  $$('.ev-loc').forEach(el => el.onclick = () => jumpToLoc(el.dataset.loc));
  // 默认展开第一条
  const first = $('.finding'); if (first) first.classList.add('open');
}

function reportHeroHTML(report, s, exam) {
  const m = report.report_meta;
  const hasFindings = (s.suspected_count || 0) + (s.clue_count || 0) > 0;
  const level = hasFindings ? (s.suspected_count ? 'warn' : 'info') : 'pass';
  const title = hasFindings
    ? (exam ? `已定位 ${s.suspected_count} 条风险点 · 待复核 ${s.clue_count} 条线索` : `已定位 ${s.suspected_count} 条可回链疑点 · 待复核 ${s.clue_count} 条线索`)
    : '未检出疑点 — 合规放行';
  const sub = hasFindings
    ? `把线索到证据的距离，缩短到 ${m.elapsed_ms != null && m.elapsed_ms < 60000 ? Math.round(m.elapsed_ms / 1000) + ' 秒' : '90 秒'} · ${exam ? '飞检暴露' : '疑点涉及'} ¥${fmt(s.suspected_amount)}`
    : '本案卷通过 G0 误报防控校验';
  return `<section class="report-hero ${level}">
    <div class="rh-main"><span class="rh-badge">${exam ? '体检模式' : '稽核模式'}</span><h3 class="rh-title">${title}</h3><p class="rh-sub">${sub}</p></div>
    <div class="rh-meta"><span>${esc(m.engine_mode || '确定性引擎')}</span><span>${m.elapsed_ms != null ? m.elapsed_ms + 'ms' : '—'}</span></div>
  </section>`;
}

function routingBar(routing) {
  if (!routing) return '';
  const firedIds = new Set((REPORT.findings || []).flatMap(f => [f.rule_id, ...(f.corroborations || []).map(c => c.rule_id)]));
  const chips = (routing.activated || []).map(id => `<span class="rchip ${firedIds.has(id) ? 'hit' : ''}">${esc(id)}</span>`).join('');
  const sc = routing.short_circuit;
  return `<div class="routing-bar">🔀 <b>触发器路由（三级短路）</b>：全 ${routing.total} 条，本案只<b>激活 ${routing.activated_count} 条</b>，${sc ? sc.saved + ' 零成本跳过' : '其余跳过'}（90秒承诺的工程基础）
    <div class="routing-chips">${chips}</div>
    ${sc ? `<span class="muted">L1确定性 ${sc.level1_L1_deterministic} · L2语义候选 ${sc.level3_L2_llm_candidates}（朴素实现需全 ${routing.total} 条调LLM）· 红=已命中</span>` : '<span class="muted">红=已出疑点/线索</span>'}</div>`;
}
function renderCoverage(cov) {
  if (!cov) return '';
  const mats = Object.entries(cov.materials).map(([k, v]) => `<span class="mat ${v ? 'ok' : 'miss'}">${v ? '✓' : '✗'} ${esc(k)}</span>`).join('');
  const dims = cov.dimensions.map(d => `<tr><td>${esc(d.dimension)}</td><td class="num">${d.executed.length}/${d.total_rules}</td><td>${d.fired.length ? '<span style="color:var(--red)">' + d.fired.join('、') + '</span>' : '<span class="muted">—</span>'}</td><td><span class="cov-status ${d.executed.length ? (d.fired.length ? 'found' : 'clean') : 'na'}">${esc(d.status)}</span></td></tr>`).join('');
  return `<div class="findings-section"><h3 class="sect-title">📋 覆盖度声明（查了什么·没查什么·为什么）</h3>
    <div class="cov-statement">${esc(cov.statement)}</div>
    <div class="cov-mats">材料完整性：${mats}</div>
    <table class="fee-table" style="margin-top:8px"><thead><tr><th>应查维度</th><th class="num">激活/规则数</th><th>命中规则</th><th>状态</th></tr></thead><tbody>${dims}</tbody></table></div>`;
}
function confBadge(f) {
  if (f.confidence == null) return '';
  const cls = f.confidence >= 85 ? 'hi' : f.confidence >= 65 ? 'mid' : '';
  return `<span class="conf ${cls}" title="置信度=f(三要素完整度·控辩裁·OCR置信·CoVe)"><span class="conf-bar"><i style="width:${f.confidence}%"></i></span>置信${f.confidence}</span>${f._low_ocr ? '<span class="lowocr">⚠OCR低置信</span>' : ''}`;
}
function renderCoVe(cove) {
  if (!cove || !cove.items || !cove.items.length) return '';
  const realAgent = REPORT?.report_meta?.real_agent;
  const allPass = cove.all_pass != null ? cove.all_pass : cove.items.every(i => i.pass);
  const qs = cove.items.map(i => `<div class="cove-q"><span class="qm">Q：${esc(i.q)}</span><span class="pf ${i.pass ? 'ok' : 'no'}">${i.pass ? '✓核实' : '✗未闭环'}</span><br><span class="am">A：${esc(i.a)}</span></div>`).join('');
  return `<div class="cove"><div class="cove-h">🔁 CoVe 取证自检（定稿前逐题独立回查）<span class="kind-tag ${realAgent ? 'real' : 'script'}">${realAgent ? '真·LLM' : '脚本演示'}</span><span class="muted"> ${allPass ? '全部核实通过' : '存在未闭环项→影响定级'}${cove.verdict_reason ? '·' + esc(cove.verdict_reason) : ''}</span></div>${qs}</div>`;
}
function renderActions(f) {
  return `<div class="actions" data-fid="${esc(f.finding_id || '')}" data-rule="${esc(f.rule_id || '')}">
    <button class="act adopt" onclick="reviewAction(this,'采纳')">✓ 采纳</button>
    <button class="act reject" onclick="reviewAction(this,'驳回')">✗ 驳回(误报回流)</button>
    <button class="act more" onclick="reviewAction(this,'补材料')">⊕ 存疑补材料</button>
    <span class="act-tip muted"></span>
  </div>`;
}
window.reviewAction = async (btn, kind) => {
  const box = btn.parentElement;
  let reason = '';
  if (kind === '驳回') { reason = (prompt('驳回原因（必填，将回流用于规则复审；某规则被驳回≥3次自动标"高误报待复审"）：') || '').trim(); if (!reason) return; }
  box.querySelectorAll('.act').forEach(b => b.classList.remove('chosen'));
  btn.classList.add('chosen');
  box.dataset.choice = kind;
  const tip = box.querySelector('.act-tip'); if (tip) tip.textContent = '记录中…';
  try {
    const r = await fetch('/api/review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ finding_id: box.dataset.fid, rule_id: box.dataset.rule, case_id: CURRENT_CASE, action: kind, reason }) }).then(x => x.json());
    if (tip) { const rej = r.stats?.by_rule?.[box.dataset.rule]?.rejected || 0; tip.textContent = `已持久化(${kind})${kind === '驳回' ? ` · 该规则累计驳回${rej}次${rej >= (r.stats?.threshold || 3) ? '→已标高误报待复审' : ''}` : ''}`; }
  } catch (e) { if (tip) tip.textContent = '记录失败:' + e.message; }
};

function renderReconciliation(f) {
  if (!f.corroborations || !f.corroborations.length) return '';
  const corro = f.corroborations.map(c => `<div class="corro-item"><span class="corro-rid">${esc(c.rule_id)} ${esc(c.rule_name)}</span><span class="muted"> · ${esc(c.violation_type)}</span><div class="corro-reason">${esc(c.reasoning)}</div></div>`).join('');
  return `<div class="recon">
    <div class="recon-head">🔗 合议层：本笔 ¥${fmt(f.amount_involved)} 被 <b>${f._merged_count}</b> 条规则命中 → 合并为 <b>1 主疑点 + ${f.corroborations.length} 佐证视角</b>，金额只算一次（<b>非 ¥${fmt(f._raw_amount_sum)}</b>）</div>
    <div class="recon-sub">主疑点：${esc(f.rule_id)}（定性最准）。以下为同一笔钱的其它定性角度（不重复计金额、不重复计数）——多视角=更强对质材料：</div>
    ${corro}
  </div>`;
}
// iter20：处置语气从「监管对质口径」转「院端自查口径」（引擎/疑点不变，只换措辞）
function examDisposal(t) {
  return String(t || '')
    .replace(/建议作为伪造变造线索移交[；;]?/g, '建议院端重点自查该材料真实性、留存说明材料；')
    .replace(/移交(欺诈骗保|伪造变造)?线索/g, '院端重点自查并留存说明')
    .replace(/建议责令退回/g, '建议飞检前主动退回')
    .replace(/责令退回/g, '主动退回')
    .replace(/移交/g, '院端自查（必要时主动说明）')
    .replace(/责令/g, '主动');
}
function findingSummaryLine(s) {
  return `已定位 ${s.suspected_count || 0} 条可回链疑点，待复核 ${s.clue_count || 0} 条线索 · 按金额×置信排序`;
}

function evidenceChainFooter(f) {
  const m = REPORT?.report_meta;
  const ts = m?.generated ? new Date(m.generated).toLocaleString('zh-CN') : '引擎输出';
  return `<div class="ec-footer"><img src="/brand/icons/evidence.svg" alt="" width="14" height="14"><span>案卷 ${esc(CURRENT_CASE || '—')}</span><span>·</span><span>规则 ${esc(f.rule_id)}</span><span>·</span><span>${esc(ts)}</span><span>·</span><span>引擎 ${esc(m?.engine_mode || 'deterministic')}</span></div>`;
}

function findingCard(f) {
  const evHtml = f.evidence.map(e => `<div class="ev"><span class="ev-type">${esc(e.type)}</span><span class="ev-loc" data-loc="${esc(e.loc)}">${esc(e.loc)}</span><span class="ev-text">${esc(e.text)}${e.anchor ? ` <span class="anchor-chip" title="事实层锚点">⚓${esc(e.anchor.doc)} OCR${e.anchor.ocr_conf}</span>` : ''}</span></div>`).join('');
  const polHtml = (f.policy || []).map(p => `<div class="policy"><span class="pref">${esc(p.ref)}</span><span class="vchip ${(/已核/.test(p.verify_status || '')) ? 'ok' : 'warn'}">${esc(p.verify_status || '')}</span><div>${esc(p.text)}</div></div>`).join('');
  const needs = (f.needs_more && f.needs_more.length) ? `<div class="needs"><b>需调阅材料清单：</b><ul>${f.needs_more.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>` : '';
  return `<div class="finding ${esc(f.status)}${f.shadow ? ' shadow' : ''}">
    <div class="f-head">
      <span class="status-badge ${esc(f.status)}">${esc(f.status)}</span>
      ${f.shadow ? '<span class="shadow-badge" title="规则因高频驳回转入观察期，暂不计分">🌓 观察期·不计分</span>' : ''}
      <span class="f-title"><span class="rid">${esc(f.rule_id)}</span>${esc(f.rule_name)}${f.corroborations && f.corroborations.length ? `<span class="merge-chip" title="合议层合并">🔗合议 ${f._merged_count}→1</span>` : ''}</span>
      <span class="f-meta">${confBadge(f)}<span class="risk ${esc(f.risk_level)}">${esc(f.risk_level)}</span><span class="amount">${f.shadow ? '<s>¥' + fmt(f.amount_involved) + '</s>' : '¥' + fmt(f.amount_involved)}</span><span class="chev">▶</span></span>
    </div>
    <div class="f-body">
      ${f.shadow ? `<div class="shadow-note">🌓 ${esc(f.shadow_reason)}</div>` : ''}
      <div class="evidence-chain">
        <div class="ec-grid">
          <div class="ec-col"><div class="three-label"><span class="idx">1</span>原始证据定位</div>${evHtml || '<p class="muted">—</p>'}</div>
          <div class="ec-col"><div class="three-label"><span class="idx">2</span>违反的政策条款（引用原文）</div>${polHtml || '<p class="muted">—</p>'}</div>
          <div class="ec-col"><div class="three-label"><span class="idx">3</span>完整推理过程</div><div class="reason">${esc(f.reasoning)}</div></div>
        </div>
        ${evidenceChainFooter(f)}
      </div>
        ${needs}
        ${f.disposal_suggestion ? `<div class="disposal"><b>${VIEW_EXAM ? '自查整改建议：' : '处置建议：'}</b>${esc(VIEW_EXAM ? examDisposal(f.disposal_suggestion) : f.disposal_suggestion)}</div>` : ''}
        ${renderReconciliation(f)}
        ${renderCoVe(f.cove)}
        ${renderDebate(f.debate)}
        ${renderActions(f)}
        <div class="muted" style="margin-top:8px">违规类型（官方术语）：${esc(f.violation_type)} · 规则层级：${esc(f.layer || f.layer_label || '')} · 优先分(金额×置信)：${f.priority_score ?? '—'}</div>
    </div></div>`;
}

const ROLE_META = {
  '控方': { icon: '⚖️', cls: 'r-pro', tag: '控方·稽核' },
  '辩方': { icon: '🛡', cls: 'r-def', tag: '辩方·申诉' },
  '裁判': { icon: '⚑', cls: 'r-judge', tag: '裁判·裁定' },
};
function renderDebate(d) {
  if (!d) return '';
  if (!d.enabled) return `<div class="debate-skip">🗣 控辩裁：<b>不启动辩论</b> — ${esc(d.skip_reason)}</div>`;
  const downgrade = /降级/.test(d.verdict);
  const exch = d.exchanges.map(e => {
    const meta = ROLE_META[e.role] || { icon: '·', cls: '', tag: e.role };
    return `<div class="exch ${meta.cls}"><div class="exch-role">${meta.icon} ${esc(meta.tag)}<span class="stance">${esc(e.stance)}</span></div><div class="exch-text">${esc(e.text)}</div></div>`;
  }).join('');
  const realAgent = REPORT?.report_meta?.real_agent;
  return `<div class="debate">
    <div class="debate-head">🗣 控辩裁三方对质 <span class="kind-tag ${realAgent ? 'real' : 'script'}">${realAgent ? '真·LLM多Agent' : '脚本演示·真版切LLM'}</span> <span class="muted">（${d.rounds}轮封顶 · 申诉Agent=误报过滤器）</span>
      <span class="verdict ${downgrade ? 'down' : 'keep'}">裁定：${esc(d.verdict)}</span></div>
    <div class="exch-list">${exch}</div>
    <div class="verdict-reason ${downgrade ? 'down' : ''}">▸ ${esc(d.verdict_reason)}</div>
    <div class="muted" style="padding:6px 12px;font-size:11px">裁判防偏见：控辩材料位置交换二次裁决，不一致判平→降级线索；裁判与辩手用不同模型（防自我偏好）。</div>
  </div>`;
}

function distractorCard(d) {
  return `<div class="distractor"><div class="d-top">✓ 正确不报<span class="d-rule">未误报 ${esc(d.tempting_rule)}</span></div>
    <div class="d-item">${esc(d.item)}</div><div class="d-why">${esc(d.why_not_flagged)}</div>${d.demo_value ? `<div class="d-why" style="margin-top:6px;color:var(--green)">${esc(d.demo_value)}</div>` : ''}</div>`;
}

function jumpToLoc(loc) {
  let tab = 'fee';
  if (/费用清单/.test(loc)) tab = 'fee'; else if (/病程/.test(loc)) tab = 'progress';
  else if (/病案首页/.test(loc)) tab = 'front'; else if (/病理|基因/.test(loc)) tab = 'path';
  else if (/检验/.test(loc)) tab = 'lab'; else if (/医嘱/.test(loc)) tab = 'orders';
  else if (/护理/.test(loc)) tab = 'nursing'; else if (/出院/.test(loc)) tab = 'discharge';
  else if (/手术|影像/.test(loc)) tab = 'op';
  activeTab = tab; renderTabs(); renderDoc(tab);
  const m = loc.match(/第\s*([\d]+)/);
  setTimeout(() => {
    const row = m && $('#fee-row-' + m[1]);
    if (row) { row.scrollIntoView({ block: 'center', behavior: 'smooth' }); row.style.transition = 'background .3s'; const o = row.style.background; row.style.background = '#ffe9a8'; setTimeout(() => row.style.background = o, 900); }
    else { $('.doc-body').scrollTop = 0; }
  }, 60);
}

// 工具
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('zh-CN', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) : n);
function scanningHTML() {
  return `<div class="scanning"><div style="font-size:15px;font-weight:700;color:var(--primary);display:flex;align-items:center;gap:8px"><img src="/brand/icons/scan.svg" alt="" width="22" height="22"> 文档索引中 · 条款交叉验证…</div>
    <div class="scan-bar"><i></i></div><div class="scan-log" id="scanLog"></div></div>`;
}

$('#btnAudit').onclick = () => runAudit();
const btnAuditBar = $('#btnAuditBar');
if (btnAuditBar) btnAuditBar.onclick = () => runAudit();
$('#btnReset').onclick = () => location.reload();
// 双模式
$$('.mode-btn').forEach(b => b.onclick = () => { MODE = b.dataset.mode; $$('.mode-btn').forEach(x => x.classList.toggle('active', x === b)); });
// v2 工具
$('#btnInject').onclick = () => { INJECT = true; runAudit(); };
$('#btnLLM').onclick = () => runAudit({ llm: true });
$('#btnIngest').onclick = showIngest;
$('#btnFacts').onclick = showFacts;
$('#btnBench').onclick = showBench;
$('#btnInstitution').onclick = showInstitution;
$('#btnGovernance').onclick = showGovernance;
$('#btnExport').onclick = () => { window.open('/api/export/checklist' + (MODE === 'exam' ? '?mode=exam' : ''), '_blank'); };
$('#btnPitch').onclick = showPitch;
$('#modalRoot').onclick = (e) => { if (e.target.id === 'modalRoot') closeModal(); };

// ---------- 模态 ----------
function openModal(title, html) {
  $('#modalBox').innerHTML = `<div class="modal-head"><h3>${esc(title)}</h3><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body">${html}</div>`;
  $('#modalRoot').classList.remove('hidden');
}
window.closeModal = () => $('#modalRoot').classList.add('hidden');

async function showIngest() {
  const conn = await fetch('/api/connectors').then(r => r.json());
  const connRows = conn.connectors.map(c => `<div class="conn-row"><span class="conn-name">${esc(c.name)}</span><span class="conn-status ${c.status.ready ? 'ok' : 'na'}">${c.status.ready ? '可用' : '待配置'}</span><button class="v2btn" onclick="ingestConnector('${esc(c.id)}')" ${c.status.ready ? '' : 'disabled'}>拉取</button><div class="muted" style="flex-basis:100%;font-size:11px">${esc(c.status.note)}</div></div>`).join('');
  openModal('📥 导入患者材料（输入端）', `
    <p class="muted">材料怎么进来：①扫描件/PDF/照片走多模态解析 ②直接粘结构化JSON ③从医院HIS/EMR拉取。三条入口统一产出 medical_record，再交事实层+引擎稽核。<b>数据不出域</b>：解析与稽核均本地，患者数据不外发。</p>
    <div class="ingest-sec"><div class="facts-h">① 扫描件 / 照片 / PDF（多模态解析）${conn.vision_ready ? '<span class="conn-status ok">视觉模型就绪</span>' : '<span class="conn-status na">未配视觉模型</span>'}</div>
      <input type="file" id="ingestFile" accept="image/*,application/pdf" class="case-select" style="max-width:none;width:100%">
      <div class="muted" style="font-size:11px;margin-top:4px">配 ANTHROPIC_API_KEY 即用 Claude 视觉真解析；未配则给出接 PP-StructureV3/RAGFlow DeepDoc 的契约。解析结果带每字段源锚点(page/bbox/ocr_conf)，喂事实层。</div>
      <div id="ingestFileResult" class="ingest-result"></div></div>
    <div class="ingest-sec"><div class="facts-h">② 粘贴结构化 JSON（medical_record）</div>
      <textarea id="ingestJson" class="ingest-ta" placeholder='{"case_meta":{...},"front_page":{...},"fee_list":{"items":[...]}}'></textarea>
      <button class="v2btn" onclick="ingestJson()">导入并稽核</button>
      <div id="ingestJsonResult" class="ingest-result"></div></div>
    <div class="ingest-sec"><div class="facts-h">③ 从医院系统拉取（HIS / EMR / FHIR · 接口已留好）</div>
      <input id="ingestEnc" class="case-select" style="max-width:none;width:240px" placeholder="就诊号/住院号(可空,mock用样例)">
      ${connRows}
      <div id="ingestConnResult" class="ingest-result"></div></div>`);
  setTimeout(() => { const f = document.getElementById('ingestFile'); if (f) f.onchange = ingestFile; }, 50);
}
async function ingestFile(e) {
  const file = e.target.files[0]; if (!file) return;
  const out = document.getElementById('ingestFileResult'); out.innerHTML = '<span class="muted">解析中…</span>';
  const b64 = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.readAsDataURL(file); });
  const r = await fetch('/api/ingest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'document', fileBase64: b64, mime: file.type }) }).then(x => x.json());
  ingestDone(r, out);
}
window.ingestJson = async () => {
  const out = document.getElementById('ingestJsonResult'); out.innerHTML = '<span class="muted">校验中…</span>';
  const r = await fetch('/api/ingest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'structured', json: document.getElementById('ingestJson').value }) }).then(x => x.json());
  ingestDone(r, out);
};
window.ingestConnector = async (id) => {
  const out = document.getElementById('ingestConnResult'); out.innerHTML = '<span class="muted">拉取中…</span>';
  const r = await fetch('/api/ingest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'connector', connectorId: id, encounterId: document.getElementById('ingestEnc').value }) }).then(x => x.json());
  ingestDone(r, out);
};
function ingestDone(r, out) {
  if (!r.ok) {
    out.innerHTML = `<div class="ingest-err">✗ ${esc(r.error)}</div>` + (r.contract ? `<pre class="ingest-contract">${esc(JSON.stringify(r.contract, null, 2))}</pre>` : '') + (r.details ? `<div class="muted">${esc((r.details || []).join('；'))}</div>` : '');
    return;
  }
  out.innerHTML = `<div class="ingest-ok">✓ 已摄取（${esc(r.source)}）：${esc(r.record.front_page?.patient_name || '')} · ${esc(r.record.front_page?.principal_diagnosis?.name || '')}。${(r.parse_log || []).map(esc).join('；')}</div>`;
  // 注册到案卷选择器并加载+稽核
  if (![...$('#caseSelect').options].some(o => o.value === 'uploaded')) {
    const opt = document.createElement('option'); opt.value = 'uploaded'; opt.textContent = '📥 导入的材料'; $('#caseSelect').appendChild(opt);
  }
  $('#caseSelect').value = 'uploaded';
  setTimeout(async () => { closeModal(); await loadCase('uploaded'); runAudit(); }, 900);
}

async function showFacts() {
  const c = await fetch('/api/caseobject').then(r => r.json());
  const feeRows = c.fee_lines.map(f => `<tr><td class="ln">${f.id}</td><td>${esc(f.name)}</td><td class="num">${f.amount.toFixed(2)}</td><td><span class="anchor-chip">${esc(f.anchor.doc)}·${esc(f.anchor.locator)}</span></td><td><span class="ocr-chip ${f.anchor.ocr_conf < 0.8 ? 'lo' : 'hi'}">OCR ${f.anchor.ocr_conf}${f.anchor.ocr_conf < 0.8 ? ' ⚠人工核对' : ''}</span></td></tr>`).join('');
  const inj = (c.flags.injection_suspects || []).length;
  const html = `
    <p class="muted">事实层把材料包一次性编译为类型化"稽核案卷对象"，<b>每条事实自带源锚点(文档/定位/OCR置信度)</b>——证据定位从"LLM临场摘录"变为"事实自身携带出处"，三要素门禁的"证据定位"成为数据结构的硬字段。规则在对象上跑，不重读全文（token降一个量级、判定可复现）。</p>
    <div class="bench-kpis">
      <div class="bkpi"><div class="n">${c.summary.fee_lines}</div><div class="l">费用行事实</div></div>
      <div class="bkpi"><div class="n">${c.summary.orders}</div><div class="l">医嘱事实</div></div>
      <div class="bkpi"><div class="n">${c.summary.labs}</div><div class="l">检验值事实</div></div>
      <div class="bkpi ${c.summary.low_ocr_spans ? 'red' : ''}"><div class="n">${c.summary.low_ocr_spans}</div><div class="l">低OCR置信span</div></div>
    </div>
    ${inj ? `<div class="exam-banner" style="background:var(--red-bg);color:var(--red);border-color:#f0c4c0">⚠ flags.injection_suspects：检出 ${inj} 处对抗注入文本，已隔离</div>` : ''}
    <div class="facts-h">费用行事实表（fee_lines · 含锚点与OCR置信度）</div>
    <table class="fee-table"><thead><tr><th>事实ID</th><th>名称</th><th class="num">金额</th><th>源锚点</th><th>OCR</th></tr></thead><tbody>${feeRows}</tbody></table>
    <div class="facts-h">flags（对抗清洗与低置信标记）</div>
    <div class="note-line">low_ocr_spans: ${esc(JSON.stringify(c.flags.low_ocr_spans))}<br>injection_suspects: ${esc(JSON.stringify(c.flags.injection_suspects))}</div>`;
  openModal('🧬 事实层 · 稽核案卷对象（Case Object）', html);
}

async function showBench() {
  const [b, rev, yhf] = await Promise.all([
    fetch('/api/bench').then(r => r.json()),
    fetch('/api/review').then(r => r.json()).catch(() => ({ stats: {} })),
    fetch('/api/yhf').then(r => r.json()).catch(() => null),
  ]);
  const rows = b.cases.map(c => `<tr><td>${c.is_clean ? '🟢干净件' : '🔴违规件'}</td><td>${esc(c.title || c.id)}</td><td class="num">${c.found_suspected}</td><td class="num">${c.found_clue}</td><td class="num">${c.false_positives != null ? c.false_positives : '—'}</td><td class="num">${c.latency_ms}ms</td><td class="num">${c.routing}</td></tr>`).join('');
  const yhfBlock = yhf && yhf.engine ? `
    <div class="yhf-gate">
      <h4><span class="gate-badge">YHF</span> 变更门禁 · Oracle 模式（零治理叠加）</h4>
      <div class="yhf-row"><span>G0 干净件零误报</span><b>${yhf.engine.gates.G0_clean_zero_fp ? '✅ PASS' : '❌ FAIL'}</b></div>
      <div class="yhf-row"><span>案卷 / 干净件误报</span><b>${yhf.engine.meta.total_cases} / ${yhf.engine.meta.clean_false_positive_total}</b></div>
      <div class="yhf-row"><span>规则缺 6 用例</span><b>${yhf.rule?.missing_test_cases ?? '—'} 条</b></div>
      <div class="yhf-row"><span>整体门禁</span><b>${yhf.overall_pass ? '✅ PASS' : '❌ FAIL'}</b></div>
      <p class="muted" style="margin-top:8px">CLI: <code>bash yhf/run.sh --strict</code> · shadow 公理：bench=Oracle，live 才读 rule_states</p>
    </div>` : '';
  const html = `
    <p class="muted">AuditBench + YHF：任何 prompt/规则/模型变更都跑回归。<b>干净件误报=0 是红线</b>。</p>
    <div style="text-align:center;margin:10px 0"><span class="redline ${b.meta.red_line_clean_zero_fp ? 'pass' : 'fail'}">红线：干净件零误报 ${b.meta.red_line_clean_zero_fp ? '✓ PASS' : '✗ FAIL'}</span></div>
    ${yhfBlock}
    <div class="bench-kpis">
      <div class="bkpi"><div class="n">${b.meta.total_cases}</div><div class="l">基准案卷数</div></div>
      <div class="bkpi green"><div class="n">${b.meta.clean_false_positive_total}</div><div class="l">干净件误报合计</div></div>
      <div class="bkpi"><div class="n">${b.meta.avg_latency_ms}<small>ms</small></div><div class="l">平均时延</div></div>
      <div class="bkpi"><div class="n">${b.meta.clean_cases}</div><div class="l">干净件数</div></div>
    </div>
    <table class="fee-table"><thead><tr><th>类型</th><th>案卷</th><th class="num">疑点</th><th class="num">线索</th><th class="num">误报</th><th class="num">时延</th><th class="num">路由</th></tr></thead><tbody>${rows}</tbody></table>
    ${renderReviewFlow(rev.stats)}
    <p class="muted" style="margin-top:10px">注：产品态≥20份标注案卷。指标盘随引擎实测刷新。</p>`;
  openModal('📊 AuditBench · YHF 评测基准', html);
}

async function showInstitution() {
  const d = await fetch('/api/institution').then(r => r.json());
  const s = d.summary;
  const maxRuleAmt = Math.max(1, ...d.top_rules.map(r => r.amount));
  const ruleBars = d.top_rules.slice(0, 8).map(r => `<div class="ins-bar-row"><span class="ins-bar-label">${esc(r.rule_id)} ${esc(r.rule_name)}</span><span class="ins-bar-track"><span class="ins-bar-fill" style="width:${Math.round(r.amount / maxRuleAmt * 100)}%"></span></span><span class="ins-bar-val">¥${fmt(r.amount)}<span class="muted"> ·${r.cases}案</span></span></div>`).join('');
  const maxDomAmt = Math.max(1, ...d.by_domain.map(x => x.amount));
  const domBars = d.by_domain.map(x => `<div class="ins-bar-row"><span class="ins-bar-label">${esc(x.domain)}</span><span class="ins-bar-track"><span class="ins-bar-fill dom" style="width:${Math.round(x.amount / maxDomAmt * 100)}%"></span></span><span class="ins-bar-val">¥${fmt(x.amount)}<span class="muted"> ·疑点${x.suspected}</span></span></div>`).join('');
  const deptRows = d.by_dept.map(x => `<tr><td>${esc(x.dept)}</td><td class="num">${x.cases}</td><td class="num">${x.suspected}</td><td class="num">${x.clue}</td><td class="num">¥${fmt(x.amount)}</td></tr>`).join('');
  const typeRows = d.violation_types.slice(0, 8).map(t => `<tr><td>${esc(t.type)}</td><td class="num">${t.count}</td><td class="num">¥${fmt(t.amount)}</td></tr>`).join('');
  const caseRows = d.case_rows.map(c => `<tr class="${c.is_clean ? 'ins-clean' : ''}"><td>${c.is_clean ? '🟢' : '🔴'} ${esc((c.label || c.id).slice(0, 26))}</td><td>${esc(c.dept)}</td><td>${esc(c.domain)}</td><td class="num">${c.suspected}</td><td class="num">${c.clue}</td><td class="num">¥${fmt(c.amount)}</td></tr>`).join('');
  const html = `
    <p class="muted">${esc(d.generated)}。把单件 AI 初筛<b>升维到机构画像</b>——飞检前先给被检机构做一次"院端体检"，定位高风险规则/科室、指导抽样。<button class="v2btn" style="margin-left:8px;padding:3px 10px;font-size:12px" onclick="window.open('/api/export/institution','_blank')">📄 导出院端体检报告</button></p>
    <div class="bench-kpis">
      <div class="bkpi"><div class="n">${s.audited_cases}</div><div class="l">受检案卷</div></div>
      <div class="bkpi red"><div class="n">${s.suspected_total}</div><div class="l">疑点合计</div></div>
      <div class="bkpi"><div class="n">¥${fmt(s.amount_total)}</div><div class="l">疑点涉及金额</div></div>
      <div class="bkpi green"><div class="n">${esc(s.clean_pass)}</div><div class="l">干净件零误报</div></div>
      <div class="bkpi"><div class="n">${s.domains_covered}</div><div class="l">覆盖专科领域</div></div>
    </div>
    <div class="facts-h">📊 高频违规规则 TOP（按涉及金额）</div>
    <div class="ins-bars">${ruleBars}</div>
    <div class="facts-h">🏥 专科领域分布（覆盖广度 · 现 ${s.domains_covered} 个可fire领域）</div>
    <div class="ins-bars">${domBars}</div>
    <div class="ins-2col">
      <div><div class="facts-h">科室分布</div><table class="fee-table"><thead><tr><th>科室</th><th class="num">案</th><th class="num">疑点</th><th class="num">线索</th><th class="num">金额</th></tr></thead><tbody>${deptRows}</tbody></table></div>
      <div><div class="facts-h">违规类型分布</div><table class="fee-table"><thead><tr><th>类型</th><th class="num">次</th><th class="num">金额</th></tr></thead><tbody>${typeRows}</tbody></table></div>
    </div>
    <div class="facts-h">受检案卷清单（点"红"为违规件、"绿"为合规件正确放行）</div>
    <table class="fee-table"><thead><tr><th>案卷</th><th>科室</th><th>领域</th><th class="num">疑点</th><th class="num">线索</th><th class="num">金额</th></tr></thead><tbody>${caseRows}</tbody></table>
    <p class="muted" style="margin-top:10px">${esc(d.disclaimer)}</p>`;
  openModal('🏥 机构汇总画像 · ' + esc(d.hospital), html);
}

const STATUS_META = { active: { label: '在役 active', cls: 'gv-active' }, shadow: { label: '观察期 shadow', cls: 'gv-shadow' }, deprecated: { label: '已下线 deprecated', cls: 'gv-dep' } };
async function showGovernance() {
  const d = await fetch('/api/rule-governance').then(r => r.json());
  const nonActive = d.entries.filter(e => e.status !== 'active');
  const body = nonActive.length ? nonActive.map(e => {
    const sm = STATUS_META[e.status] || STATUS_META.active;
    const hist = (e.history || []).map(h => `<span class="gv-hist">${esc(h.from)}→<b>${esc(h.to)}</b> · ${esc(h.by)}${h.reason ? ' · ' + esc(h.reason) : ''}</span>`).join('');
    const btns = e.status === 'shadow'
      ? `<button class="act adopt" onclick="governanceAction('${esc(e.rule_id)}','restore')">✓ 复审通过·恢复在役</button><button class="act reject" onclick="governanceAction('${esc(e.rule_id)}','retire')">⊗ 确认下线</button>`
      : `<button class="act adopt" onclick="governanceAction('${esc(e.rule_id)}','restore')">✓ 复审恢复·重新在役</button>`;
    return `<div class="gv-card"><div class="gv-head"><span class="gv-badge ${sm.cls}">${sm.label}</span><b class="rid">${esc(e.rule_id)}</b> ${esc(e.rule_name)}</div>
      <div class="gv-reason">${esc(e.reason || '')}</div><div class="gv-flow">${hist}</div><div class="actions">${btns}<span class="act-tip muted"></span></div></div>`;
  }).join('') : '<div class="cov-statement" style="color:var(--green)">全部 58 条规则均在役（active）。某规则被复核驳回 ≥3 次会自动转入 shadow 观察期、在此复审——目前无规则进观察期/下线。</div>';
  const html = `
    <p class="muted">规则本身也有治理生命周期（三审三验+在役治理）。误报闭环的执行端在这里<b>落盘可追溯</b>：复核驳回≥3次自动转 shadow（只观察不计分），人工复审后<b>恢复在役</b>或<b>确认下线</b>（下线后不再 fire）。</p>
    <div class="gv-machine">📐 规则状态机：${esc(d.model)}</div>
    <div class="bench-kpis">
      <div class="bkpi green"><div class="n">${d.summary.total_rules - d.summary.shadow - d.summary.deprecated}</div><div class="l">在役 active</div></div>
      <div class="bkpi"><div class="n" style="color:#5b5280">${d.summary.shadow}</div><div class="l">观察期 shadow</div></div>
      <div class="bkpi red"><div class="n">${d.summary.deprecated}</div><div class="l">已下线 deprecated</div></div>
      <div class="bkpi"><div class="n">${d.summary.total_rules}</div><div class="l">规则总数</div></div>
    </div>
    ${body}
    ${(d.audit_log && d.audit_log.length) ? `<div class="facts-h" style="margin-top:14px">🧾 治理操作流水（审计台账 · 谁/何时/把哪条规则怎么改）</div>
      <table class="fee-table"><thead><tr><th>时间(UTC)</th><th>规则</th><th>流转</th><th>操作者</th><th>理由</th></tr></thead><tbody>
      ${d.audit_log.slice(0, 12).map(h => `<tr><td class="muted">${esc((h.ts || '').replace('T', ' ').slice(0, 19))}</td><td><b>${esc(h.rule_id)}</b></td><td>${esc(h.from)}→<b>${esc(h.to)}</b></td><td>${esc(h.by)}</td><td class="muted">${esc(h.reason || '')}</td></tr>`).join('')}
      </tbody></table>` : ''}
    <p class="muted" style="margin-top:10px">治理状态落盘于 data/rule_states.json（与规则定义 rules.yaml 分离，可逆、免重建、重启仍生效）。复审恢复在役会清零驳回计数（需 restore 之后再攒满阈值新驳回才再次转 shadow）。这把 iter-11/12 的误报闭环从"运行期计算"做成"文件可追溯治理"。</p>`;
  openModal('🗂 规则三态治理 · 误报闭环的可追溯执行端', html);
}
window.governanceAction = async (ruleId, action) => {
  let reason = '';
  if (action === 'retire') { reason = (prompt('确认下线该规则的复审理由（必填，将记入流转 history）：') || '').trim(); if (!reason) return; }
  else reason = '复审通过，规则有效，恢复在役';
  try {
    await fetch('/api/rule-governance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rule_id: ruleId, action, reason }) }).then(r => r.json());
    await showGovernance(); // 刷新
  } catch (e) {}
};
function renderReviewFlow(stats) {
  const totals = stats?.totals || {};
  const flagged = stats?.flagged_rules || [];
  const has = (totals['采纳'] || 0) + (totals['驳回'] || 0) + (totals['补材料'] || 0) > 0;
  return `<div class="facts-h" style="margin-top:14px">🔁 复核反馈回流（误报闭环 · 恒识式"规则沉淀"的对偶=淘汰坏规则）</div>
    ${has ? `<div class="cov-statement">累计：采纳 ${totals['采纳'] || 0} · 驳回 ${totals['驳回'] || 0} · 补材料 ${totals['补材料'] || 0}（持久化于 data/review_feedback.json）</div>
    ${flagged.length ? `<div class="ingest-err">🌓 已自动转 <b>shadow 观察期</b>的高误报规则（驳回≥${stats.threshold || 3}次自动 re_review · 已落盘 data/rule_states.json）：${flagged.map(f => `<b>${esc(f.rule_id)}</b>(驳回${f.rejected})`).join('、')}<div class="muted" style="margin-top:5px">↳ 这些规则在稽核时仍跑、仍展示证据链，但<b>不再计入疑点/金额</b>（沉底置灰）。到「🗂 规则治理」页人工复审：<b>恢复在役</b>或<b>确认下线</b>——误报闭环从"标记"走到"执行"再到"可追溯治理"。</div></div>` : '<div class="cov-statement" style="color:var(--green)">暂无规则达到 re_review 阈值（无规则进观察期）。</div>'}` :
      `<div class="cov-statement muted">暂无复核反馈。点任一疑点卡的 采纳/驳回(填原因)/补材料 即开始沉淀——驳回原因回流，某规则被驳回≥3次自动标"高误报待复审"。这把"规则沉淀"从口号做成可见闭环。</div>`}`;
}
function showPitch() {
  const html = `
    <div class="pitch-block"><h4>一句话定位</h4><div class="pitch-quote">鹰眼是稽核员的 AI 初筛员——读懂非结构化病历，90 秒输出可对质的证据链稽核报告。</div></div>
    <div class="pitch-block"><h4>三支点</h4>
      <div class="pitch-quote">① 地位：站在官方规则库(88类/24.7万知识点)肩上的<b>语义增强层</b>，国家系统的"取证放大镜"。</div>
      <div class="pitch-quote">② 被验证：政策(AI+医保监管/智能监管年追26.72亿) · 商业(美国Alaffia·LLM读病历证据回链·提速20倍·收入翻4倍) · 地方(苏州4个月追回8151万·已自研AI比对模型)。</div>
      <div class="pitch-quote">③ 蓝海：三层玩家无人做飞检台非结构化语义初筛；官方规则全公开→壁垒迁移到语义稽核+证据链工程+对抗复核。</div></div>
    <div class="pitch-block"><h4>数字弹药库（引用前核对口径）</h4>
      <table class="ammo"><tbody>
      <tr><td><b>342亿</b></td><td>2025全国医保系统全口径追回（278亿经办挽回·查实骗保1626家）</td></tr>
      <tr><td><b>30009亿</b></td><td>2025基本医保基金总支出首破3万亿（参保13.3亿人）</td></tr>
      <tr><td><b>8151.79万</b></td><td>苏州2026年1-4月追回（注：非全年）</td></tr>
      <tr><td><b>40分→90秒</b></td><td>单份材料人工 vs 鹰眼</td></tr>
      <tr><td><b>70%</b></td><td>2026年底事前提醒系统定点机构接入率目标</td></tr>
      </tbody></table></div>
    <div class="pitch-block"><h4>金句</h4>
      <div class="pitch-quote">引不出原文的疑点，我们不输出。</div>
      <div class="pitch-quote">能不报，比能报更难，也更值钱。</div>
      <div class="pitch-quote">疑点有三要素门禁，规则进库要过三审三验——规则本身也有证据链。</div>
      <div class="pitch-quote">我们不是相信模型，是不信任模型，所以造了一条流水线。</div></div>
    <p class="muted">⚠ 口播：342亿=2025全年全国全口径；苏州8151万=1-4月；Alaffia数字加"据其投资方披露"。</p>`;
  openModal('🎤 演示要点 · Pitch 弹药', html);
}

init();
