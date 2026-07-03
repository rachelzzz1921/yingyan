import { buildPolicy, pushPolicy, stripSectionHeader, trailingEncodingCount } from './shared.mjs';

export function parseConsumableSection(flat, category, meta) {
  const policies = [];
  const body = stripSectionHeader(flat);
  const re = /(\d{1,5})([\u4e00-\u9fa5A-Za-z0-9（）()·\-+]{4,56})(就诊信息中的疾病诊断与耗材的适应症不符)([^0-9]{8,300}?)(\d{1,6})?(?=\d{1,5}[\u4e00-\u9fa5A-Z]|合计|$)/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const [, seq, name, logic, basis, encTail] = m;
    const text = [name, logic, basis.trim().slice(0, 400)].join(' · ');
    pushPolicy(policies, buildPolicy({
      category, name, logic, basis: basis.trim(), seq, text,
      encodingCount: trailingEncodingCount(encTail), meta,
    }));
  }
  return policies;
}
