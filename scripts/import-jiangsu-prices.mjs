#!/usr/bin/env node
/**
 * 将 prototype/app/kb/jiangsu-prices.js 同步进 KB1 kb1_policies.json
 * 验收：A-105 / ICU-301 可引用 KB1-江苏-护理价格2025
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const KB_PATH = path.join(ROOT, 'prototype/data/kb/kb1_policies.json');
const modUrl = pathToFileURL(path.join(ROOT, 'prototype/app/kb/jiangsu-prices.js')).href;
const { POLICY_ENTRY, REF_ID } = await import(modUrl);

const kb = JSON.parse(fs.readFileSync(KB_PATH, 'utf8'));
const policies = kb.policies || kb.entries || [];
const idx = policies.findIndex((p) => p.ref_id === REF_ID);
const entry = { ...POLICY_ENTRY };
if (idx >= 0) policies[idx] = { ...policies[idx], ...entry };
else policies.push(entry);
if (kb.policies) kb.policies = policies;
else kb.entries = policies;

fs.writeFileSync(KB_PATH, JSON.stringify(kb, null, 2) + '\n');
console.log(`✅ KB1 已同步 ${REF_ID}`);
