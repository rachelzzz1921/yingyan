'use strict';

/**
 * L1 Prompt Harness — 尝试读 eval/results 最新报告；无则返回 stub 指引。
 */

const fs = require('fs');
const path = require('path');
const { DEFAULTS, REPO_ROOT } = require('../lib/paths');

function findLatestResult() {
  const dirs = [
    path.join(REPO_ROOT, 'eval/results'),
    path.join(REPO_ROOT, 'yhf/results'),
  ];
  let best = null;
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json') || f.includes('raw')) continue;
      const fp = path.join(dir, f);
      const st = fs.statSync(fp);
      if (!best || st.mtimeMs > best.mtimeMs) best = { fp, mtimeMs: st.mtimeMs };
    }
  }
  return best?.fp || null;
}

function summarizeEvalJson(data) {
  if (!data) return null;
  const rows = data.results || (Array.isArray(data.cases) ? [{ cases: data.cases }] : []);
  let total = 0, green = 0;
  for (const block of rows) {
    for (const c of block.cases || []) {
      total++;
      const rate = c.all_green_rate ?? c.pass_rate;
      if (typeof rate === 'number' && rate >= 1) green++;
      else if (c.per_assert) {
        const rates = Object.values(c.per_assert).map(a => a.rate);
        if (rates.length && rates.every(r => r >= 1)) green++;
      }
    }
  }
  return { total, green, pass_rate: total ? green / total : null };
}

function runPromptHarness() {
  const latest = findLatestResult();
  if (latest) {
    try {
      const data = JSON.parse(fs.readFileSync(latest, 'utf8'));
      const sum = summarizeEvalJson(data);
      if (sum && sum.total > 0) {
        const pass = sum.pass_rate === 1;
        return {
          layer: 'prompt',
          status: 'cached',
          source: path.relative(REPO_ROOT, latest),
          cases: sum.total,
          pass_rate: sum.pass_rate,
          gates: { G2_prompt_pass: pass },
          pass,
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

module.exports = { runPromptHarness };
