import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '../..');
export const RAW_DIR = path.join(ROOT, 'public-data-corpus/raw');
export const STATE_PATH = path.join(__dirname, 'state.json');
export const KB_DIR = path.join(ROOT, 'prototype/data/kb');
export const CORPUS_KB_DIR = path.join(ROOT, 'public-data-corpus/kb');

export const CONFIG = {
  userAgent: 'Yingyan-KB-Crawler/1.0 (+https://github.com/rachelzzz1921/yingyan; policy-research)',
  delayMinMs: 2000,
  delayMaxMs: 4000,
  maxRetries: 3,
  timeoutMs: 45000,
  verifyStatus: '✅爬虫入库(待人工抽检)',
  protectedVerifyPrefixes: ['✅已核实'],
  // 目录类 parser 的 demo 截断开关：默认只保留演示药品（黑客松省体积）。
  // 设 KB_FULL_IMPORT=1 可解除截断跑全量目录行（配合质量门使用）。
  fullImport: process.env.KB_FULL_IMPORT === '1',
};

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function randomDelay() {
  const { delayMinMs, delayMaxMs } = CONFIG;
  return sleep(delayMinMs + Math.random() * (delayMaxMs - delayMinMs));
}
