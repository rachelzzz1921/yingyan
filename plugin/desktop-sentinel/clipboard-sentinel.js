#!/usr/bin/env node
'use strict';

/**
 * F2 桌面万能哨兵 · 通道①剪贴板/Excel 审计(最小可用版,零 npm 依赖)
 * ------------------------------------------------------------
 * 医保科整天活在 Excel 里——选中一片区域复制,3 秒内哨兵播报三档。
 * 无全局热键(那需 Electron/托盘壳,留路线图),用两条零依赖路径替代:
 *   默认:轮询 pbpaste 检测剪贴板变化,像结算表就自动审;
 *   --once:审当前剪贴板一次即退(配 macOS 快捷指令绑系统快捷键=伪热键);
 *   --no-poll:常驻不轮询,终端里按回车审一次。
 * 全部本地运行:剪贴板解析在本机完成,发给引擎的是结构化 rows,原始文本不出机。
 *
 * 用法: node plugin/desktop-sentinel/clipboard-sentinel.js [--engine http://localhost:3700] [--once|--no-poll] [--interval=1500]
 */

const { execFile } = require('child_process');
const crypto = require('crypto');
const readline = require('readline');

const args = process.argv.slice(2);
const getOpt = (name, def) => {
  const eq = args.find(a => a.startsWith('--' + name + '='));
  if (eq) return eq.split('=')[1];
  const i = args.indexOf('--' + name);
  if (i >= 0 && args[i + 1] && !args[i + 1].startsWith('--')) return args[i + 1];
  return def;
};
const engineBase = getOpt('engine', 'http://localhost:3700');
const interval = Number(getOpt('interval', '1500'));
const once = args.includes('--once');
const noPoll = args.includes('--no-poll');
const fromStdin = args.includes('--stdin'); // 回退:pbpaste 不可用时 `pbpaste | node ... --stdin`,或管道喂 TSV
const demoSample = args.includes('--demo-sample'); // 现场演示:不用打开 Excel,直接跑一段脱敏样例 TSV
const DEMO_TSV = [
  '项目名称\t年龄\t性别\t数量\t金额\t科室\t医生\t追溯码\t结算日期',
  '左氧氟沙星氯化钠注射液\t16\t女\t5\t140\t呼吸内科\t王医生\t\t2026-06-16',
  '静脉输液\t45\t男\t35\t280\t急诊科\t李医生\t\t2026-06-16',
  '恩替卡韦分散片\t45\t男\t1\t145\t感染科\t赵医生\t81069847100523916482\t2026-06-11',
  '恩替卡韦分散片\t45\t男\t1\t145\t感染科\t赵医生\t81069847100523916482\t2026-06-16',
  '苯磺酸氨氯地平片\t45\t男\t1\t28\t心内科\t周医生\t\t2026-06-16',
].join('\n');

// —— 剪贴板读取(macOS 优先;其它平台预留分支)——
function readClipboard() {
  return new Promise((resolve) => {
    if (process.platform === 'darwin') {
      execFile('pbpaste', (err, out) => resolve(err ? '' : out));
    } else if (process.platform === 'win32') {
      execFile('powershell', ['-noprofile', '-command', 'Get-Clipboard'], (err, out) => resolve(err ? '' : out));
    } else {
      execFile('xclip', ['-selection', 'clipboard', '-o'], (err, out) => resolve(err ? '' : out)); // Linux 需装 xclip
    }
  });
}

// —— TSV → rows[](列名词典 + 无表头位置启发式)——
const COL_ALIASES = {
  item_name: /项目名称|项目|名称|收费项目|药品名称|诊疗项目|品名/,
  patient_age: /年龄|患者年龄/,
  patient_sex: /性别/,
  qty: /数量|次数/,
  amount: /金额|费用|合计/,
  dept: /科室|开单科室/,
  doctor: /医生|医师/,
  trace_code: /追溯码|监管码/,
  settle_date: /结算日期|费用日期|日期/,
};
const num = (v) => { const s = String(v ?? '').replace(/[¥,\s]/g, ''); if (s === '') return undefined; const n = Number(s); return Number.isFinite(n) ? n : undefined; };
const normSex = (v) => { const s = String(v).trim(); if (/^(男|M|1)$/i.test(s)) return '男'; if (/^(女|F|2)$/i.test(s)) return '女'; return s; };
const DRUG_HINT = /注射|片|胶囊|颗粒|散|输液|检查|检验|超声|CT|护理|治疗|术|白蛋白|沙星|替尼|TCT|前列腺/;

function isLikelyTable(text) {
  if (!text || !text.includes('\t')) return false;
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  return lines.length >= 2;
}

function parseTsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const grid = lines.map(l => l.split('\t'));
  // 表头识别
  const header = grid[0];
  const colMap = {};
  let hasHeader = false;
  header.forEach((h, i) => {
    for (const [field, re] of Object.entries(COL_ALIASES)) {
      if (re.test(h)) { colMap[field] = i; hasHeader = true; }
    }
  });
  let dataRows = grid;
  if (hasHeader) dataRows = grid.slice(1);
  else {
    // 无表头位置启发式:找 item_name 列(纯中文含药/项目特征词);找不到→不是结算表
    let itemCol = -1;
    for (let c = 0; c < header.length; c++) {
      if (grid.some(r => DRUG_HINT.test(r[c] || ''))) { itemCol = c; break; }
    }
    if (itemCol < 0) return [];
    colMap.item_name = itemCol;
    const width = Math.max(...grid.map(r => r.length)); // 锯齿 TSV:用最大列数为上界,防后置列(追溯码)漏映射
    for (let c = 0; c < width; c++) {
      if (c === itemCol) continue;
      const col = grid.map(r => r[c]);
      if (colMap.patient_age === undefined && col.every(v => { const n = num(v); return n === undefined || (n >= 0 && n <= 120 && Number.isInteger(n)); }) && col.some(v => num(v) !== undefined)) colMap.patient_age = c;
      else if (colMap.patient_sex === undefined && col.every(v => /^(男|女|M|F|1|2|)$/i.test(String(v).trim()))) colMap.patient_sex = c;
      else if (colMap.trace_code === undefined && col.some(v => /^[0-9A-Z]{10,}$/i.test(String(v).trim()))) colMap.trace_code = c;
    }
  }
  const rows = [];
  dataRows.forEach((r, i) => {
    const get = (field) => (colMap[field] !== undefined ? r[colMap[field]] : undefined);
    const item = String(get('item_name') || '').trim();
    if (!item) return; // 只送能解析出项目名的行
    rows.push({
      row_id: 'C' + (i + 1),
      item_name: item,
      patient_age: num(get('patient_age')),
      patient_sex: get('patient_sex') !== undefined ? normSex(get('patient_sex')) : undefined,
      qty: num(get('qty')) ?? 1,
      amount: num(get('amount')) ?? 0,
      dept: get('dept'), doctor: get('doctor'),
      trace_code: String(get('trace_code') || '').trim(),
      settle_date: get('settle_date'),
    });
  });
  return rows;
}

function readStdin() {
  return new Promise((resolve) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { buf += c; });
    process.stdin.on('end', () => resolve(buf));
  });
}

const triageBadge = (nature) => {
  if (nature === '明确违规') return '🟥 A 建议重点核查';
  if (nature === '可疑') return '🟨 B 建议补材料后核查';
  return '🟩 C 建议暂缓/观察';
};
async function auditClipboard(sourceText) {
  const text = sourceText != null ? sourceText : await readClipboard();
  if (!isLikelyTable(text)) { if (once) console.log('   ⤷ 剪贴板不是结算表(需多行 tab 分隔),跳过。'); return false; }
  const rows = parseTsv(text);
  if (!rows.length) { if (once) console.log('   ⤷ 未能从剪贴板解析出结算行(缺项目名列)。'); return false; }
  // 隐私门槛:必须有真实医保特征(药名/项目词 或 合法追溯码)才发引擎——挡住带"名称/金额"表头的
  // 私密账单/密码表被误采外发(review 修复:表头分支曾绕过 DRUG_HINT)
  const hasMedicalSignal = rows.some(r => DRUG_HINT.test(r.item_name || '') || /^[0-9A-Z]{10,}$/i.test(String(r.trace_code || '')));
  if (!hasMedicalSignal) { if (once) console.log('   ⤷ 剪贴板无医保特征(药名/项目/追溯码),判为非结算表,跳过(不外发)。'); return false; }
  console.log(`📋 ${new Date().toLocaleTimeString()} 捕获剪贴板 ${rows.length} 行结算表 → 行级筛查…`);
  try {
    const r = await fetch(engineBase + '/api/screening/rows', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows }),
    }).then(x => x.json());
    if (r.error) { console.log('   ⤷ 引擎:', r.error); return true; }
    const f = r.funnel;
    console.log(`   🟥 A重点核查 ${f.by_nature['明确违规'] || 0} · 🟨 B补材料后核查 ${f.by_nature['可疑'] || 0} · 🟩 C暂缓/观察 ${f.clean_rows} · 命中涉及 ¥${f.hit_amount.toLocaleString()}`);
    for (const h of (r.top20 || []).slice(0, 6)) {
      console.log(`      · ${h.row_id} ${h.rule_id} ${triageBadge(h.nature)} ${h.reason || ''}`);
    }
    console.log(`   ⤷ ${f.total_rows} 行里 ${f.hit_rows} 行进入核查队列、${f.clean_rows} 行建议暂缓/观察——选区复制即审,人只接手需核查行。\n`);
  } catch (e) {
    console.log('   ⤷ 引擎未连接(先 cd prototype/app && node server.js):', e.message, '\n');
  }
  return true;
}

console.log('📋 鹰眼桌面哨兵 · 剪贴板/Excel 审计通道');
console.log('   引擎:', engineBase, '(剪贴板在本机解析,只把结构化医保字段发往该引擎)');
if (!/localhost|127\.0\.0\.1/.test(engineBase)) console.log('   ⚠ 引擎非本地回环地址——剪贴板解析出的字段会发往远端,确认是可信内网引擎再用。');

(async () => {
  if (fromStdin) { const t = await readStdin(); await auditClipboard(t); process.exit(0); }
  if (demoSample) { console.log('   演示样例:使用内置脱敏结算表,不读取系统剪贴板。\n'); await auditClipboard(DEMO_TSV); process.exit(0); }
  if (once) { await auditClipboard(); process.exit(0); }
  if (noPoll) {
    console.log('   显式模式:在 Excel 选区复制后,回到本终端按回车审一次。Ctrl+C 退出。\n');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '按回车审当前剪贴板 › ' });
    rl.prompt();
    rl.on('line', async () => { await auditClipboard(); rl.prompt(); });
    return;
  }
  console.log(`   轮询模式:每 ${interval}ms 侦测剪贴板变化,像结算表就自动审。Ctrl+C 退出。\n`);
  let lastHash = '';
  const tick = async () => {
    const text = await readClipboard();
    const h = crypto.createHash('md5').update(text || '').digest('hex');
    if (h !== lastHash) { lastHash = h; await auditClipboard(); }
    setTimeout(tick, interval);
  };
  tick();
})();
