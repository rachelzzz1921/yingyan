#!/usr/bin/env node
'use strict';

/**
 * 规则沉淀 Agent demo（默认 template，无 LLM 额度）
 * 用法：node scripts/demo-rule-precipitation.js [--llm]
 */
const fs = require('fs');
const path = require('path');

(function loadEnv() {
  const envPath = path.resolve(__dirname, '../prototype/app/.env');
  try {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const s = line.trim();
      if (!s || s.startsWith('#') || !s.includes('=')) continue;
      const i = s.indexOf('=');
      const k = s.slice(0, i).trim();
      const v = s.slice(i + 1).trim();
      if (k && !process.env[k]) process.env[k] = v;
    }
  } catch {}
})();

const DATA = path.resolve(__dirname, '../prototype/data');
const { runRejectPrecipitationAgent } = require('../prototype/app/engine/rule-precipitation-agent');
const { isReady } = require('../prototype/app/engine/llm-provider');

const rules = JSON.parse(fs.readFileSync(path.join(DATA, 'rules/rules.json'), 'utf8')).rules;
const rule = rules.find(r => r.rule_id === 'A-105');
if (!rule) {
  console.error('❌ 找不到 A-105');
  process.exit(1);
}

const feedback = [
  { action: '驳回', reason: 'MockHIS 二级护理 12 元/日为演示占位，非超标准', case_id: 'clean', ts: '2026-06-10' },
  { action: '驳回', reason: '患者 ICU 期间不应重复计一般护理', case_id: 'icu', ts: '2026-06-11' },
  { action: '驳回', reason: '医嘱已停二级护理，费用仍计', case_id: 'main', ts: '2026-06-12' },
];

const stats = { rejected: 3, effective_rejected: 3, adopted: 0 };

async function main() {
  const useLlm = process.argv.includes('--llm');
  if (useLlm && !isReady()) {
    console.error('❌ --llm 需要 MINIMAX_API_KEY 或 ANTHROPIC_API_KEY');
    process.exit(1);
  }

  const draft = await runRejectPrecipitationAgent(rule, feedback, stats, 'shadow');
  console.log('track:', draft.track);
  console.log('agent_mode:', draft.agent_mode);
  console.log('recommendation:', draft.recommendation);
  console.log('rationale:', draft.rationale);
  if (draft.patches?.exclusions_append) console.log('patches:', draft.patches);
  console.log('test_cases:', (draft.suggested_test_cases || []).length);
  console.log('\n✅ 规则沉淀 demo PASS（' + (draft.agent_mode || 'template') + '）');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
