import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { CONFIG, RAW_DIR, randomDelay, sleep } from '../config.mjs';

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

export async function fetchText(url, opts = {}) {
  const res = await fetchWithRetry(url, opts);
  return res.text();
}

export async function fetchBuffer(url, opts = {}) {
  const res = await fetchWithRetry(url, opts);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

async function fetchWithRetry(url, opts = {}) {
  let lastErr;
  let count403 = 0;
  for (let i = 0; i < CONFIG.maxRetries; i++) {
    try {
      await randomDelay();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), CONFIG.timeoutMs);
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          'User-Agent': CONFIG.userAgent,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          ...(opts.headers || {}),
        },
        redirect: 'follow',
      });
      clearTimeout(timer);
      if (res.status === 403) {
        count403++;
        const err = new Error(`HTTP 403 for ${url}`);
        err.code = 'HTTP_403';
        err.count403 = count403;
        throw err;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res;
    } catch (e) {
      lastErr = e;
      await sleep(1500 * (i + 1));
    }
  }
  throw lastErr;
}

export async function downloadToRaw(url, hintExt = '') {
  ensureDir(RAW_DIR);
  const buf = await fetchBuffer(url);
  const hash = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
  let ext = hintExt;
  if (!ext) {
    const m = url.match(/\.(xlsx|xls|pdf|doc|docx)(?:\?|$)/i);
    ext = m ? m[1].toLowerCase() : 'bin';
  }
  const fname = `${hash}.${ext}`;
  const fpath = path.join(RAW_DIR, fname);
  if (!fs.existsSync(fpath)) fs.writeFileSync(fpath, buf);
  return { path: fpath, hash, size: buf.length, ext };
}

export function resolveUrl(base, href) {
  if (!href) return null;
  if (href.startsWith('http')) return href;
  if (href.startsWith('//')) return `https:${href}`;
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}
