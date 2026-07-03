#!/usr/bin/env node
/**
 * 检查 A4 传单每页是否溢出
 */
const path = require('path');
const puppeteer = require(path.join(__dirname, '../prototype/app/node_modules/puppeteer'));

const EDGE = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
const fs = require('fs');

const html = process.argv[2] || path.join(__dirname, '../assets/posters/yingyan-rule-architecture-flyer.html');
const fileUrl = `file://${html}`;

(async () => {
  const launchOpts = { headless: 'new', args: ['--no-sandbox'] };
  if (fs.existsSync(EDGE)) launchOpts.executablePath = EDGE;
  const browser = await puppeteer.launch(launchOpts);
  const page = await browser.newPage();
  await page.goto(fileUrl, { waitUntil: 'networkidle0' });
  const results = await page.evaluate(() => {
    return [...document.querySelectorAll('.page')].map((el, i) => {
      const content = el.querySelector('.content') || el;
      return {
        page: i + 1,
        scrollHeight: content.scrollHeight,
        clientHeight: content.clientHeight,
        overflow: content.scrollHeight - content.clientHeight,
      };
    });
  });
  await browser.close();
  let ok = true;
  for (const r of results) {
    const pass = r.overflow <= 0;
    if (!pass) ok = false;
    console.log(`P${r.page}: scroll=${r.scrollHeight} client=${r.clientHeight} overflow=${r.overflow} ${pass ? 'OK' : 'FAIL'}`);
  }
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
