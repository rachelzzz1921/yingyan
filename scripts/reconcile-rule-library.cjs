// 规则库最终态全面对账(确定性,无需 agent)。输出各维脱钩清单。
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = '/Users/chenzhiwei/Desktop/鹰眼';
const DATA = path.join(ROOT, 'prototype/data');
const { runAudit } = require(path.join(ROOT, 'prototype/app/engine/audit-engine'));
const retrieval = require(path.join(ROOT, 'prototype/app/kb/retrieval'));
const maps = retrieval.loadJsonKB(DATA);
const rules = require(path.join(DATA, 'rules/rules.json')).rules;
const ruleName = {}; rules.forEach(r => ruleName[r.rule_id] = r.rule_name);
const ruleSet = new Set(rules.map(r => r.rule_id));
const manifest = require(path.join(DATA, 'ground_truth_manifest.json')).cases;
const ALIAS = { NSCLC: 'main' };

const out = { cases: [], kb2: [], manifest: [], snapshots: [], docs: [] };

function fireOf(caseDir) {
  const rec = require(path.join(DATA, caseDir, 'medical_record.json'));
  const rep = runAudit(rec, rules, { policyTexts: maps.policyTexts, policyVerified: maps.policyVerified });
  const f = (rep.findings || []).filter(x => !x.shadow);
  return {
    rec,
    suspect: f.filter(x => x.status === '疑点').map(x => x.rule_id),
    clue: f.filter(x => x.status === '线索').map(x => x.rule_id),
  };
}

// ===== ① 案卷↔引擎 + manifest floor =====
const caseDirs = fs.readdirSync(DATA).filter(d => d.startsWith('case_') && fs.existsSync(path.join(DATA, d, 'medical_record.json')));
for (const d of caseDirs) {
  const id = ALIAS[d.replace(/^case_/, '')] || d.replace(/^case_/, '');
  const gt = manifest[id];
  let fire; try { fire = fireOf(d); } catch (e) { out.cases.push({ id, sev: 'HIGH', issue: 'runAudit异常:' + e.message }); continue; }
  const evc = fire.rec.case_meta?.embedded_violation_count;
  const title = fire.rec.case_meta?.case_title || '';
  const susSet = new Set(fire.suspect), anySet = new Set([...fire.suspect, ...fire.clue]);
  if (!gt) { out.cases.push({ id, sev: 'LOW', issue: `manifest 未声明该案(title=${title})` }); continue; }
  // clean 案出疑点(HIGH)
  if (gt.is_clean && susSet.size) out.cases.push({ id, sev: 'HIGH', issue: `clean案出疑点:${fire.suspect.join(',')}` });
  // floor 漏抓
  for (const r of (gt.planted_suspect || [])) if (!susSet.has(r)) out.cases.push({ id, sev: 'HIGH', issue: `漏抓疑点floor ${r}(${ruleName[r]||'?'})` });
  for (const r of (gt.planted_clue || [])) if (!anySet.has(r)) out.cases.push({ id, sev: 'MED', issue: `漏抓线索floor ${r}` });
  // 孤儿:非clean、无pending、却引擎0命中
  if (!gt.is_clean && !(gt.pending_realignment||[]).length && !anySet.size) out.cases.push({ id, sev: 'HIGH', issue: `违规案引擎0命中(孤儿?)title=${title}` });
  // evc 与命中数明显不符(仅提示)
}

// ===== ② KB2 linked_rules 存在性 + 语义标签 =====
const kb2 = require(path.join(DATA, 'kb/kb2_clinical.json')).entries;
for (const e of kb2) {
  for (const r of (e.linked_rules || [])) {
    if (!ruleSet.has(r)) out.kb2.push({ id: e.kb2_id, sev: 'HIGH', issue: `linked_rule ${r} 不在规则集` });
  }
  // 语义抽查:text 里若把某 rule_id 描述成与当前名不符
  const txt = (e.text || '') + JSON.stringify(e.key_elements || []);
  if (/P-303/.test(txt) && /回流药/.test(txt.split('P-303')[1]?.slice(0, 30) || '')) out.kb2.push({ id: e.kb2_id, sev: 'MED', issue: `文本疑把 P-303 描述为回流药(实际=${ruleName['P-303']})` });
}

// ===== ③ manifest rule_id 存在性 + basis 语义标签 =====
for (const [id, gt] of Object.entries(manifest)) {
  for (const r of [...(gt.planted_suspect||[]), ...(gt.planted_clue||[]), ...(gt.pending_realignment||[])]) {
    if (!ruleSet.has(r)) out.manifest.push({ id, sev: 'HIGH', issue: `floor 规则 ${r} 不在规则集` });
  }
  const basis = gt.basis || '';
  // P-303 直接误标为回流药(P-303 后紧跟"回流"才算误标;正确应是 P-303 生活用品串换)
  if (/P-?303[^。;]{0,8}回流/.test(basis)) out.manifest.push({ id, sev: 'MED', issue: `basis 把 P-303 直接说成回流药,实际 P-303=${ruleName['P-303']}、P-302=${ruleName['P-302']}` });
}

// ===== ④ 快照↔引擎漂移 =====
for (const d of caseDirs) {
  const sp = path.join(DATA, d, 'expected_findings.json');
  if (!fs.existsSync(sp)) continue;
  let snap; try { snap = require(sp); } catch { continue; }
  const snapSus = (snap.findings || snap.expected_findings || []).filter(f => f.status === '疑点').map(f => f.rule_id).sort();
  let fire; try { fire = fireOf(d); } catch { continue; }
  const engSus = [...new Set(fire.suspect)].sort();
  const snapU = [...new Set(snapSus)];
  const miss = snapU.filter(r => !engSus.includes(r)); // 快照有引擎无
  const extra = engSus.filter(r => !snapU.includes(r)); // 引擎有快照无
  if (miss.length || extra.length) out.snapshots.push({ id: d.replace(/^case_/, ''), sev: 'MED', issue: `漂移 快照疑点[${snapU.join(',')}] vs 引擎[${engSus.join(',')}]${miss.length?' 快照多:'+miss.join(','):''}${extra.length?' 引擎多:'+extra.join(','):''}` });
}

// ===== 输出 =====
const dims = [['① 案卷↔引擎/floor', out.cases], ['② KB2↔规则', out.kb2], ['③ manifest↔规则', out.manifest], ['④ 快照漂移', out.snapshots]];
let total = 0;
for (const [name, arr] of dims) {
  console.log(`\n=== ${name}(${arr.length}) ===`);
  arr.forEach(x => { console.log(`  [${x.sev}] ${x.id}: ${x.issue}`); total++; });
  if (!arr.length) console.log('  ✅ 无脱钩');
}
console.log(`\n合计脱钩条目: ${total}`);
