/**
 * 鹰眼 · 院端三阶段自查地图（事前提醒 / 事中结算审核 / 事后监管）
 * ------------------------------------------------------------
 * 把一次稽核的疑点,按"最早能在哪个阶段被拦住/发现"分类,呈现给院端:
 *   · 事前(开单可防):政策/目录限定类——开单时两库提醒就该拦住,防新违规
 *   · 事中(结算前可拦):收费规范/数量一致性——结算上传前自查能发现,避免被退回/拒付
 *   · 事后(需深查):L2语义/证据缺口——只有深读整本案卷才能发现,飞检重点
 * 价值叙事:把事前+事中的疑点"前移"处理掉,就少这么多流到飞检——关口前移、源头治理,
 *   从源头替监管侧卸载工作量(见 SSOT §4.1.5 第⑦条)。
 */
'use strict';

function classifyStage(f) {
  const id = f.rule_id || '';
  const vt = f.violation_type || '';
  const layer = String(f.layer_label || f.layer || '');
  const reason = f.reasoning || '';
  // 事前(开单可防):政策/目录限定、性别/年龄限定——字段规则,两库事前提醒可拦
  if (/超目录|限定支付|限性别|限年龄|限工伤|限生育|政策限定/.test(vt) || /^B-2/.test(id) || /^F-00[12]$/.test(id)) return '事前';
  // 事中(结算前可拦):收费规范类(A-)——价格/数量/重复/串换,结算前费用-标准比对即可发现
  if (/^A-/.test(id) && !/L2|语义/.test(layer)) return '事中';
  // 事后(需深查):L2语义、证据缺口、肿瘤指征——只有深读案卷才能发现
  if (/L2|语义/.test(layer) || /无指征|证据缺口|无.*(证据|检测|报告)|适应症|指征/.test(vt + reason) || /^T-/.test(id)) return '事后';
  // 其余(时间/数量等)——事中结算前可拦
  return '事中';
}

const STAGE_META = {
  事前: { key: '事前', label: '事前 · 开单可防', prevent: '开单/上传前用国家两库规则提醒即可拦住,防止新违规发生', color: 'green' },
  事中: { key: '事中', label: '事中 · 结算前可拦', prevent: '结算上传前自查(费用-医嘱-诊断一致),避免被经办退回/拒付、减少返工与资金占用', color: 'amber' },
  事后: { key: '事后', label: '事后 · 需深查', prevent: '只有深读整本非结构化案卷才能发现——飞检重点,也是鹰眼语义取证的主战场', color: 'red' },
};

function computeThreeStage(findings) {
  const buckets = { 事前: [], 事中: [], 事后: [] };
  let amt = { 事前: 0, 事中: 0, 事后: 0 };
  for (const f of (findings || [])) {
    if (f.status !== '疑点' && f.status !== '线索') continue;
    const st = classifyStage(f);
    buckets[st].push({ rule_id: f.rule_id, rule_name: f.rule_name, status: f.status, amount: f.amount_involved || 0 });
    amt[st] += f.amount_involved || 0;
  }
  const stages = ['事前', '事中', '事后'].map(k => ({
    ...STAGE_META[k],
    count: buckets[k].length,
    amount: amt[k],
    findings: buckets[k],
  }));
  const preventable = buckets.事前.length + buckets.事中.length; // 可前移的
  const total = buckets.事前.length + buckets.事中.length + buckets.事后.length;
  return {
    stages,
    summary: {
      total,
      preventable_count: preventable,
      preventable_amount: amt.事前 + amt.事中,
      deep_count: buckets.事后.length,
    },
    narrative: `本案 ${total} 条疑点/线索中,${preventable} 条可在事前/事中前移处理(开单提醒拦住、结算前自查),院端自查干净即**从源头替监管侧减负**;另 ${buckets.事后.length} 条属结构化系统与前两阶段都拦不住的**语义疑点**——只有深读整本案卷才能发现,正是鹰眼语义取证填的空白、也是飞检取证放大镜的主战场(关口前移·源头治理)。`,
  };
}

module.exports = { computeThreeStage };
