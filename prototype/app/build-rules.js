/**
 * 构建脚本：rules.yaml → rules.json
 * rules.yaml 是单一事实来源（人读+机读规范）；rules.json 是运行时产物（零依赖加载）。
 * 用法：node build-rules.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { enrichRulesDoc } = require('./engine/rule-catalog');

const YAML_PATH = path.resolve(__dirname, '../data/rules/rules.yaml');
const JSON_PATH = path.resolve(__dirname, '../data/rules/rules.json');
const CORE_TC_PATH = path.resolve(__dirname, '../data/rules/core_test_cases.json');
const WORKFLOW_PATH = path.resolve(__dirname, '../data/rules/workflow_messages.yaml');
const WORKFLOW_OFFICIAL_PATH = path.resolve(__dirname, '../data/rules/workflow_messages_official.yaml');
const GZ_MAPPING_PATH = path.resolve(__dirname, '../data/rules/rule_gz_mapping.yaml');

function loadWorkflowOverlay() {
  const out = {};
  if (fs.existsSync(WORKFLOW_PATH)) Object.assign(out, yaml.load(fs.readFileSync(WORKFLOW_PATH, 'utf8')) || {});
  return out;
}

function loadOfficialWorkflowByRuleId() {
  if (!fs.existsSync(WORKFLOW_OFFICIAL_PATH) || !fs.existsSync(GZ_MAPPING_PATH)) return {};
  const official = yaml.load(fs.readFileSync(WORKFLOW_OFFICIAL_PATH, 'utf8')) || {};
  const mapping = yaml.load(fs.readFileSync(GZ_MAPPING_PATH, 'utf8')) || {};
  const byRule = {};
  for (const m of mapping.mappings || []) {
    const wf = official[m.official_code];
    if (!wf) continue;
    for (const rid of m.eagle_rule_ids || []) {
      if (!byRule[rid]) byRule[rid] = { ...wf, official: { ...(wf.official || {}), gz_codes: [...(byRule[rid]?.official?.gz_codes || []), m.official_code] } };
      else if (byRule[rid].official?.gz_codes) byRule[rid].official.gz_codes.push(m.official_code);
    }
  }
  return byRule;
}

function validateWorkflowTone(rule) {
  const wm = rule.workflow_messages;
  if (!wm?.precheck?.tone) return null;
  const tier1 = rule.official?.tier1;
  if (tier1 === '医疗类' && wm.precheck.tone === 'block') {
    return `${rule.rule_id}: 医疗类规则事前 tone 不得为 block（医师法诊疗自主权）`;
  }
  return null;
}

try {
  const raw = fs.readFileSync(YAML_PATH, 'utf8');
  const doc = yaml.load(raw);
  if (!doc || !Array.isArray(doc.rules)) {
    throw new Error('rules.yaml 缺少 rules 数组');
  }
  let coreMerged = 0;
  const workflowOverlay = loadWorkflowOverlay();
  const officialByRule = loadOfficialWorkflowByRuleId();
  for (const r of doc.rules) {
    const overlay = workflowOverlay[r.rule_id];
    if (overlay) Object.assign(r, overlay);
    const off = officialByRule[r.rule_id];
    if (off && !r.workflow_messages) Object.assign(r, off);
    else if (off?.official?.gz_codes && r.official) {
      r.official.gz_codes = [...new Set([...(r.official.gz_codes || []), ...(off.official.gz_codes || [])])];
    }
  }
  if (fs.existsSync(CORE_TC_PATH)) {
    const coreDoc = JSON.parse(fs.readFileSync(CORE_TC_PATH, 'utf8'));
    for (const r of doc.rules) {
      const tc = coreDoc[r.rule_id];
      if (tc && Array.isArray(tc)) {
        r.test_cases = tc;
        coreMerged++;
      }
    }
  }
  const enriched = enrichRulesDoc(doc);
  fs.writeFileSync(JSON_PATH, JSON.stringify(enriched, null, 2), 'utf8');
  console.log(`✅ 转换成功：${enriched.rules.length} 条规则 → ${path.relative(process.cwd(), JSON_PATH)}`);
  const withCatalog = enriched.rules.filter(r => r.catalog?.display_title).length;
  console.log(`   规则目录 catalog：${withCatalog}/${enriched.rules.length} 条已命名`);
  if (coreMerged) console.log(`   核心 test_cases 合并：${coreMerged} 条规则`);
  // 口径校验：meta.total_rules 必须与 rules 数组实际条数一致（防文档/运行时口径漂移）
  const declared = doc.meta?.total_rules;
  if (declared != null && declared !== doc.rules.length) {
    console.warn(`⚠ 口径不一致：meta.total_rules=${declared}，实际 rules=${doc.rules.length} —— 请修正 rules.yaml 的 meta.total_rules`);
  } else if (declared != null) {
    console.log(`✅ 口径一致：meta.total_rules = 实际条数 = ${doc.rules.length}`);
  }
  // 校验关键字段完整性
  const missing = doc.rules.filter(r => !r.rule_id || !r.rule_name || !r.layer || !r.violation_type);
  if (missing.length) {
    console.warn(`⚠ ${missing.length} 条规则缺少关键字段:`, missing.map(r => r.rule_id || '?').join(', '));
  } else {
    console.log('✅ 全部规则关键字段完整（rule_id/rule_name/layer/violation_type）');
  }
  const toneErrors = doc.rules.map(validateWorkflowTone).filter(Boolean);
  if (toneErrors.length) {
    console.warn('⚠ workflow tone 校验:', toneErrors.join('; '));
  } else if (Object.keys(workflowOverlay).length || Object.keys(officialByRule).length) {
    const n = Object.keys(workflowOverlay).length + Object.keys(officialByRule).length;
    console.log(`✅ workflow_messages 合并：rule ${Object.keys(workflowOverlay).length} + official→rule ${Object.keys(officialByRule).length} · tone 校验通过`);
  }
  // 分层统计
  const byCat = {};
  for (const r of doc.rules) byCat[r.category] = (byCat[r.category] || 0) + 1;
  console.log('   分类统计:', JSON.stringify(byCat, null, 0));
} catch (e) {
  console.error('❌ 转换失败:', e.message);
  process.exit(1);
}
