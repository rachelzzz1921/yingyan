#!/usr/bin/env node
/** 从 official catalog 生成 workflow_messages_official 草稿（人工审阅后覆盖） */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(path.join(ROOT, 'prototype/app/package.json'));
const yaml = require('js-yaml');

const CATALOG = path.join(ROOT, 'prototype/data/kb/official_rules_catalog.json');
const OUT = path.join(ROOT, 'prototype/data/rules/workflow_messages_official.yaml');

function tier1Label(id) {
  return ({ policy: '政策类', management: '管理类', medical: '医疗类' })[id] || '管理类';
}

const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
const doc = {};
for (const r of catalog.rules_flat) {
  const tone = r.tier1_id === 'medical' ? 'suggest' : 'block';
  const short = (r.name || '').replace(/^-管理要求/, '').slice(0, 30);
  doc[r.official_code] = {
    official: { gz_codes: [r.official_code], tier1: tier1Label(r.tier1_id), tier2: r.tier2 },
    effective_interval: { from: '2023-05-15', to: null },
    workflow_messages: {
      precheck: { tone, title: short.slice(0, 18), body: `可能违反「${short}」，请核对。`, disposal: tone === 'block' ? '请修正后再提交。' : '请补充依据。' },
      during: { basis: r.definition || r.name, action: '拒付或移交复核', denial_text: `违反${short}监管要求。` },
      post_audit: { lead: short, evidence_hint: '费用明细 + 病案 + 政策依据' },
    },
  };
}
fs.writeFileSync(OUT, yaml.dump(doc, { lineWidth: 100 }), 'utf8');
console.log(`✅ ${Object.keys(doc).length} entries → workflow_messages_official.yaml`);
