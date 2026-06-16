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
 */
async function runJob(jobId, runOne) {
  if (running.has(jobId)) return getJob(jobId);
  const job = getJob(jobId);
  if (!job) throw new Error('job 不存在');
  if (job.status === 'done' || job.status === 'failed') return job;

  running.add(jobId);
  job.status = 'running';
  job.updated_at = new Date().toISOString();
  upsertJob(job);

  try {
    for (const caseId of job.case_ids) {
      if (job.results.some(r => r.id === caseId)) {
        job.done = job.results.length;
        continue;
      }
      try {
        const row = await runOne(caseId, job.mode);
        job.results.push(row);
      } catch (e) {
        job.failed += 1;
        job.errors.push({ case_id: caseId, error: e.message });
        job.results.push({ id: caseId, error: e.message, latency_ms: 0 });
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
    runJob(jobId, runOne).catch(() => {});
  });
  return getJob(jobId);
}

module.exports = {
  JOBS_PATH,
  createJob,
  getJob,
  listJobs,
  runJob,
  startJobAsync,
  rollupSummary,
};
