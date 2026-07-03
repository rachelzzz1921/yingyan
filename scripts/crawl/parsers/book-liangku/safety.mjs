import { buildPolicy, pushPolicy, stripSectionHeader } from './shared.mjs';

const SAFETY_DRUG_TAIL = '(?:片|胶囊|注射液|颗粒|丸|散|膏|栓|滴|液|剂|乳|贴|雾|粉|锭|胶|软膏|凝胶|合剂|口服液)';

/** 超说明书 / 老年妊娠 / 相互作用 / 禁忌症 — 保守 regex */
export function parseSafetySection(flat, category, meta) {
  const policies = [];
  const body = stripSectionHeader(flat);
  const re = new RegExp(
    `(\\d{1,4})` +
    `([\\u4e00-\\u9fa5][\\u4e00-\\u9fa5A-Za-z0-9（）()·]{1,48}?${SAFETY_DRUG_TAIL})` +
    `([^0-9]{10,500}?)([^0-9]{4,300}?)(?=\\d{1,4}[\\u4e00-\\u9fa5]|合计|$)`,
    'g',
  );
  let m;
  while ((m = re.exec(body)) !== null) {
    const [, seq, name, logic, basis] = m;
    const logicT = logic.trim();
    const basisT = basis.trim();
    if (/^序号|^逻辑依据/.test(logicT)) continue;
    const text = [name, logicT.slice(0, 200), basisT.slice(0, 300)].join(' · ');
    pushPolicy(policies, buildPolicy({ category, name, logic: logicT, basis: basisT, seq, text, meta }));
  }
  return policies;
}
