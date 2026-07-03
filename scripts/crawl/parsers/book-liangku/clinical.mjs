import { buildPolicy, pushPolicy, stripSectionHeader } from './shared.mjs';

/** 无指征检验检查 / 无指征治疗 / 围手术期抗菌 */
export function parseClinicalIndicationSection(flat, category, meta) {
  const policies = [];
  const body = stripSectionHeader(flat);
  if (/检验检查|检验/.test(category)) {
    const re = /(\d{1,4})([\u4e00-\u9fa5（）()A-Za-z0-9·\-+]{4,56})(就诊信息中的疾病诊断与检验检查相对应的适应症不符)([^0-9]{8,1200}?)(\d{15,20})?([^0-9]{0,80})?(?=\d{1,4}[\u4e00-\u9fa5]|合计|$)/g;
    let m;
    while ((m = re.exec(body)) !== null) {
      const [, seq, name, logic, basis, projectCode] = m;
      const text = [name, logic, basis.replace(/各省依据.*/, '').trim().slice(0, 400)].join(' · ');
      pushPolicy(policies, buildPolicy({
        category, name, logic, basis: basis.trim().slice(0, 800), seq, text, meta,
        extraMeta: { project_code: projectCode || null },
      }));
    }
    return policies;
  }
  if (/无指征治疗/.test(category)) {
    const re = /(\d{1,4})([\u4e00-\u9fa5（）()A-Za-z0-9·\-+]{4,56})(就诊信息[^0-9]{8,200}?)([^0-9]{8,800}?)(?=\d{1,4}[\u4e00-\u9fa5]|合计|$)/g;
    let m;
    while ((m = re.exec(body)) !== null) {
      const [, seq, name, logic, basis] = m;
      const text = [name, logic.trim(), basis.trim().slice(0, 400)].join(' · ');
      pushPolicy(policies, buildPolicy({ category, name, logic: logic.trim(), basis: basis.trim(), seq, text, meta }));
    }
    return policies;
  }
  if (/围手术期抗菌/.test(category)) {
    const re = /(\d{1,4})([\u4e00-\u9fa5（）()A-Za-z0-9·\-+]{4,56})([^0-9]{10,400}?)([^0-9]{4,200}?)(?=\d{1,4}[\u4e00-\u9fa5]|合计|$)/g;
    let m;
    while ((m = re.exec(body)) !== null) {
      const [, seq, name, logic, basis] = m;
      if (!/抗菌|预防|手术/.test(logic + basis)) continue;
      const text = [name, logic.trim(), basis.trim().slice(0, 400)].join(' · ');
      pushPolicy(policies, buildPolicy({ category, name, logic: logic.trim(), basis: basis.trim(), seq, text, meta }));
    }
  }
  return policies;
}
