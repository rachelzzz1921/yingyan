/** 从更新后的 a4-flyer HTML 重导 PDF + front/back/preview PNG（覆盖旧的 58/63 版本）· playwright */
const { chromium } = require('playwright');
const path = require('node:path');
const { copyFile } = require('node:fs/promises');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets/posters');
const SRC = 'file://' + path.join(OUT, 'yingyan-eagleeye-a4-flyer-v1.html');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1400 }, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  await page.goto(SRC, { waitUntil: 'networkidle', timeout: 60000 });
  await sleep(600);

  await page.pdf({
    path: path.join(OUT, 'yingyan-eagleeye-a4-flyer-v1.pdf'),
    format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' },
  });
  console.log('✓ PDF');

  const pages = await page.$$('.page');
  if (pages[0]) { await pages[0].screenshot({ path: path.join(OUT, 'yingyan-eagleeye-a4-flyer-v1-front.png') }); console.log('✓ front'); }
  if (pages[1]) { await pages[1].screenshot({ path: path.join(OUT, 'yingyan-eagleeye-a4-flyer-v1-back.png') }); console.log('✓ back'); }
  await copyFile(path.join(OUT, 'yingyan-eagleeye-a4-flyer-v1-front.png'), path.join(OUT, 'yingyan-eagleeye-a4-flyer-v1-preview.png'));
  console.log('✓ preview');

  await browser.close();
})().catch(e => { console.error('render 失败:', e.message); process.exit(1); });
