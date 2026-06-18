'use strict';

/**
 * 批量稽核队列 —— 多案卷顺序初筛 + 进度追踪（iter-24 T7-1）
 * 落盘 data/audit_batch_jobs.json，单机 demo 够用。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const JOBS_PATH = path.join(__dirname, '../../data/audit_batch_jobs.json');
const MAX_JOBS = 24;
const DEFAULT_CONCURRENCY = 3;
const MAX_CONCURRENCY = 8;
const running = new Set();

function loadStore() {
  try {
    return JSON.parse(fs.readFileSync(JOBS_PATH, 'utf8'));
  } catch {
    return { jobs: [] };
  }
}

function saveStore(store) {
  store.jobs = (store.jobs || []).slice(-MAX_JOBS);
  fs.mkdirSync(path.dirname(JOBS_PATH), { recursive: true });
  fs.writeFileSync(JOBS_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function listJobs(limit = 10) {
  const store = loadStore();
  return (store.jobs || []).slice(-limit).reverse();
}

function getJob(jobId) {
  const store = loadStore();
  return (store.jobs || []).find(j => j.id === jobId) || null;
}

function upsertJob(job) {
  const store = loadStore();
  const i = (store.jobs || []).findIndex(j => j.id === job.id);
  if (i >= 0) store.jobs[i] = job;
  else store.jobs.push(job);
  saveStore(store);
  return job;
}

function createJob(caseIds, options = {}) {
  const ids = [...new Set((caseIds || []).filter(Boolean))];
  if (!ids.length) throw new Error('caseIds 不能为空');
  const job = {
    id: `BATCH-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`,
    status: 'pending',
    mode: options.mode === 'oracle' ? 'oracle' : 'live',
    concurrency: Math.max(1, Math.min(Number(options.concurrency) || DEFAULT_CONCURRENCY, MAX_CONCURRENCY)),
    priority_ranked: !!options.priority_ranked,
    rank_meta: options.rank_meta || null,
    top_n: options.top_n || null,
    case_ids: ids,
    total: ids.length,
    done: 0,
    failed: 0,
    progress_pct: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    results: [],
    errors: [],
    summary: null,
  };
  upsertJob(job);
  return job;
}

function rollupSummary(results) {
  const clean = results.filter(r => r.is_clean);
  return {
    cases_run: results.length,
    suspected_total: results.reduce((s, r) => s + (r.found_suspected || 0), 0),
    clue_total: results.reduce((s, r) => s + (r.found_clue || 0), 0),
    shadow_total: results.reduce((s, r) => s + (r.shadow_count || 0), 0),
    clean_false_positives: clean.reduce((s, r) => s + (r.false_positives || 0), 0),
    avg_latency_ms: results.length
      ? Math.round(results.reduce((s, r) => s + (r.latency_ms || 0), 0) / results.length)
      : 0,
    red_line_clean_zero_fp: clean.every(r => (r.false_positives || 0) === 0),
  };
}

/**
 * @param {string} jobId
 * @param {(caseId: string) => Promise<object>} runOne
 * @param {{ concurrency?: number }} [options]
 */
