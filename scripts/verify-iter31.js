#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const { resolveBatchCaseIds } = require('../prototype/app/engine/priority-service');
const { runAudit } = require('../prototype/app/engine/audit-engine');
const { loadJsonKB } = require('../prototype/app/kb/retrieval');
const { summarizeEvalJson } = require('../yhf/harness/l1-prompt');

async function main() {
  const v7 = path.resolve(__dirname, '../eval/prompts_v7/P5_judge_v7.txt');
  const text = fs.readFileSync(v7, 'utf8');
  if (!text.includes('硬性短路')) {
    console.error('❌ P5 v7 缺少硬性短路段落');
    process.exit(1);
  }
  console.log('✅ P5_judge_v7.txt 结构检查 PASS');

  const baseline = path.resolve(__dirname, '../eval/results/baseline_p5.json');
  if (fs.existsSync(baseline)) {
    const data = JSON.parse(fs.readFileSync(baseline, 'utf8'));
    const sum = summarizeEvalJson(data, { score_mode: 'all', primary_judge: 'MiniMax-Text-01' });
    if (!sum || sum.total !== 6) {
      console.error('❌ baseline_p5 用例数异常', sum);
      process.exit(1);
    }
    console.log(`✅ G2 评分可读 — 全裁判 ${sum.green_all}/${sum.total} · 主裁判 ${sum.green_primary}/${sum.total}`);
  } else {
    console.log('⏭ baseline_p5.json 缺失，跳过 G2 评分检查');
  }

  const DATA = path.resolve(__dirname, '../prototype/data');
  const rules = JSON.parse(fs.readFileSync(path.join(DATA, 'rules/rules.json'), 'utf8')).rules;
  const maps = loadJsonKB(DATA);
  const cases = {};
  for (const name of fs.readdirSync(DATA)) {
    if (!name.startsWith('case_')) continue;
    const full = path.join(DATA, name);
    if (!fs.statSync(full).isDirectory()) continue;
    const folderId = name.replace(/^case_/, '');
    const id = folderId === 'NSCLC' ? 'main' : folderId;
    cases[id] = JSON.parse(fs.readFileSync(path.join(full, 'medical_record.json'), 'utf8'));
  }
  const runAuditFn = (rec) => runAudit(rec, rules, {
    policyTexts: maps.policyTexts,
    policyVerified: maps.policyVerified,
    shadowRules: [],
    retiredRules: [],
  });

  const top5 = await resolveBatchCaseIds(cases, runAuditFn, {
    priority: true,
    skip: ['uploaded'],
    top_n: 5,
  });
  if (top5.caseIds.length !== 5) {
    console.error('❌ priority+top_n 应返回 5 案卷', top5.caseIds.length);
    process.exit(1);
  }
  const full = await resolveBatchCaseIds(cases, runAuditFn, {
    priority: true,
    skip: ['uploaded'],
    all: true,
  });
  if (top5.caseIds.join(',') === full.caseIds.join(',')) {
    console.error('❌ top_n 未截断队列');
    process.exit(1);
  }
  if (top5.caseIds.join(',') !== full.caseIds.slice(0, 5).join(',')) {
    console.error('❌ top_n 队首与全队列不一致');
    process.exit(1);
  }
  console.log(`✅ batch top_n PASS — 首案=${top5.caseIds[0]} · 共 ${top5.caseIds.length} 案`);
}

main().catch((e) => {
  console.error('❌ verify-iter31:', e.message);
  process.exit(1);
});
