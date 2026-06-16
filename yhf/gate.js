#!/usr/bin/env node
'use strict';

/**
 * YHF Gate CLI — MVP：L3 Oracle + G0 干净件零误报红线。
 * 用法: node yhf/gate.js [--strict] [--layer engine,prompt,shadow,rule,rag] [--rule T-201]
 */

const fs = require('fs');
const path = require('path');
const { YHF_ROOT, REPO_ROOT } = require('./lib/paths');

(function loadEnv() {
  const envPath = path.join(REPO_ROOT, 'prototype/app/.env');
  try {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const s = line.trim();
      if (!s || s.startsWith('#') || !s.includes('=')) continue;
      const i = s.indexOf('=');
      const k = s.slice(0, i).trim();
      const v = s.slice(i + 1).trim();
      if (k && !process.env[k]) process.env[k] = v;
    }
  } catch {}
})();
const { runYhfGate } = require('./index');

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
function flag(name) { return process.argv.includes(`--${name}`); }

const STRICT = flag('strict');
const LAYERS = arg('layer', STRICT ? 'engine,rule,rag,shadow' : 'engine').split(',').map(s => s.trim());
const RULE_ID = arg('rule', '');

function renderMarkdown(report) {
  const lines = ['# YHF Gate Report', '', `> mode: oracle (governance overlay disabled)`, ''];
  if (report.engine) {
    const e = report.engine;
    lines.push('## L3 Engine (Oracle)', '');
    lines.push(`- cases: ${e.meta.total_cases} | clean: ${e.meta.clean_cases}`);
    lines.push(`- **G0 clean zero FP**: ${e.gates.G0_clean_zero_fp ? '✅ PASS' : '❌ FAIL'} (FP total: ${e.meta.clean_false_positive_total})`);
    lines.push(`- avg latency: ${e.meta.avg_latency_ms}ms`, '');
    for (const c of e.cases) {
      const mark = c.pass ? '✅' : '❌';
      lines.push(`- ${mark} \`${c.case_id}\` suspected=${c.found_suspected}${c.is_clean ? ' (clean)' : ''}${c.failures.length ? ' — ' + c.failures.join('; ') : ''}`);
    }
    lines.push('');
  }
  if (report.shadow) {
    const s = report.shadow;
    lines.push('## L4 Shadow (G1)', '');
    if (s.summary) {
      lines.push(`- **G1 shadow FPR**: ${s.pass ? '✅ PASS' : '❌ FAIL'} (passed ${s.summary.passed}/${s.summary.total}, skipped ${s.summary.skipped})`, '');
      for (const r of (s.rules || []).filter(x => x.pass === false).slice(0, 5)) {
        lines.push(`- ❌ \`${r.rule_id}\` FPR=${r.metrics.fpr} fp=${r.metrics.fp} tn=${r.metrics.tn}`);
      }
    } else {
      lines.push(`- rule: ${s.rule_id} | FPR: ${s.metrics?.fpr} | precision: ${s.metrics?.precision}`);
      lines.push(`- G1: ${s.pass === null ? 'n/a' : s.pass ? '✅' : '❌'}`, '');
    }
    lines.push('');
  }
  if (report.prompt?.status === 'stub') {
    lines.push('## L1 Prompt (stub)', '', report.prompt.message, '');
  }
  if (report.rule) {
    const r = report.rule;
    if (r.status === 'ok' || r.gates?.L2_core_full_cases) {
      lines.push('## L2 Rule (核心集)', '');
      lines.push(`- **L2 核心 test_cases**: ✅ ${r.rules_with_full_cases}/${r.total_rules} 条完备`);
      lines.push(`- 核心规则: ${(r.core_rules || []).join(', ')}`, '');
    } else if (r.status === 'partial') {
      lines.push('## L2 Rule (核心集)', '');
      lines.push(`- **缺用例**: ${r.missing_test_cases}/${r.total_rules} 条`);
      if (r.missing_sample?.length) {
        lines.push(`- 示例: ${r.missing_sample.map(m => m.rule_id).join(', ')}`, '');
      }
    } else if (r.status === 'stub') {
      lines.push('## L2 Rule (stub)', '', `- ${report.rule.missing_test_cases}/${report.rule.total_rules} rules lack 6 test_cases`, '');
    }
  }
  if (report.rag) {
    const r = report.rag;
    lines.push('## L5 RAG (recall@k)', '');
    lines.push(`- **G4 recall@${r.k}**: ${r.pass ? '✅ PASS' : '❌ FAIL'} (${(r.recall * 100).toFixed(1)}% ≥ ${(r.min_recall * 100).toFixed(0)}%)`);
    lines.push(`- hits: ${r.hit_count}/${r.total_queries}`, '');
    const misses = (r.cases || []).filter(c => !c.recalled).slice(0, 5);
    for (const c of misses) {
      lines.push(`- ❌ \`${c.id}\` expected ${c.expected_refs.join('|')} got ${c.hit_refs.slice(0, 3).join(', ') || '—'}`);
    }
    lines.push('');
  }
  lines.push('---', `**overall**: ${report.overall_pass ? '✅ PASS' : '❌ FAIL'}`);
  return lines.join('\n');
}

function main() {
  runYhfGate({
    layers: LAYERS,
    ruleId: RULE_ID || undefined,
  }).then(report => {
    report.overall_pass = report.overall_pass !== false;
    if (report.engine && !report.engine.gates.G0_clean_zero_fp) report.overall_pass = false;
    if (report.shadow?.pass === false) report.overall_pass = false;
    if (report.rag?.pass === false) report.overall_pass = false;

    const outDir = path.join(YHF_ROOT, 'results');
    fs.mkdirSync(outDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    fs.writeFileSync(path.join(outDir, `gate_${ts}.json`), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(outDir, 'gate_latest.md'), renderMarkdown(report));
    const md = renderMarkdown(report);
    console.log(md);
    if (STRICT && !report.overall_pass) process.exit(1);
  }).catch(e => {
    console.error(e);
    process.exit(1);
  });
}

main();
