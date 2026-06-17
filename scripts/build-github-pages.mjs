#!/usr/bin/env node
/**
 * 构建 GitHub Pages 静态预览：复制前端 + 烘焙 API JSON（临时起 server 拉快照）。
 * 输出目录：gh-pages-build/
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'prototype/app');
const PUBLIC = path.join(APP, 'public');
const OUT = path.join(ROOT, 'gh-pages-build');
const API_OUT = path.join(OUT, 'api-static');

const REPO = process.env.GITHUB_REPOSITORY || 'rachelzzz1921/yingyan';
const PAGES_BASE = '/' + REPO.split('/')[1] + '/';
const PORT = process.env.PAGES_EXPORT_PORT || '3877';
const ORIGIN = `http://127.0.0.1:${PORT}`;

function rmrf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(fp, obj) {
  mkdirp(path.dirname(fp));
  fs.writeFileSync(fp, JSON.stringify(obj, null, 0), 'utf8');
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitHealth(timeoutMs = 90000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(`${ORIGIN}/api/health`);
      if (r.ok) return;
    } catch (_) {}
    await sleep(400);
  }
  throw new Error('prototype server 未在时限内启动');
}

function startServer() {
  return spawn('node', ['server.js'], {
    cwd: APP,
    env: {
      ...process.env,
      PORT: String(PORT),
      // 构建快照不走真 LLM，避免 CI/本地 export 卡住
      MINIMAX_API_KEY: '',
      ANTHROPIC_API_KEY: '',
      STEPFUN_API_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function getJson(pathname, opts) {
  const r = await fetch(ORIGIN + pathname, opts);
  if (!r.ok) throw new Error(`${pathname} → ${r.status}`);
  return r.json();
}

async function saveGet(name, pathname) {
  const data = await getJson(pathname);
  writeJson(path.join(API_OUT, name), data);
  return data;
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  mkdirp(dest);
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function patchHtml(file) {
  let html = fs.readFileSync(file, 'utf8');
  if (!html.includes('<base ')) {
    html = html.replace(
      /<head>/i,
      `<head>\n<base href="${PAGES_BASE}">`
    );
  }
  if (!html.includes('pages-shim.js')) {
    html = html.replace(
      /<script/i,
      '<script src="pages-shim.js"></script>\n<script'
    );
  }
  fs.writeFileSync(file, html, 'utf8');
}

async function exportApiSnapshot() {
  const child = startServer();
  let stderr = '';
  child.stderr.on('data', (c) => { stderr += c; });

  try {
    await waitHealth(120000);

    await saveGet('health.json', '/api/health');
    await saveGet('rules.json', '/api/rules');
    const cases = await saveGet('cases.json', '/api/cases');
    await saveGet('rule-governance.json', '/api/rule-governance');
    await saveGet('bench.json', '/api/bench');
    await saveGet('yhf.json', '/api/yhf');
    await saveGet('institution.json', '/api/institution');
    await saveGet('tasks.json', '/api/tasks');
    await saveGet('kb-status.json', '/api/kb/status');
    await saveGet('maturity.json', '/api/maturity');
    await saveGet('review.json', '/api/review');
    await saveGet('rule-precipitation.json', '/api/rule-precipitation');
    await saveGet('caseobject.json', '/api/caseobject');
    await saveGet('eval-status.json', '/api/eval/status');
    await saveGet('eval-drafts.json', '/api/eval-drafts');
    await saveGet('brand-gpt-v2.json', '/api/brand/gpt-v2');
    await saveGet('governance-sync-status.json', '/api/governance/sync/status');
    await saveGet('audit-batch.json', '/api/audit/batch');
    await saveGet('connectors.json', '/api/connectors');
    await saveGet('intake-slots.json', '/api/intake/slots');

    const docs = await saveGet('docs/index.json', '/api/docs');
    for (const doc of docs.docs || []) {
      const id = doc.id;
      const full = await getJson(`/api/docs/${encodeURIComponent(id)}?full=1`);
      writeJson(path.join(API_OUT, 'docs', `${id}-full.json`), full);
      const brief = await getJson(`/api/docs/${encodeURIComponent(id)}`);
      writeJson(path.join(API_OUT, 'docs', `${id}.json`), brief);
    }

    const caseIds = (cases || []).map((c) => c.id).filter((id) => id !== 'uploaded');
    console.log('  ▸ 导出案卷与文档…');
    for (const id of caseIds) {
      const rec = await getJson(`/api/case?id=${encodeURIComponent(id)}`);
      writeJson(path.join(API_OUT, 'cases', `${id}.json`), rec);
      try {
        const rect = await getJson(`/api/rectification?case_id=${encodeURIComponent(id)}`);
        writeJson(path.join(API_OUT, 'rectification', `${id}.json`), rect);
      } catch (_) {
        writeJson(path.join(API_OUT, 'rectification', `${id}.json`), { entries: {} });
      }
    }

    const demoCases = caseIds.includes('main') ? ['main'] : caseIds.slice(0, 1);
    console.log('  ▸ 烘焙稽核报告…');
    for (const id of caseIds) {
      const rep = await getJson('/api/audit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ caseId: id }),
      });
      writeJson(path.join(API_OUT, 'audit', `${id}.json`), rep);
    }
    for (const id of demoCases) {
      for (const mode of ['super', 'llm']) {
        const rep = await getJson(`/api/audit?mode=${mode}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ caseId: id }),
        });
        writeJson(path.join(API_OUT, 'audit', `${id}-${mode}.json`), rep);
      }
      for (const mode of ['', 'super']) {
        const q = mode ? `?mode=${mode}` : '';
        const rep = await getJson(`/api/audit${q}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ caseId: id, inject: true }),
        });
        const suffix = mode ? `-${mode}-inject` : '-inject';
        writeJson(path.join(API_OUT, 'audit', `${id}${suffix}.json`), rep);
      }
    }
    // 非 demo 案卷的超級/LLM 模式回退到默认报告（Pages 只读演示够用）
    for (const id of caseIds) {
      if (demoCases.includes(id)) continue;
      const fallback = JSON.parse(fs.readFileSync(path.join(API_OUT, 'audit', `${id}.json`), 'utf8'));
      writeJson(path.join(API_OUT, 'audit', `${id}-super.json`), { ...fallback, report_meta: { ...fallback.report_meta, super_fused: true, preview_fallback: true } });
      writeJson(path.join(API_OUT, 'audit', `${id}-llm.json`), { ...fallback, report_meta: { ...fallback.report_meta, engine_mode: 'GitHub Pages 演示（回退默认引擎）', preview_fallback: true } });
    }

    console.log(`  ▸ API 快照：${caseIds.length} 案卷 · ${(docs.docs || []).length} 文档`);
  } finally {
    child.kill('SIGTERM');
    await sleep(300);
    if (child.exitCode === null) child.kill('SIGKILL');
    if (stderr && process.env.DEBUG) console.error(stderr);
  }
}

async function main() {
  console.log('\n  鹰眼 · 构建 GitHub Pages 预览');
  console.log(`  ▸ 站点前缀 ${PAGES_BASE}`);

  rmrf(OUT);
  mkdirp(OUT);
  copyDir(PUBLIC, OUT);
  copyDir(path.join(ROOT, 'assets/brand/gpt-v2'), path.join(OUT, 'brand/gpt-v2'));
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '', 'utf8');

  mkdirp(API_OUT);
  await exportApiSnapshot();

  for (const name of ['index.html', 'dashboard.html', 'intake.html']) {
    const fp = path.join(OUT, name);
    if (fs.existsSync(fp)) patchHtml(fp);
  }

  console.log(`  ▸ 输出 ${OUT}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
