'use strict';

/**
 * Shadow 公理 A：三种 RunMode 的 options 解析。
 * - oracle：纯引擎，零治理（CI / AuditBench / gate 默认）
 * - live：读 rule_states + review 触发的 shadow（/api/audit）
 * - shadow：L4 harness 单规则静默观察（只产 metrics）
 */

const MODES = ['oracle', 'live', 'shadow'];

function assertMode(mode) {
  if (!MODES.includes(mode)) throw new Error(`Invalid mode "${mode}", expected ${MODES.join('|')}`);
}

/**
 * @param {'oracle'|'live'|'shadow'} mode
 * @param {{ shadowRules?: string[], retiredRules?: string[], observeRule?: string }} extra
 */
function resolveRunOptions(mode, extra = {}) {
  assertMode(mode);
  if (mode === 'oracle') {
    return { shadowRules: [], retiredRules: [] };
  }
  if (mode === 'live') {
    return {
      shadowRules: extra.shadowRules || [],
      retiredRules: extra.retiredRules || [],
    };
  }
  // shadow harness：观察单条规则，其余规则正常计分（由 l4-shadow 解读 findings）
  return {
    shadowRules: extra.observeRule ? [extra.observeRule] : (extra.shadowRules || []),
    retiredRules: [],
    _shadowObserve: extra.observeRule || null,
  };
}

module.exports = { MODES, assertMode, resolveRunOptions };
