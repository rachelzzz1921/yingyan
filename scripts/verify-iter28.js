#!/usr/bin/env node
'use strict';

const http = require('http');

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:3700${path}`, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

async function main() {
  const { status, body } = await get('/api/export/institution?format=html');
  if (status !== 200) {
    console.error('❌ institution HTML export status', status);
    process.exit(1);
  }
  if (!body.includes('window.print') || !body.includes('院端体检报告')) {
    console.error('❌ institution HTML 报告不完整');
    process.exit(1);
  }
  console.log('✅ institution HTML/PDF export PASS');

  const bench = JSON.parse((await get('/api/bench')).body);
  if (bench.meta?.total_cases !== 22 || !bench.meta?.red_line_clean_zero_fp) {
    console.error('❌ bench 案卷数或 G0 异常', bench.meta);
    process.exit(1);
  }
  console.log('✅ bench 22 案卷 G0 PASS');
}

main().catch((e) => {
  console.error('❌ verify-iter28:', e.message);
  process.exit(1);
});
