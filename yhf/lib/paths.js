'use strict';

const path = require('path');
const fs = require('fs');

const YHF_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(YHF_ROOT, '..');

const DEFAULTS = {
  prototypeData: path.join(REPO_ROOT, 'prototype/data'),
  prototypeEngine: path.join(REPO_ROOT, 'prototype/app/engine/audit-engine.js'),
  evalRunner: path.join(REPO_ROOT, 'eval/evals/run.js'),
  gateConfig: path.join(YHF_ROOT, 'gate.config.yaml'),
  resultsDir: path.join(YHF_ROOT, 'results'),
};

function loadGateConfig() {
  const fp = DEFAULTS.gateConfig;
  if (!fs.existsSync(fp)) return {};
  // 零依赖：简单解析 yaml 子集（MVP）；完整实现可换 js-yaml
  const raw = fs.readFileSync(fp, 'utf8');
  const skipMatch = raw.match(/skip_case_ids:\s*\[(.*?)\]/s);
  const skip = skipMatch
    ? skipMatch[1].split(',').map(s => s.replace(/["'\s]/g, '')).filter(Boolean)
    : ['uploaded'];
  const maxFprMatch = raw.match(/max_fpr:\s*([\d.]+)/);
  const coreRules = [];
  const coreBlock = raw.match(/core_rules:\s*\n((?:\s+-\s+\S+\n?)+)/);
  if (coreBlock) {
    for (const line of coreBlock[1].split('\n')) {
      const m = line.match(/-\s+(\S+)/);
      if (m) coreRules.push(m[1]);
    }
  }
  const ragMinRecall = raw.match(/G4_rag_recall:[\s\S]*?min_recall:\s*([\d.]+)/);
  const ragK = raw.match(/G4_rag_recall:[\s\S]*?\n\s+k:\s*(\d+)/);
  const ragEnabled = /G4_rag_recall:[\s\S]*?enabled:\s*true/.test(raw);
  return {
    skip_case_ids: skip,
    shadow_max_fpr: maxFprMatch ? parseFloat(maxFprMatch[1]) : 0.10,
    core_rules: coreRules,
    rag_enabled: ragEnabled,
    rag_min_recall: ragMinRecall ? parseFloat(ragMinRecall[1]) : 0.75,
    rag_k: ragK ? parseInt(ragK[1], 10) : 8,
  };
}

module.exports = { YHF_ROOT, REPO_ROOT, DEFAULTS, loadGateConfig };
