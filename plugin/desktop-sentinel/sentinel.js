#!/usr/bin/env node
'use strict';

/**
 * F2 桌面万能哨兵 · 通道②文件夹监听(最小可用版,零依赖 Node 脚本)
 * ------------------------------------------------------------
 * 把 xlsx/csv/pdf/png/jpg/json 拖进监听文件夹 → 自动走鹰眼导入管线(/api/intake/batch)
 * → 触发稽核 → 终端播报三档结论 + 自动打开审核报告页。
 * 三条零对接通道之一(①剪贴板热键 ③截图OCR 需托盘壳,见 README 路线图);
 * 本通道全部本地运行,数据不出机——"安装即用"是真话不是宣传。
 *
 * 用法: node plugin/desktop-sentinel/sentinel.js [监听目录] [--engine http://localhost:3700]
 *       默认监听 ~/Desktop/鹰眼哨兵收件箱(不存在则创建)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const args = process.argv.slice(2);
const engineBase = (args.find(a => a.startsWith('--engine=')) || '').split('=')[1]
  || (args.includes('--engine') ? args[args.indexOf('--engine') + 1] : '')
  || 'http://localhost:3700';
const watchDir = args.find(a => !a.startsWith('--') && a !== engineBase) || path.join(os.homedir(), 'Desktop', '鹰眼哨兵收件箱');

const MIME = {
  '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.csv': 'text/csv', '.json': 'application/json',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel', '.txt': 'text/plain', '.md': 'text/markdown',
};
const MAX_MB = 20;

fs.mkdirSync(watchDir, { recursive: true });
console.log('🦅 鹰眼桌面哨兵 · 文件夹监听通道');
console.log('   监听目录:', watchDir);
console.log('   引擎:', engineBase, '(本地运行,数据不出机)');
console.log('   把 xlsx/csv/pdf/扫描件 拖进来即自动稽核。Ctrl+C 退出。\n');

const seen = new Map(); // name -> mtime,防重复触发
let busy = Promise.resolve();

async function auditFile(fp) {
  const name = path.basename(fp);
  const ext = path.extname(name).toLowerCase();
  const mime = MIME[ext];
  if (!mime) { console.log(`   ⤷ 跳过 ${name}(不支持的类型 ${ext || '无后缀'})`); return; }
  const stat = fs.statSync(fp);
  if (stat.size > MAX_MB * 1024 * 1024) { console.log(`   ⤷ 跳过 ${name}(>${MAX_MB}MB)`); return; }
  console.log(`📥 ${new Date().toLocaleTimeString()} 收到「${name}」→ 导入解析…`);
  const buf = fs.readFileSync(fp);
  const data = buf.toString('base64');
  try {
    let intake;
    // 完整结构化案卷(.json 且带 front_page/fee_list)走 structured 摄取;碎片材料走 intake 分槽合并
    let structured = null;
    if (ext === '.json') {
      try {
        const j = JSON.parse(buf.toString('utf8'));
        if (j && (j.front_page || j.fee_list)) structured = j;
      } catch (_) { /* 不是合法 JSON,走 intake */ }
    }
    if (structured) {
      intake = await fetch(engineBase + '/api/ingest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'structured', json: structured }),
      }).then(r => r.json());
    } else {
      intake = await fetch(engineBase + '/api/intake/batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: [{ name, mime, data }] }),
      }).then(r => r.json());
    }
    if (!intake.record && !intake.caseId) { console.log('   ⤷ 导入失败:', intake.error || JSON.stringify(intake).slice(0, 120)); return; }
    const audit = await fetch(engineBase + '/api/audit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseId: 'uploaded' }),
    }).then(r => r.json());
    const s = audit.report_meta?.summary || {};
    const nature = audit.report_meta?.case_nature || (s.suspected_count ? '可疑' : '干净');
    const icon = nature === '明确违规' ? '🟥' : nature === '可疑' ? '🟨' : '🟩';
    console.log(`   ${icon} 定档「${nature}」· 疑点 ${s.suspected_count ?? 0} 条 / 线索 ${s.clue_count ?? 0} 条 · 涉及 ¥${s.suspected_amount ?? 0}`);
    for (const f of (audit.findings || []).slice(0, 3)) {
      console.log(`      · ${f.rule_id} ${f.rule_name || ''} ¥${f.amount_involved ?? 0}(${f.nature || f.status})`);
    }
    const url = engineBase + '/?case=uploaded';
    console.log(`   ⤷ 报告: ${url}\n`);
    if (process.platform === 'darwin') execFile('open', [url], () => {});
  } catch (e) {
    console.log('   ⤷ 引擎未连接或处理失败:', e.message, '\n');
  }
}

fs.watch(watchDir, (event, name) => {
  if (!name || name.startsWith('.')) return;
  const fp = path.join(watchDir, name);
  if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) return;
  const mt = fs.statSync(fp).mtimeMs;
  if (seen.get(name) === mt) return;
  seen.set(name, mt);
  // 等 800ms 让拖拽写入完成;串行处理防交错
  busy = busy.then(() => new Promise(r => setTimeout(r, 800))).then(() => auditFile(fp)).catch(() => {});
});