async function runJob(jobId, runOne, options = {}) {
  if (running.has(jobId)) return getJob(jobId);
  const job = getJob(jobId);
  if (!job) throw new Error('job 不存在');
  if (job.status === 'done' || job.status === 'failed') return job;

  const concurrency = Math.max(1, Math.min(
    Number(options.concurrency ?? job.concurrency) || DEFAULT_CONCURRENCY,
    MAX_CONCURRENCY,
  ));

  running.add(jobId);
  job.status = 'running';
  job.concurrency = concurrency;
  job.updated_at = new Date().toISOString();
  upsertJob(job);

  try {
    const todo = job.case_ids.filter((caseId) => !job.results.some(r => r.id === caseId));
    for (let i = 0; i < todo.length; i += concurrency) {
      const chunk = todo.slice(i, i + concurrency);
      const rows = await Promise.all(chunk.map(async (caseId) => {
        try {
          return await runOne(caseId, job.mode);
        } catch (e) {
          return { id: caseId, error: e.message, latency_ms: 0 };
        }
      }));
      for (const row of rows) {
        if (row.error) {
          job.failed += 1;
          job.errors.push({ case_id: row.id, error: row.error });
        }
        job.results.push(row);
      }
      job.done = job.results.length;
      job.progress_pct = Math.round((job.done / job.total) * 100);
      job.updated_at = new Date().toISOString();
      upsertJob(job);
    }
    job.summary = rollupSummary(job.results.filter(r => !r.error));
    job.status = job.failed && job.failed >= job.total ? 'failed' : 'done';
  } catch (e) {
    job.status = 'failed';
    job.errors.push({ error: e.message });
  } finally {
    job.updated_at = new Date().toISOString();
    job.progress_pct = job.status === 'done' || job.status === 'failed' ? 100 : job.progress_pct;
    upsertJob(job);
    running.delete(jobId);
  }
  return getJob(jobId);
}

function startJobAsync(jobId, runOne) {
  setImmediate(() => {
    const job = getJob(jobId);
    runJob(jobId, runOne, { concurrency: job?.concurrency }).catch(() => {});
  });
  return getJob(jobId);
}

