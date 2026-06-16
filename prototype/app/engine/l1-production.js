'use strict';

/**
 * L1 sidecar 生产就绪检查（iter-26 · 共享 server API 与 CLI）
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_PP = path.resolve(__dirname, '../../ppstructure');

async function fetchHealth(url, timeoutMs = 3000) {
  if (typeof fetch !== 'function') return { reachable: false, error: 'no fetch' };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(`${url.replace(/\/$/, '')}/health`, { signal: ctrl.signal });
    clearTimeout(t);
    const data = await r.json().catch(() => ({}));
    return { reachable: r.ok, ...data, status: r.status };
  } catch (e) {
    return { reachable: false, error: e.message };
  }
}

function checkPython() {
  try {
    const py = execSync('python3 --version', { encoding: 'utf8' }).trim();
    const m = py.match(/(\d+)\.(\d+)/);
    const major = m ? Number(m[1]) : 99;
    const minor = m ? Number(m[2]) : 0;
    const paddleReady = major < 3 || (major === 3 && minor <= 12);
    return { ok: true, version: py, paddle_ready: paddleReady, recommended: paddleReady ? 'ppstructure|lite' : 'lite|tesseract' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function checkTesseract() {
  try {
    const v = execSync('tesseract --version', { encoding: 'utf8' }).split('\n')[0];
    return { ok: true, version: v };
  } catch {
    return { ok: false, hint: 'brew install tesseract tesseract-lang' };
  }
}

async function runL1ProductionCheck(opts = {}) {
  const url = opts.url || process.env.PPSTRUCTURE_URL || 'http://127.0.0.1:8787';
  const checks = [];

  const py = checkPython();
  checks.push({
    id: 'python',
    pass: py.ok,
    detail: py.version || py.error,
    paddle_ready: py.paddle_ready,
  });

  const runSh = fs.existsSync(path.join(REPO_PP, 'run.sh'));
  const docker = fs.existsSync(path.join(REPO_PP, 'Dockerfile'));
  checks.push({ id: 'deploy_assets', pass: runSh, detail: `run.sh=${runSh} docker=${docker}` });

  const health = await fetchHealth(url);
  checks.push({
    id: 'sidecar_health',
    pass: !!health.reachable,
    detail: health.reachable
      ? `engine=${health.recommended_engine || health.engine || '?'}`
      : (health.error || '未启动'),
    engine: health.recommended_engine || health.engine,
  });

  const tess = checkTesseract();
  checks.push({ id: 'tesseract', pass: tess.ok, detail: tess.version || tess.hint });

  const passCount = checks.filter(c => c.pass).length;
  const productionTier = health.recommended_engine === 'ppstructure' ? 'full'
    : (health.reachable ? 'lite' : 'offline');

  return {
    url,
    production_tier: productionTier,
    pass: passCount,
    warn: checks.length - passCount,
    checks,
    ready_for_demo: health.reachable,
    ready_for_production_scan: health.recommended_engine === 'ppstructure' && tess.ok,
    hint: productionTier === 'lite'
      ? '扫描件生产建议 Docker(Python3.12) + install-paddle.sh'
      : (productionTier === 'offline' ? 'bash prototype/ppstructure/run.sh 或 docker compose up' : null),
  };
}

module.exports = { runL1ProductionCheck, fetchHealth, checkPython, checkTesseract };
