#!/usr/bin/env node
'use strict';
/**
 * E2E: demo fee asset → intake batch → fee_list.items[].anchor.bbox
 * Usage: node scripts/verify-intake-bbox.js [--base http://127.0.0.1:3700] [--pdf]
 */
const fs = require('fs');
const path = require('path');

const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://127.0.0.1:3700';
const usePdf = !process.argv.includes('--png');

const SAMPLES = path.join(__dirname, '../prototype/data/intake_samples');
const DEMO = path.join(SAMPLES, usePdf ? 'fee_list_demo.pdf' : 'fee_list_demo.png');
const MIME = usePdf ? 'application/pdf' : 'image/png';

async function main() {
  if (!fs.existsSync(DEMO)) {
    console.error('Missing demo file. Run: python3 scripts/generate-fee-demo-image.py');
    process.exit(1);
  }
  const b64 = fs.readFileSync(DEMO).toString('base64');
  const health = await fetch(`${BASE}/api/health`).then(r => r.json()).catch(() => ({}));
  console.log('health ppstructure:', health.ppstructure?.reachable ? health.ppstructure.recommended_engine : 'down');

  const r = await fetch(`${BASE}/api/intake/batch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      merge: false,
      files: [{
        name: path.basename(DEMO),
        mime: MIME,
        fileBase64: b64,
        slotOverride: 'fee_list',
      }],
    }),
  }).then(x => x.json());

  if (!r.ok || !r.record) {
    console.error('FAIL batch:', r.error || r.errors?.join('; ') || JSON.stringify(r));
    process.exit(1);
  }

  const items = r.record.fee_list?.items || [];
  const withBbox = items.filter(it => Array.isArray(it.anchor?.bbox) && it.anchor.bbox.length === 4);
  console.log('fee rows:', items.length, '| with bbox:', withBbox.length);
  if (withBbox.length === 0) {
    console.error('FAIL: no fee_list.items[].anchor.bbox');
    if (items[0]) console.error('sample:', JSON.stringify(items[0], null, 2));
    process.exit(1);
  }
  console.log('PASS bbox:', withBbox[0].item_name, withBbox[0].anchor.bbox);
  if (process.argv.includes('--png')) {
    const r2 = await fetch(`${BASE}/api/intake/batch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        merge: false,
        files: [{
          name: 'fee_list_demo.png',
          mime: 'image/png',
          fileBase64: fs.readFileSync(path.join(SAMPLES, 'fee_list_demo.png')).toString('base64'),
          slotOverride: 'fee_list',
        }],
      }),
    }).then(x => x.json());
    const pngBbox = (r2.record?.fee_list?.items || []).filter(it => it.anchor?.bbox?.length === 4).length;
    if (pngBbox > 0) console.log('PASS PNG bbox rows:', pngBbox);
    else console.warn('WARN PNG bbox: 需 brew install tesseract tesseract-lang（扫描图 OCR）');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
