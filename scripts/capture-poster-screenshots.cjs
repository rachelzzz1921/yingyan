#!/usr/bin/env node
/** 抓取现场海报用产品截图 · 需 localhost:3700 已启动 */
const puppeteer = require('../prototype/app/node_modules/puppeteer');
const { mkdir, copyFile } = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets/posters/yingyan-print-pack/assets');
const PPT_OUT = path.join(ROOT, 'docs/deliverables/ppt/images');
const BASE = process.env.YINGYAN_BASE || 'http://localhost:3700';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function ensureDirs() {
  await mkdir(OUT, { recursive: true });
  await mkdir(PPT_OUT, { recursive: true });
}

async function waitAudit(page) {
  await page.waitForFunction(() => {
    const body = document.getElementById('reportBody');
    return body && !body.classList.contains('hidden');
  }, { timeout: 45000 });
  await sleep(800);
}

async function switchReportTab(page, idx) {
  await page.evaluate((i) => {
    document.querySelectorAll('#reportPagerNav .pager-tab')[i]?.click();
  }, idx);
  await sleep(500);
}

async function capture(page, file, opts = {}) {
  const full = path.join(OUT, file);
  await page.screenshot({ path: full, type: 'png', ...opts });
  if (file.includes('14-workbench-findings')) {
    await copyFile(full, path.join(OUT, '13-workbench.png'));
    await copyFile(full, path.join(PPT_OUT, '13-workbench.png'));
  }
  if (file.includes('15-priority-queue')) {
    await copyFile(full, path.join(OUT, '25-priority.png'));
    await copyFile(full, path.join(PPT_OUT, '25-priority.png'));
  }
  console.log('✓', full);
}

async function main() {
  await ensureDirs();
  const browser = await puppeteer.launch({ headless: 'new', defaultViewport: null });
  const page = await browser.newPage();
  await page.setViewport({ width: 1680, height: 1050, deviceScaleFactor: 2 });

  await page.goto(`${BASE}/?role=audit&case=main`, { waitUntil: 'networkidle2' });
  await page.click('#btnAudit');
  await waitAudit(page);
  await switchReportTab(page, 1);
  await page.evaluate(() => document.querySelector('#page-findings .finding')?.classList.add('open'));
  await sleep(400);
  await capture(page, '14-workbench-findings.png', { clip: { x: 0, y: 72, width: 1680, height: 920 } });

  await switchReportTab(page, 0);
  await sleep(300);
  await capture(page, '14-workbench-overview.png', { clip: { x: 0, y: 72, width: 1680, height: 920 } });

  await switchReportTab(page, 2);
  await sleep(300);
  await capture(page, '14-workbench-shield.png', { clip: { x: 680, y: 120, width: 980, height: 860 } });

  await page.goto(`${BASE}/priority.html`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('#queueTable tbody tr', { timeout: 30000 });
  await page.evaluate(() => {
    const g = document.getElementById('glossaryMount');
    if (g) g.style.display = 'none';
    document.getElementById('queueSection')?.scrollIntoView({ block: 'start' });
  });
  await sleep(600);
  await capture(page, '15-priority-queue.png', { clip: { x: 0, y: 68, width: 1680, height: 940 } });

  await page.goto(`${BASE}/?role=hospital&case=main`, { waitUntil: 'networkidle2' });
  await page.click('#btnAudit');
  await waitAudit(page);
  await switchReportTab(page, 1);
  await page.evaluate(() => document.querySelector('#page-findings .finding')?.classList.add('open'));
  await sleep(400);
  await capture(page, '16-hospital-exam.png', { clip: { x: 0, y: 72, width: 1680, height: 920 } });

  await page.goto(`${BASE}/home.html`, { waitUntil: 'networkidle2' });
  await sleep(400);
  await capture(page, '17-home-dual.png', { clip: { x: 0, y: 0, width: 1680, height: 980 } });

  await browser.close();
  console.log('\nDone →', OUT);
}

main().catch(e => { console.error(e); process.exit(1); });
