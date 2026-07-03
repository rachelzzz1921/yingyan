#!/usr/bin/env node
'use strict';
/** Headless UI walkthrough — triggers debug-ui.js instrumentation on all entry pages */
const path = require('path');
const puppeteer = require(path.join(__dirname, '../prototype/app/node_modules/puppeteer'));

const BASE = process.env.BASE || 'http://localhost:3700';
const LOG = path.join(__dirname, '../.cursor/debug-449912.log');
const steps = [];
let failed = 0;

function note(name, ok, detail) {
  steps.push({ name, ok, detail });
  console.log(ok ? `  ✓ ${name}` : `  ✗ ${name}${detail ? ': ' + detail : ''}`);
  if (!ok) failed += 1;
}

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('walk-pathway-ui @', BASE);
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(45000);

  page.on('pageerror', (err) => note('pageerror', false, err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') note('console.error', false, msg.text().slice(0, 120));
  });

  try {
    await page.goto(`${BASE}/home.html`, { waitUntil: 'networkidle2' });
    note('home.html load', page.url().includes('home.html'));

    await page.click('a.card.reg');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    note('监管侧入口', page.url().includes('role=audit'));

    await page.waitForSelector('#btnAudit', { visible: true });
    await page.click('#btnAudit');
    await page.waitForFunction(() => {
      const el = document.querySelector('#findingsList, .panel-right, .finding-card');
      return el && (el.querySelector('.act.adopt') || el.textContent.includes('疑点'));
    }, { timeout: 30000 });
    note('工作台稽核完成', true);

    const adoptBtn = await page.$('.act.adopt');
    if (adoptBtn) {
      await adoptBtn.click();
      await wait(1500);
      note('finding 采纳', true);
    } else {
      note('finding 采纳', false, 'no .act.adopt button');
    }

    await page.goto(`${BASE}/intake.html`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('#btnRun');
    note('intake.html load', page.url().includes('intake.html'));

    await page.goto(`${BASE}/priority.html`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('#queueBody tr', { timeout: 20000 });
    const rowCount = await page.$$eval('#queueBody tr', (rows) => rows.length);
    note('priority 队列渲染', rowCount > 0, `rows=${rowCount}`);

    await page.click('.btn-detail');
    await page.waitForSelector('#detailPanel:not(.hidden)', { timeout: 10000 });
    const wbHref = await page.$eval('#btnOpenWorkbench', (a) => a.href);
    note('详情面板工作台链接', wbHref.includes('case='), wbHref);

    await page.goto(`${BASE}/dashboard.html#overview`, { waitUntil: 'networkidle2' });
    await wait(800);
    note('dashboard #overview', (await locationHash(page)) === 'overview');

    for (const hash of ['batch', 'priority', 'tasks', 'yhf']) {
      await page.goto(`${BASE}/dashboard.html#${hash}`, { waitUntil: 'networkidle2' });
      await wait(900);
      note(`dashboard #${hash}`, (await locationHash(page)) === hash);
    }

    await page.goto(`${BASE}/?role=hospital`, { waitUntil: 'networkidle2' });
    note('院端工作台', page.url().includes('role=hospital'));
  } catch (e) {
    note('walkthrough exception', false, e.message);
  } finally {
    await wait(1200);
    await browser.close();
  }

  console.log(failed ? `\nFAIL (${failed})` : '\nPASS');
  process.exit(failed ? 1 : 0);
}

function locationHash(page) {
  return page.evaluate(() => location.hash.replace(/^#/, '') || 'overview');
}

main().catch((e) => { console.error(e); process.exit(1); });
