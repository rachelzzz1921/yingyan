'use strict';

/**
 * L1 Prompt Harness — 尝试读 eval/results 最新报告；无则返回 stub 指引。
 */

const fs = require('fs');
const path = require('path');
const { DEFAULTS, REPO_ROOT } = require('../lib/paths');

function findLatestResult(pinned) {
  // G2 基线可在 gate.config.yaml 用 source_file 钉住(千问迁移期间 qwen_* 中间产物会更"新",
  // 若按 mtime 选会把跑到一半的迁移基线当门禁输入——2026-07-02 实翻过车)
  if (pinned) {
    for (const dir of ['eval/results', 'yhf/results']) {
      const fp = path.join(REPO_ROOT, dir, pinned);
      if (fs.existsSync(fp)) return fp;
    }
  }
  const dirs = [
    path.join(REPO_ROOT, 'eval/results'),
    path.join(REPO_ROOT, 'yhf/results'),
  ];
  let best = null;
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json') || f.includes('raw') || f.startsWith('gate_')) continue;
      if (f.startsWith('qwen_')) continue; // 迁移实验产物不自动当 G2 基线(显式 source_file 才用)
      const fp = path.join(dir, f);
      const st = fs.statSync(fp);
      if (!best || st.mtimeMs > best.mtimeMs) best = { fp, mtimeMs: st.mtimeMs };
    }
  }
  return best?.fp || null;
}

function summarizeEvalJson(data, opts = {}) {
  if (!data) return null;
  const scoreMode = opts.score_mode || 'all';
  const primaryJudge = opts.primary_judge || 'MiniMax-Text-01';
  let total = 0;
  let green = 0;
  let greenPrimary = 0;
  const caseRows = [];

  const scoreCase = (c, mode) => {
    const judges = c.perJudge || [];
    if (judges.length) {
      if (mode === 'primary') {
        const pj = judges.find(j => j.model === primaryJudge);
        return pj ? pj.correct === true : judges.every(j => j.correct === true);
      }
      return judges.every(j => j.correct === true);
    }
    if (c.correct === true) return true;
    const rate = c.all_green_rate ?? c.pass_rate;
    if (typeof rate === 'number' && rate >= 1) return true;
    if (c.perAssert || c.per_assert) {
      const rates = Object.values(c.perAssert || c.per_assert).map(a => a.rate);
      return rates.length > 0 && rates.every(r => r >= 1);
    }
    if (c.byModel) {
      return c.byModel.every(m => (m.all_green?.pass ?? 0) === (m.all_green?.total ?? 0));
    }
    return false;
  };

  const pushCase = (c) => {
    total++;
    const passAll = scoreCase(c, 'all');
    const passPrimary = scoreCase(c, 'primary');
    if (passAll) green++;
    if (passPrimary) greenPrimary++;
    caseRows.push({
      id: c.id,
      pass: passAll,
      pass_primary: passPrimary,
      failures: passAll ? [] : ['eval 未全绿'],
    });
  };

  if (Array.isArray(data.cases)) {
    for (const c of data.cases) pushCase(c);
  }

  const blocks = [];
  if (data.results) blocks.push(...(Array.isArray(data.results) ? data.results : [data.results]));
  if (data.prompts && typeof data.prompts === 'object') {
    for (const p of Object.values(data.prompts)) {
      if (p?.cases) blocks.push({ cases: p.cases });
    }
  }
  for (const block of blocks) {
    for (const c of block.cases || []) pushCase(c);
  }

  const passRateAll = total ? green / total : null;
  const passRatePrimary = total ? greenPrimary / total : null;
  const passRate = scoreMode === 'primary' ? passRatePrimary : passRateAll;
  const greenCount = scoreMode === 'primary' ? greenPrimary : green;

  return {
    total,
    green: greenCount,
    green_all: green,
    green_primary: greenPrimary,
    pass_rate: passRate,
    pass_rate_all: passRateAll,
    pass_rate_primary: passRatePrimary,
    score_mode: scoreMode,
    primary_judge: primaryJudge,
    cases: caseRows,
  };
}

function loadG2Opts() {
  try {
    const { loadGateConfig } = require('../lib/paths');
    const g2 = loadGateConfig().gates?.G2_prompt_pass || {};
    return {
      score_mode: g2.score_mode || 'all',
      primary_judge: g2.primary_judge || 'MiniMax-Text-01',
      source_file: g2.source_file || null,
    };
  } catch {
    return { score_mode: 'all', primary_judge: 'MiniMax-Text-01' };
  }
}

function runPromptHarness() {
  const g2Pre = loadG2Opts();
  const latest = findLatestResult(g2Pre.source_file);
  if (latest) {
    try {
      const data = JSON.parse(fs.readFileSync(latest, 'utf8'));
      const g2Opts = g2Pre;
      const sum = summarizeEvalJson(data, g2Opts);
      if (sum && sum.total > 0) {
        const pass = sum.pass_rate === 1;
        const primaryNote = sum.pass_rate_primary != null
          ? ` · 主裁判 ${sum.green_primary}/${sum.total} (${Math.round(sum.pass_rate_primary * 100)}%)`
          : '';
        return {
          layer: 'prompt',
          status: 'cached',
          source: path.relative(REPO_ROOT, latest),
          cases: sum.total,
          green: sum.green,
          green_all: sum.green_all,
          green_primary: sum.green_primary,
          pass_rate: sum.pass_rate,
          pass_rate_all: sum.pass_rate_all,
          pass_rate_primary: sum.pass_rate_primary,
          score_mode: sum.score_mode,
          primary_judge: sum.primary_judge,
          gates: { G2_prompt_pass: pass },
          pass,
          message: pass
            ? `L1 缓存报告 ${sum.green}/${sum.total} 全绿（${sum.score_mode}）${sum.score_mode === 'primary' && sum.green_all !== sum.green ? ` · 双裁判 ${sum.green_all}/${sum.total}` : ''}${primaryNote}`
            : `L1 缓存报告 ${sum.green}/${sum.total} 通过（${path.basename(latest)}，${sum.score_mode} 计分未全绿${primaryNote}）`,
          cases_detail: sum.cases,
        };
      }
    } catch (_) {}
  }
  return {
    layer: 'prompt',
    status: 'stub',
    message: `无 eval 结果缓存。运行: cd eval/evals && node run.js --prompts P1,P2,P3,P4,P6,P7 --n 3`,
    eval_runner: DEFAULTS.evalRunner,
    gates: { G2_prompt_pass: null },
    pass: null,
  };
}

module.exports = { runPromptHarness, summarizeEvalJson, loadG2Opts };
