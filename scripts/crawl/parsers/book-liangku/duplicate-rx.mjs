import { buildPolicy, pushPolicy, stripSectionHeader, trailingEncodingCount } from './shared.mjs';

export function parseDuplicateRxSection(flat, category, meta) {
  const policies = [];
  const body = stripSectionHeader(flat);
  const re = /(\d{1,4})([\u4e00-\u9fa5A-Za-z0-9（）()·\-]{2,20})(\d{1,3})([\u4e00-\u9fa5][\u4e00-\u9fa5A-Za-z0-9（）()·]{1,48}?(?:片|胶囊|颗粒|丸|注射液|栓|滴|液|剂|乳|散|膏))同时开具同一药品分类组号内两种及以上的药品([^0-9]{4,120}?)(\d{1,6})?(?=\d{1,4}[\u4e00-\u9fa5]|合计|$)/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const [, seq, drugClass, groupNo, name, basis, encTail] = m;
    const logic = '同时开具同一药品分类组号内两种及以上的药品';
    const text = [name, drugClass, `组${groupNo}`, logic, basis.trim()].join(' · ');
    pushPolicy(policies, buildPolicy({
      category, name, logic, basis: basis.trim(), seq, text,
      encodingCount: trailingEncodingCount(encTail), meta,
      extraMeta: { drug_class: drugClass, class_group: groupNo },
    }));
  }
  return policies;
}
