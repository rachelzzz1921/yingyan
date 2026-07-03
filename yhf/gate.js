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
const { loadGateConfig } = require('./lib/paths');

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
function flag(name) { return process.argv.includes(`--${name}`); }

const STRICT = flag('strict');
const LAYERS = arg('layer', STRICT ? 'engine,rule,rag,shadow,prompt' : 'engine').split(',').map(s => s.trim());
const RULE_ID = arg('rule', '');

function renderMarkdown(report, cfg) {
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
  if (report.manifest && report.manifest.gates) {
    const m = report.manifest;
    lines.push('## 独立地面真值(金标准去自评化 · 与引擎快照解耦)', '');
    lines.push(`- source: \`ground_truth_manifest.json\`(按埋点设计意图声明,非引擎输出)`);
    lines.push(`- **G0b clean zero FP(独立复核·阻塞)**: ${m.gates.G0b_clean_zero_fp ? '✅ PASS' : '❌ FAIL'}(声明干净案 ${m.meta.clean_cases} 个)`);
    lines.push(`- **recall floor(报告态·非阻塞)**: ${m.recall_floor_pass ? '✅ 全召回' : '🟡 有漂移'}(floor 规则 ${m.meta.floor_rules} 条)`);
    if (m.meta.pending_realignment?.length) lines.push(`- ⏸ 待重对齐(规则库更新在飞): ${m.meta.pending_realignment.join(', ')}`);
    for (const c of (m.cases || []).filter(x => !x.hard_pass).slice(0, 5)) lines.push(`- ❌ \`${c.case_id}\` ${c.hard_failures.join('; ')}`);
    for (const c of (m.cases || []).filter(x => x.hard_pass && x.soft_failures.length).slice(0, 5)) lines.push(`- 🟡 \`${c.case_id}\` ${c.soft_failures.join('; ')}`);
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
  if (report.prompt) {
    const p = report.prompt;
    lines.push('## L1 Prompt (G2)', '');
    if (p.status === 'stub') {
      lines.push('- **G2 prompt**: ⏸ report-only（无 eval 缓存）');
      lines.push(`- ${p.message}`, '');
    } else {
      const rate = p.pass_rate != null ? `${Math.round(p.pass_rate * 100)}%` : '—';
      const primaryRate = p.pass_rate_primary != null
        ? ` · 主裁判 ${p.green_primary ?? '—'}/${p.cases} (${Math.round(p.pass_rate_primary * 100)}%)`
        : '';
      const g2Enabled = cfg?.gates?.G2_prompt_pass?.enabled === true;
      const warnBelow = cfg?.gates?.G2_prompt_pass?.warn_below ?? 0.5;
      const warn = !g2Enabled && p.pass_rate != null && p.pass_rate < warnBelow;
      const gateLabel = g2Enabled
        ? (p.gates?.G2_prompt_pass ? '✅ PASS' : '❌ FAIL')
        : (warn
          ? `⚠ report-only (${p.green ?? '—'}/${p.cases} 全绿率 ${rate}${primaryRate} · 低于 ${Math.round(warnBelow * 100)}% 预警线)`
          : `📊 report-only (${p.green ?? '—'}/${p.cases} 全绿率 ${rate}${primaryRate})`);
      lines.push(`- **G2 prompt**: ${gateLabel}`);
      lines.push(`- source: \`${p.source}\``);
      if (p.message) lines.push(`- ${p.message}`);
      const scoreMode = cfg?.gates?.G2_prompt_pass?.score_mode || p.score_mode || 'all';
      const failKey = scoreMode === 'primary' ? 'pass_primary' : 'pass';
      const fails = (p.cases_detail || []).filter(c => c[failKey] === false).slice(0, 4);
      for (const c of fails) lines.push(`- ❌ \`${c.id}\``);
      if (cfg?.gates?.G2_prompt_pass?.secondary_report && p.pass_rate_all != null && p.pass_rate_all < 1) {
        lines.push(`- 📎 双裁判 ${p.green_all ?? '—'}/${p.cases}（secondary，不阻塞 G2）`);
        for (const c of (p.cases_detail || []).filter(x => !x.pass && x.pass_primary).slice(0, 4)) {
          lines.push(`  - abab 未过 · 主裁判已过 \`${c.id}\``);
        }
      }
      lines.push('');
    }
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
  if (report.gz_production) {
    const g = report.gz_production;
    lines.push('## G5 79条生产就绪', '');
    if (g.status === 'skip') lines.push(`- **G5**: ⏸ ${g.message}`, '');
    else if (g.status === 'error') lines.push(`- **G5**: ❌ ${g.message}`, '');
    else {
      const s = g.summary || {};
      lines.push(`- **G5 production ready**: ${g.pass ? '✅ PASS' : '❌ FAIL'} (implemented ${s.implemented}/${s.total}, workflow ${s.workflow}, test_anchor ${s.test_anchor})`);
      if (g.gaps?.length) for (const x of g.gaps.slice(0, 5)) lines.push(`- ⚠ ${x}`);
      lines.push('');
    }
  }
  lines.push('---', `**overall**: ${report.overall_pass ? '✅ PASS' : '❌ FAIL'}`);
  return lines.join('\n');
}

function main() {
  const { execSync } = require('child_process');
  try {
    execSync('node scripts/verify-dashboard-frontend.js', { cwd: REPO_ROOT, stdio: 'inherit' });
  } catch {
    console.error('\n❌ 看板前端静态门禁失败 — 见 scripts/verify-dashboard-frontend.js');
    process.exit(1);
  }

  runYhfGate({
    layers: LAYERS,
    ruleId: RULE_ID || undefined,
  }).then(report => {
    const cfg = loadGateConfig();
    report.overall_pass = report.overall_pass !== false;
    if (report.engine && !report.engine.gates.G0_clean_zero_fp) report.overall_pass = false;
    if (report.shadow?.pass === false) report.overall_pass = false;
    if (report.rag?.pass === false) report.overall_pass = false;
    if (report.prompt?.pass === false && cfg?.gates?.G2_prompt_pass?.enabled === true) {
      report.overall_pass = false;
    }
    if (report.gz_production?.pass === false) report.overall_pass = false;

    const outDir = path.join(YHF_ROOT, 'results');
    fs.mkdirSync(outDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    fs.writeFileSync(path.join(outDir, `gate_${ts}.json`), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(outDir, 'gate_latest.md'), renderMarkdown(report, cfg));
    const md = renderMarkdown(report, cfg);
    console.log(md);
    if (STRICT && !report.overall_pass) process.exit(1);
  }).catch(e => {
    console.error(e);
    process.exit(1);
  });
}

main();
