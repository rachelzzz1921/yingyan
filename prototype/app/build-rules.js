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

try {
  const raw = fs.readFileSync(YAML_PATH, 'utf8');
  const doc = yaml.load(raw);
  if (!doc || !Array.isArray(doc.rules)) {
    throw new Error('rules.yaml 缺少 rules 数组');
  }
  let coreMerged = 0;
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
  // 分层统计
  const byCat = {};
  for (const r of doc.rules) byCat[r.category] = (byCat[r.category] || 0) + 1;
  console.log('   分类统计:', JSON.stringify(byCat, null, 0));
} catch (e) {
  console.error('❌ 转换失败:', e.message);
  process.exit(1);
}