function renderBatchReportMarkdown(job) {
  if (!job) return '# 批量初筛\n\n任务不存在\n';
  const sum = job.summary || {};
  const lines = [
    '# 鹰眼 · 批量初筛报告',
    '',
    `- 任务 ID：\`${job.id}\``,
    `- 模式：**${job.mode}**（live=治理叠加 · oracle=纯引擎）`,
    `- 并发：**${job.concurrency ?? DEFAULT_CONCURRENCY}** 路并行`,
    job.priority_ranked ? `- 排序：**优先级队列**（tier→api_score）` : null,
    `- 状态：${job.status} · ${job.done}/${job.total} 案卷`,
    `- 生成时间：${job.updated_at || job.created_at}`,
    '',
    '## 汇总',
    '',
    `| 指标 | 值 |`,
    `|---|---|`,
    `| 疑点合计 | ${sum.suspected_total ?? '—'} |`,
    `| 线索合计 | ${sum.clue_total ?? '—'} |`,
    `| shadow 观察 | ${sum.shadow_total ?? '—'} |`,
    `| 干净误报 | ${sum.clean_false_positives ?? '—'} |`,
    `| G0 红线 | ${sum.red_line_clean_zero_fp ? '✅ PASS' : '❌ FAIL'} |`,
    `| 均时延 | ${sum.avg_latency_ms ?? '—'} ms |`,
    '',
    '## 案卷明细',
    '',
    '| 案卷 | 疑点 | 线索 | shadow | 时延 | 备注 |',
    '|---|---:|---:|---:|---:|---|',
  ].filter(Boolean);
  for (const r of job.results || []) {
    if (r.error) {
      lines.push(`| ${r.id} | — | — | — | — | ❌ ${r.error} |`);
    } else {
      lines.push(`| ${r.title || r.id} | ${r.found_suspected} | ${r.found_clue ?? 0} | ${r.shadow_count ?? 0} | ${r.latency_ms}ms | ${r.is_clean ? '🟢 干净' : '🔴 违规'} |`);
    }
  }
  lines.push('', '---', '*由鹰眼批量初筛队列自动生成 · 可打印为 PDF 或导入飞检台账*');
  return lines.filter(Boolean).join('\n');
}

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderBatchReportHtml(job) {
  if (!job) return '<!DOCTYPE html><html><body><p>任务不存在</p></body></html>';
  const sum = job.summary || {};
  const rows = (job.results || []).map(r => {
    if (r.error) {
      return `<tr class="err"><td>${escHtml(r.id)}</td><td colspan="5">❌ ${escHtml(r.error)}</td></tr>`;
    }
    return `<tr><td>${escHtml(r.title || r.id)}</td><td class="num">${r.found_suspected}</td><td class="num">${r.found_clue ?? 0}</td><td class="num">${r.shadow_count ?? 0}</td><td class="num">${r.latency_ms}ms</td><td>${r.is_clean ? '🟢 干净' : '🔴 违规'}</td></tr>`;
  }).join('');
  const g0 = sum.red_line_clean_zero_fp ? 'PASS' : 'FAIL';
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>鹰眼 · 批量初筛报告</title>
<style>
  :root{--ink:#0B2A4A;--iris:#2DD4BF;--line:#e2e8f0;--muted:#64748b}
  *{box-sizing:border-box} body{font-family:"Noto Sans SC",system-ui,sans-serif;margin:0;padding:32px;color:var(--ink);background:#f8fafc}
  .sheet{max-width:920px;margin:0 auto;background:#fff;border:1px solid var(--line);border-radius:12px;padding:28px 32px}
  h1{margin:0 0 8px;font-size:22px} .sub{color:var(--muted);font-size:13px;margin-bottom:20px}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0 24px}
  .kpi{border:1px solid var(--line);border-radius:10px;padding:12px;text-align:center}
  .kpi .n{font-size:22px;font-weight:800;font-variant-numeric:tabular-nums}
  .kpi .l{font-size:11px;color:var(--muted);margin-top:4px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{border-bottom:1px solid var(--line);padding:10px 8px;text-align:left}
  th{background:#f0f4f8;font-size:12px} .num{text-align:right;font-variant-numeric:tabular-nums}
  .err td{color:#b91c1c} .foot{margin-top:20px;font-size:11px;color:var(--muted)}
  .noprint{margin-bottom:16px} @media print{ .noprint{display:none!important} body{padding:0;background:#fff} .sheet{border:none;box-shadow:none} }
</style></head><body>
<div class="sheet">
  <div class="noprint"><button onclick="window.print()" style="padding:8px 16px;border-radius:8px;border:1px solid var(--ink);background:var(--ink);color:#fff;font-weight:700;cursor:pointer">🖨 打印 / 另存为 PDF</button></div>
  <h1>鹰眼 · 批量初筛报告</h1>
  <p class="sub">任务 ${escHtml(job.id)} · 模式 ${escHtml(job.mode)} · 并发 ${job.concurrency ?? DEFAULT_CONCURRENCY}${job.priority_ranked ? ' · 优先级排序' : ''} · ${job.done}/${job.total} 案卷 · ${escHtml(job.updated_at || job.created_at)}</p>
  <div class="kpis">
    <div class="kpi"><div class="n">${sum.suspected_total ?? 0}</div><div class="l">疑点合计</div></div>
    <div class="kpi"><div class="n">${sum.clue_total ?? 0}</div><div class="l">线索合计</div></div>
    <div class="kpi"><div class="n">${sum.shadow_total ?? 0}</div><div class="l">shadow</div></div>
    <div class="kpi"><div class="n">${g0}</div><div class="l">G0 红线</div></div>
  </div>
  <table><thead><tr><th>案卷</th><th class="num">疑点</th><th class="num">线索</th><th class="num">shadow</th><th class="num">时延</th><th>备注</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="6">无结果</td></tr>'}</tbody></table>
  <p class="foot">由鹰眼批量初筛队列生成 · 浏览器「打印 → 另存为 PDF」即可下发院端</p>
</div></body></html>`;
}

module.exports = {
  JOBS_PATH,
  DEFAULT_CONCURRENCY,
  MAX_CONCURRENCY,
  createJob,
  getJob,
  listJobs,
  runJob,
  startJobAsync,
  rollupSummary,
  renderBatchReportMarkdown,
  renderBatchReportHtml,
};
