#!/usr/bin/env node
'use strict';

/**
 * YHF Gate CLI — MVP：L3 Oracle + G0 干净件零误报红线。
 * 用法: node yhf/gate.js [--strict] [--layer engine,prompt,shadow,rule] [--rule T-201]
 */

const fs = require('fs');
const path = require('path');
const { YHF_ROOT } = require('./lib/paths');
const { runYhfGate } = require('./index');

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
function flag(name) { return process.argv.includes(`--${name}`); }

const STRICT = flag('strict');
const LAYERS = arg('layer', 'engine').split(',').map(s => s.trim());
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
    lines.push('## L4 Shadow', '');
    lines.push(`- rule: ${s.rule_id} | FPR: ${s.metrics.fpr} | precision: ${s.metrics.precision}`);
    lines.push(`- G1: ${s.pass === null ? 'n/a' : s.pass ? '✅' : '❌'}`, '');
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
  lines.push('---', `**overall**: ${report.overall_pass ? '✅ PASS' : '❌ FAIL'}`);
  return lines.join('\n');
}

function main() {
  const report = runYhfGate({
    layers: LAYERS,
    ruleId: RULE_ID || undefined,
  });
  report.overall_pass = report.overall_pass !== false;
  if (report.engine && !report.engine.gates.G0_clean_zero_fp) report.overall_pass = false;
  if (report.shadow?.pass === false) report.overall_pass = false;

  const outDir = path.join(YHF_ROOT, 'results');
  fs.mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  fs.writeFileSync(path.join(outDir, `gate_${ts}.json`), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(outDir, 'gate_latest.md'), renderMarkdown(report));

  console.log(renderMarkdown(report));
  console.log(`\n(written: yhf/results/gate_latest.md)`);

  if (STRICT && !report.overall_pass) process.exit(1);
}

main();
