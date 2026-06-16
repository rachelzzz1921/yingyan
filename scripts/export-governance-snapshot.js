#!/usr/bin/env node
'use strict';

/**
 * 导出治理快照 JSON（iter-24 T8-1 轻量版，为 DB 迁移准备）
 * 用法：node scripts/export-governance-snapshot.js
 */
const path = require('path');
const { exportSnapshotToFile } = require('../prototype/app/engine/governance-snapshot');

const DATA = path.resolve(__dirname, '../prototype/data');
const OUT = path.join(DATA, 'governance_snapshots');

const { path: fp, snapshot } = exportSnapshotToFile(DATA, OUT);
console.log('✅ 治理快照已写入', fp);
console.log('   shadow:', snapshot.counts.shadow, 'deprecated:', snapshot.counts.deprecated);
console.log('   review entries:', snapshot.review_stats.total_entries);
