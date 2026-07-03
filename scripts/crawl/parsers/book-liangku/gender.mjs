import { buildPolicy, pushPolicy, stripSectionHeader } from './shared.mjs';

export function parseGenderDrugSection(flat, category, meta) {
  const policies = [];
  const body = stripSectionHeader(flat);
  const re = /(\d{1,4})([\u4e00-\u9fa5][\u4e00-\u9fa5A-Za-z0-9（）()·]{1,44}?(?:片|胶囊|颗粒|丸|注射液|栓|滴眼液|软膏|凝胶|乳膏|合剂|口服液))([男女])与限定性别不符([^0-9]{0,240})/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const [, seq, name, gender, note] = m;
    const logic = `${gender}与限定性别不符`;
    const text = [name, logic, note.trim()].filter(Boolean).join(' · ');
    pushPolicy(policies, buildPolicy({ category, name, logic, basis: note.trim(), seq, text, meta }));
  }
  return policies;
}
