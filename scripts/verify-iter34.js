#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(buf) }); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function main() {
  const p5 = path.resolve(__dirname, '../prototype/app/engine/p5-judge.js');
  const text = fs.readFileSync(p5, 'utf8');
  if (!text.includes('runP5Judge') || !text.includes('loadPrompt')) {
    console.error('❌ p5-judge.js 结构异常');
    process.exit(1);
  }
  const { loadPrompt, buildFacts, normVerdict } = require('../prototype/app/engine/p5-judge');
  const pr = loadPrompt();
  if (!pr.v7 || !pr.text.includes('硬性短路')) {
    console.error('❌ P5 v7 prompt 未加载', pr);
    process.exit(1);
  }
  console.log(`✅ p5-judge 模块 PASS (${pr.file})`);

  const llm = fs.readFileSync(path.resolve(__dirname, '../prototype/app/engine/llm-agent.js'), 'utf8');
  if (!llm.includes("require('./p5-judge')")) {
    console.error('❌ llm-agent 未挂接 p5-judge');
    process.exit(1);
  }
  console.log('✅ llm-agent P5 挂接 PASS');

  const appJs = fs.readFileSync(path.resolve(__dirname, '../prototype/app/public/app.js'), 'utf8');
  if (!appJs.includes('/api/debate') || !appJs.includes('对抗辩论')) {
    console.error('❌ 工作台未接 /api/debate');
    process.exit(1);
  }
  console.log('✅ 工作台对抗辩论按钮 PASS');

  const DATA = path.resolve(__dirname, '../prototype/data');
  const rules = JSON.parse(fs.readFileSync(path.join(DATA, 'rules/rules.json'), 'utf8')).rules;
  const { loadJsonKB } = require('../prototype/app/kb/retrieval');
  const maps = loadJsonKB(DATA);
  const { runAudit } = require('../prototype/app/engine/audit-engine');
  const rec = JSON.parse(fs.readFileSync(path.join(DATA, 'case_violation_light_a105/medical_record.json'), 'utf8'));
  const rep = runAudit(rec, rules, {
    policyTexts: maps.policyTexts,
    policyVerified: maps.policyVerified,
    shadowRules: ['A-105'],
    retiredRules: [],
  });
  const a105 = (rep.findings || []).filter(f => f.rule_id === 'A-105');
  if (!a105.length) {
    console.error('❌ shadow 案卷 violation_light_a105 未产出 A-105');
    process.exit(1);
  }
  if (!a105.every(f => f.shadow)) {
    console.error('❌ A-105 在 shadow 模式下未全部标记 shadow', a105);
    process.exit(1);
  }
  console.log(`✅ shadow 案卷 PASS — A-105 ${a105.length} 条均 shadow`);

  const facts = buildFacts(rec, a105[0]);
  if (!facts.fee_lines?.length && !facts.orders?.length) {
    console.error('❌ buildFacts 未抽取事实', facts);
    process.exit(1);
  }
  if (normVerdict('降为线索') !== '线索') {
    console.error('❌ normVerdict 异常');
    process.exit(1);
  }
  console.log('✅ buildFacts / normVerdict PASS');

  const base = process.env.VERIFY_BASE || 'http://localhost:3700';
  try {
    const demo = await get(`${base}/api/three-review/demo`);
    if (demo.status !== 200 || !demo.data.p5_judge) {
      console.error('❌ three-review demo 无 p5_judge', demo.status);
      process.exit(1);
    }
    console.log('✅ /api/three-review/demo P5 字段 PASS');
  } catch (e) {
    console.log(`⏭ HTTP 探针跳过（${base} 未启动）: ${e.message}`);
  }
}

main().catch((e) => {
  console.error('❌ verify-iter34:', e.message);
  process.exit(1);
});
