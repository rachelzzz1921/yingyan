#!/usr/bin/env node
'use strict';
/**
 * E1 批量筛查演示数据:生成 1000 条结算明细行(虚构脱敏),埋入可确定性检出的违规,
 * 带 ground-truth manifest(评委可任指一条核对)。固定随机种子,可复现。
 */
const fs = require('fs');
const path = require('path');

// 可复现伪随机(mulberry32)
let seed = 20260702;
function rnd() { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const pick = (a) => a[Math.floor(rnd() * a.length)];
const pad = (n, w) => String(n).padStart(w, '0');

const DEPTS = ['呼吸内科', '肿瘤内科', '骨科', '心血管内科', '消化内科', '神经内科', '儿科', '普外科'];
const DOCTORS = ['王医生', '李医生', '张医生', '刘医生', '陈医生', '杨医生', '赵医生', '周医生'];
const NORMAL_ITEMS = [
  ['床位费（三人间）', 50, '床位费'], ['二级护理', 12, '护理费'], ['血常规', 25, '检验费'],
  ['生化全套', 120, '检验费'], ['胸部X线摄影', 175, '检查费'], ['心电图', 30, '检查费'],
  ['注射用头孢呋辛钠', 30, '西药费'], ['奥美拉唑肠溶胶囊', 85, '西药费'], ['静脉输液', 8, '治疗费'],
  ['阿托伐他汀钙片', 100, '西药费'], ['二甲双胍片', 45, '西药费'], ['彩色多普勒超声', 160, '检查费'],
];
const QUINOLONES = ['左氧氟沙星氯化钠注射液', '莫西沙星片', '环丙沙星注射液'];
const PEDIATRIC = ['小儿氨酚黄那敏颗粒', '小儿豉翘清热颗粒'];
const MALE_ONLY = ['前列腺特异性抗原测定(PSA)'];
const FEMALE_ONLY = ['宫颈细胞学检查(TCT)'];

const rows = [];
const truth = [];
let traceSeq = 1;
function mkTrace() { return '8' + pad(Math.floor(rnd() * 1e9), 9) + pad(traceSeq++, 10); }

for (let i = 1; i <= 1000; i++) {
  const dept = pick(DEPTS);
  const [name, price, cat] = pick(NORMAL_ITEMS);
  const qty = 1 + Math.floor(rnd() * 5);
  rows.push({
    row_id: 'S' + pad(i, 5),
    settle_date: `2026-06-${pad(1 + Math.floor(rnd() * 28), 2)}`,
    patient_age: 18 + Math.floor(rnd() * 70),
    patient_sex: rnd() < 0.5 ? '男' : '女',
    dept, doctor: pick(DOCTORS),
    item_name: name, category: cat, qty, unit_price: price,
    amount: Math.round(qty * price * 100) / 100,
    trace_code: cat === '西药费' && rnd() < 0.6 ? mkTrace() : '—',
  });
}

// ---- 埋点(覆盖三档叙事,共 32 处) ----
function embed(idx, patch, rule, note) {
  Object.assign(rows[idx], patch);
  truth.push({ row_id: rows[idx].row_id, rule, note });
}
const used = new Set();
function slot() { let k; do { k = 10 + Math.floor(rnd() * 980); } while (used.has(k)); used.add(k); return k; }

// ① 追溯码重复结算 ×8 组(同码两行)
for (let g = 0; g < 8; g++) {
  const code = mkTrace();
  let a = slot(), b = slot();
  if (a > b) [a, b] = [b, a]; // 首笔在数组与日期上都先于重复笔
  embed(a, { item_name: '恩替卡韦分散片', category: '西药费', qty: 1, unit_price: 145, amount: 145, trace_code: code, settle_date: '2026-06-' + pad(2 + g, 2) }, 'TRACE-101', `同追溯码组${g + 1}·首笔`);
  embed(b, { item_name: '恩替卡韦分散片', category: '西药费', qty: 1, unit_price: 145, amount: 145, trace_code: code, settle_date: '2026-06-' + pad(15 + g, 2) }, 'TRACE-101', `同追溯码组${g + 1}·重复结算`);
}
// ② 未成年喹诺酮 ×8
for (let g = 0; g < 8; g++) {
  embed(slot(), { patient_age: 8 + Math.floor(rnd() * 9), item_name: pick(QUINOLONES), category: '西药费', qty: 3, unit_price: 28, amount: 84 }, 'AGE-101', '未成年(＜18)使用喹诺酮');
}
// ③ ≥14岁用儿童专用制剂 ×4
for (let g = 0; g < 4; g++) {
  embed(slot(), { patient_age: 20 + Math.floor(rnd() * 50), item_name: pick(PEDIATRIC), category: '西药费', qty: 2, unit_price: 18, amount: 36 }, 'AGE-101', '≥14岁使用儿童专用制剂');
}
// ④ 性别-项目冲突 ×4
for (let g = 0; g < 2; g++) {
  embed(slot(), { patient_sex: '女', item_name: MALE_ONLY[0], category: '检验费', qty: 1, unit_price: 60, amount: 60 }, 'F-001', '女性收male-only项目');
  embed(slot(), { patient_sex: '男', item_name: FEMALE_ONLY[0], category: '检查费', qty: 1, unit_price: 150, amount: 150 }, 'F-001', '男性收female-only项目');
}
// ⑤ 超常数量(单日同项目数量离谱) ×8
for (let g = 0; g < 8; g++) {
  embed(slot(), { item_name: '静脉输液', category: '治疗费', qty: 30 + Math.floor(rnd() * 40), unit_price: 8 }, 'QTY-901', '单日数量超常(≥30次)');
}
for (const r of rows) r.amount = Math.round(r.qty * r.unit_price * 100) / 100;

const out = {
  doc_type: 'E1批量筛查演示·结算明细1000条(虚构脱敏,固定种子可复现)',
  generated_at: '2026-07-02',
  total: rows.length,
  embedded_truth: truth,
  rows,
};
const dir = path.join(__dirname, '../prototype/data/screening');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'settlements_1000.json'), JSON.stringify(out), 'utf8');
console.log('生成', rows.length, '条,埋点', truth.length, '处:', [...new Set(truth.map(t => t.rule))].join('/'));
