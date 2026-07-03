import { buildPolicy, pushPolicy, stripSectionHeader } from './shared.mjs';

export function parseTcmSection(flat, category, meta) {
  const policies = [];
  const body = stripSectionHeader(flat);
  const re = /(\d{1,4})([\u4e00-\u9fa5]{2,16})(T\d{10,})?([^合计\d]{4,120}?)(单独使用|不得纳入|单复方均不予|单方使用不予)/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const [, seq, name, code, logic, flag] = m;
    const text = [name, logic.replace(/逻辑依据.*/, '').trim(), flag, code].filter(Boolean).join(' · ');
    pushPolicy(policies, buildPolicy({ category, name, logic, basis: flag, seq, text, code, meta }));
  }
  return policies;
}

/** 中药饮片配伍禁忌 / 超量 / 超大处方 */
export function parseTcmRuleSection(flat, category, meta) {
  const policies = [];
  const body = stripSectionHeader(flat);
  if (/配伍禁忌/.test(category)) {
    const re = /(\d{1,4})([\u4e00-\u9fa5]{2,12})([\u4e00-\u9fa5]{2,12})(同时使用存在配伍禁忌[^0-9]{4,200}?)([^0-9]{4,200}?)(?=\d{1,4}[\u4e00-\u9fa5]|合计|$)/g;
    let m;
    while ((m = re.exec(body)) !== null) {
      const [, seq, name1, name2, logic, basis] = m;
      const name = `${name1}+${name2}`;
      const text = [name, logic.trim(), basis.trim()].join(' · ');
      pushPolicy(policies, buildPolicy({
        category, name, logic: logic.trim(), basis: basis.trim(), seq, text, meta,
        extraMeta: { tcm_pair: [name1, name2] },
      }));
    }
    return policies;
  }
  if (/超大处方|超量/.test(category)) {
    const re = /(\d{1,4})([\u4e00-\u9fa5]{2,16})([^0-9合计]{8,240}?)([^0-9]{4,200}?)(?=\d{1,4}[\u4e00-\u9fa5]|合计|$)/g;
    let m;
    while ((m = re.exec(body)) !== null) {
      const [, seq, name, logic, basis] = m;
      const text = [name, logic.trim(), basis.trim()].join(' · ');
      pushPolicy(policies, buildPolicy({ category, name, logic: logic.trim(), basis: basis.trim(), seq, text, meta }));
    }
  }
  return policies;
}
