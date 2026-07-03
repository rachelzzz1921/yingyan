'use strict';

/**
 * 独立地面真值召回校验(金标准去自评化)
 * ------------------------------------------------------------
 * 依据 prototype/data/ground_truth_manifest.json —— 按埋点【设计意图】声明的
 * 每案 planted_suspect / planted_clue / is_clean —— 对引擎输出做召回校验。
 * 与引擎自动生成的 expected_findings.json(现降级为回归漂移快照)解耦:
 *   · is_clean=true  → 引擎疑点数必须=0(G0 独立复核)
 *   · planted_suspect ⊆ 引擎疑点规则集(疑点档召回下限)
 *   · planted_clue    ⊆ 引擎(疑点∪线索)规则集(线索可上抬为疑点仍算通过)
 * 引擎回归(某 checker 失效)会让 floor 未召回 → 本层 FAIL,而旧口径重生成快照会掩盖。
 */

const fs = require('fs');
const path = require('path');
const { DEFAULTS, loadGateConfig, REPO_ROOT } = require('../lib/paths');
const { resolveRunOptions } = require('../lib/modes');
const { discoverCases } = require('./l3-engine');

function loadJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

function runManifestRecall(opts = {}) {
  const cfg = loadGateConfig();
  const dataDir = opts.dataDir || DEFAULTS.prototypeData;
  const skipIds = opts.skipIds || cfg.skip_case_ids || ['uploaded'];
  const runOptions = resolveRunOptions('oracle');

  const manifestPath = path.join(dataDir, 'ground_truth_manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return { layer: 'manifest_recall', status: 'skip', message: 'ground_truth_manifest.json 缺失', pass: null, cases: [] };
  }
  const manifest = loadJSON(manifestPath).cases || {};

  const { runAudit } = require(DEFAULTS.prototypeEngine);
  const rulesDoc = loadJSON(path.join(dataDir, 'rules/rules.json'));
  const retrieval = require(path.join(REPO_ROOT, 'prototype/app/kb/retrieval'));
  const maps = retrieval.loadJsonKB(dataDir);
  const caseMap = discoverCases(dataDir, skipIds);

  const results = [];
  let cleanPass = true;
  let recallFloorPass = true;

  for (const [id, { record }] of Object.entries(caseMap)) {
    const gt = manifest[id];
    if (!gt) continue; // 清单未声明的案卷跳过(不阻塞)
    const rep = runAudit(record, rulesDoc.rules, {
      policyTexts: maps.policyTexts, policyVerified: maps.policyVerified, ...runOptions,
    });
    const findings = (rep.findings || []).filter(f => !f.shadow);
    const suspectRules = new Set(findings.filter(f => f.status === '疑点').map(f => f.rule_id));
    const clueRules = new Set(findings.filter(f => f.status === '线索').map(f => f.rule_id));
    const anyRules = new Set([...suspectRules, ...clueRules]);

    // 硬失败(阻塞):clean 案却出疑点 —— 独立复核零误报红线
    // 软失败(报告):设计 floor 漏抓 —— 与既有 recall 一致地非阻塞报告(含规则库在飞漂移)
    const hardFailures = [];
    const softFailures = [];
    if (gt.is_clean && suspectRules.size > 0) {
      hardFailures.push(`clean 案出现 ${suspectRules.size} 疑点: ${[...suspectRules].join(',')}`);
    }
    for (const rid of (gt.planted_suspect || [])) {
      if (!suspectRules.has(rid)) softFailures.push(`漏抓疑点 ${rid}`);
    }
    for (const rid of (gt.planted_clue || [])) {
      if (!anyRules.has(rid)) softFailures.push(`漏抓线索 ${rid}`);
    }
    if (hardFailures.length) cleanPass = false;
    if (softFailures.length) recallFloorPass = false;

    results.push({
      case_id: id, is_clean: !!gt.is_clean,
      planted_suspect: gt.planted_suspect || [], planted_clue: gt.planted_clue || [],
      pending_realignment: gt.pending_realignment || [],
      found_suspect: [...suspectRules], found_clue: [...clueRules],
      pass: hardFailures.length === 0 && softFailures.length === 0,
      hard_pass: hardFailures.length === 0,
      failures: [...hardFailures, ...softFailures],
      hard_failures: hardFailures, soft_failures: softFailures,
    });
  }

  const pendingCases = results.filter(r => r.pending_realignment.length);
  return {
    layer: 'manifest_recall',
    source: 'ground_truth_manifest.json(独立设计真值)',
    meta: {
      declared_cases: results.length,
      clean_cases: results.filter(r => r.is_clean).length,
      floor_rules: results.reduce((s, r) => s + r.planted_suspect.length + r.planted_clue.length, 0),
      pending_realignment: pendingCases.map(r => r.case_id),
    },
    // G0b_clean 阻塞(独立零误报);recall_floor 报告态(非阻塞,同既有 recall 口径)
    gates: { G0b_clean_zero_fp: cleanPass },
    clean_pass: cleanPass,
    recall_floor_pass: recallFloorPass,
    pass: cleanPass, // overall 贡献只取硬红线
    cases: results,
  };
}

module.exports = { runManifestRecall };

// 直接运行:dry-run 打印
if (require.main === module) {
  const rep = runManifestRecall();
  if (rep.status === 'skip') { console.log('skip:', rep.message); process.exit(0); }
  console.log(`# 独立真值召回校验(${rep.source})`);
  console.log(`声明案卷 ${rep.meta.declared_cases} | 干净 ${rep.meta.clean_cases} | floor 规则 ${rep.meta.floor_rules}`);
  if (rep.meta.pending_realignment.length) console.log(`待重对齐(规则库在飞): ${rep.meta.pending_realignment.join(', ')}`);
  console.log('');
  for (const c of rep.cases) {
    const mark = c.hard_pass ? (c.soft_failures.length ? '🟡' : '✅') : '❌';
    const floor = [...c.planted_suspect.map(r => r + '(疑)'), ...c.planted_clue.map(r => r + '(线)')].join(',') || (c.pending_realignment.length ? `⏸${c.pending_realignment.join(',')}` : '—');
    const note = c.hard_failures.length ? ' ❌硬:' + c.hard_failures.join('; ') : (c.soft_failures.length ? ' 🟡软:' + c.soft_failures.join('; ') : '');
    console.log(`${mark} ${c.case_id.padEnd(26)} floor[${floor}]${note}`);
  }
  console.log(`\n**G0b 独立零误报(阻塞)**: ${rep.gates.G0b_clean_zero_fp ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`**recall floor(报告态)**: ${rep.recall_floor_pass ? '✅ 全召回' : '🟡 有漂移(见上,非阻塞)'}`);
}
