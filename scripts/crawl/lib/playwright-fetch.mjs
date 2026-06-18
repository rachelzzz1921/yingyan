#!/usr/bin/env node
/**
 * Playwright 403 降级桩（手动触发）
 * 用法: node lib/playwright-fetch.mjs <url>
 * 需: npm install -D playwright && npx playwright install chromium
 */
import { fetchText } from './fetch.mjs';

const url = process.argv[2];
if (!url) {
  console.error('用法: node lib/playwright-fetch.mjs <url>');
  process.exit(1);
}

try {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const html = await page.content();
  await browser.close();
  console.log(html.slice(0, 500));
  console.log(`\n✅ Playwright 抓取成功，共 ${html.length} 字节`);
} catch (e) {
  console.warn('Playwright 不可用，回退 fetch:', e.message);
  const html = await fetchText(url);
  console.log(html.slice(0, 500));
}
