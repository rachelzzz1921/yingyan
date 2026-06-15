/**
 * 构建脚本：medical_record.json → medical_record.md（人类可读版）
 * 用法：node build-record-md.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const R = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/case_NSCLC/medical_record.json'), 'utf8'));
const out = [];
const P = (s) => out.push(s);

P(`# ${R.case_meta.case_title}`);
P(`\n> ${R.case_meta.disclaimer}`);
P(`> 预埋违规点 ${R.case_meta.embedded_violation_count} 个 + 干扰项 ${R.case_meta.distractor_count} 个；结算总额 ¥${R.case_meta.settlement_summary.total_amount}（${R.case_meta.settlement_summary.settle_type}）。\n`);
P('---\n');

// 病案首页
const f = R.front_page;
P(`## 一、病案首页\n`);
P(`| 项目 | 内容 | 项目 | 内容 |`);
P(`|---|---|---|---|`);
P(`| 姓名 | ${f.patient_name} | 性别/年龄 | ${f.sex} / ${f.age}岁 |`);
P(`| 出生日期 | ${f.birth_date} | 医保类型 | ${f.insurance_type} |`);
P(`| 住院号 | ${f.admission_no} | 床号 | ${f.bed_no} |`);
P(`| 入院时间 | ${f.admit_time} | 出院时间 | **${f.discharge_time}** |`);
P(`| 科室 | ${f.admit_dept} | 住院天数 | ${f.actual_inpatient_days}天 |`);
P(`\n**主要诊断**：${f.principal_diagnosis.name}（${f.principal_diagnosis.icd10}），${f.principal_diagnosis.tnm_stage}，${f.principal_diagnosis.note || ''}`);
P(`\n**其他诊断**：${f.other_diagnosis.map(d => d.name + '(' + d.icd10 + ')').join('；')}`);
P(`\n**主管医师**：${f.attending_physician}；**主任**：${f.chief_physician}`);
P(`\n**既往住院**：`);
for (const p of f.previous_admissions) P(`- ${p.admit_time?.slice(0, 10)} ~ ${p.discharge_time?.slice(0, 10)}　${p.principal_diagnosis}　${p.summary}`);
P('\n---\n');

// 入院记录
const a = R.admission_note;
P(`## 二、入院记录（${a.record_time}）\n`);
P(`**主诉**：${a.chief_complaint}\n`);
P(`**现病史**：${a.present_illness}\n`);
P(`**既往史**：${a.past_history}\n`);
P(`**查体**：${a.physical_exam}\n`);
P(`**初步诊断**：${a.preliminary_diagnosis.join('；')}\n`);
P(`**诊疗计划**：${a.treatment_plan}`);
P('\n---\n');

// 病程
P(`## 三、病程记录（逐日）\n`);
for (const p of R.progress_notes) {
  P(`### ${p.date} · ${p.type}（${p.author}）`);
  P(`${p.text}\n`);
}
P('---\n');

// 医嘱
P(`## 四、医嘱单\n`);
P(`### 长期医嘱`);
P(`| 编号 | 起 | 止 | 内容 |`);
P(`|---|---|---|---|`);
for (const o of R.long_term_orders.items) P(`| ${o.order_id} | ${(o.start || '').slice(0, 16)} | ${(o.stop || '').slice(0, 10)} | ${o.content}${o.key ? ' ⟨' + o.key + '⟩' : ''} |`);
P(`\n### 临时医嘱`);
P(`| 编号 | 时间 | 内容 |`);
P(`|---|---|---|`);
for (const o of R.temporary_orders.items) P(`| ${o.order_id} | ${(o.time || '').slice(0, 16)} | ${o.content}${o.key ? ' ⟨' + o.key + '⟩' : ''} |`);
P('\n---\n');

// 护理
P(`## 五、护理记录单\n`);
P(`**实际执行护理级别**：${R.nursing_records.nursing_level_executed}`);
P(`\n> ${R.nursing_records.note}\n`);
P(`| 日期 | 巡视间隔 | 测生命体征 | 记录 |`);
P(`|---|---|---|---|`);
for (const e of R.nursing_records.entries) P(`| ${e.date} | ${e.round_interval_h}h | ${e.vitals_count}次 | ${e.text} |`);
P('\n---\n');

// 检验
P(`## 六、检验报告\n`);
for (const L of R.lab_reports) {
  P(`### ${L.category}（${L.report_id} · ${L.report_time}）`);
  P(`| 项目 | 结果 | 参考 | 标志 |`);
  P(`|---|---|---|---|`);
  for (const x of L.results) P(`| ${x.item} | **${x.value}** ${x.unit} | ${x.ref} | ${x.flag} |`);
  P('');
}
P('---\n');

// 病理/基因
P(`## 七、病理报告 / 基因检测\n`);
const pa = R.pathology_report;
P(`**病理报告**（${pa.report_id} · ${pa.report_time}）`);
P(`- 标本：${pa.specimen}`);
P(`- 镜下：${pa.microscopic}`);
P(`- 免疫组化：${pa.immunohistochemistry}`);
P(`- **诊断：${pa.diagnosis}**`);
P(`- 注：${pa.note}\n`);
P(`**基因检测报告**：⚠ ${R.gene_test_report.status}`);
P(`> ${R.gene_test_report.note}\n`);
P('---\n');

// 费用清单
P(`## 八、费用结算明细（${R.fee_list.items.length}行，合计 ¥${R.fee_list.total_amount}）\n`);
P(`| 行 | 日期 | 项目 | 规格 | 数量 | 单价 | 金额 | 类别 | 备注 |`);
P(`|---|---|---|---|---|---|---|---|---|`);
for (const it of R.fee_list.items) {
  const flag = /★/.test(it.flag || '') ? it.flag : '';
  P(`| ${it.line_no} | ${it.fee_date} | ${it.item_name} | ${it.spec || ''} | ${it.qty}${it.unit} | ${it.unit_price} | ${it.amount.toFixed(2)} | ${it.insurance_class} | ${flag} |`);
}
P(`\n> **逐行核对提示（T-207）**：${R.fee_list.absent_items_note}\n`);
P('---\n');

// 出院小结
const d = R.discharge_summary;
P(`## 九、出院小结\n`);
P(`**住院**：${d.admit_date} ~ ${d.discharge_date}`);
P(`\n**出院诊断**：${d.discharge_diagnosis.join('；')}`);
P(`\n**诊疗经过**：${d.hospital_course}`);
P(`\n**出院医嘱**：${d.discharge_orders.join('；')}`);
P(`\n**出院带药**：${d.discharge_meds.map(m => m.name + (m.note ? '（' + m.note + '）' : '')).join('；')}`);
P('\n---\n');
P(`*本可读版由 medical_record.json 自动生成（build-record-md.js）；结构化数据为单一事实来源。*`);

const target = path.resolve(__dirname, '../data/case_NSCLC/medical_record.md');
fs.writeFileSync(target, out.join('\n'), 'utf8');
console.log('✅ 已生成', path.relative(process.cwd(), target), `（${out.join('\n').length} 字符）`);
