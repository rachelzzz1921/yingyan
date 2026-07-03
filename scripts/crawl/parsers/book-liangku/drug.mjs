import { buildPolicy, pushPolicy, stripSectionHeader, trailingEncodingCount } from './shared.mjs';

const DRUG_TAIL = '(?:片|胶囊|注射液|颗粒|丸|散|膏|栓|滴|液|酶|单抗|索|苷|剂|乳|贴|雾|粉|锭|胶|浓溶液|干混悬剂|缓释片|肠溶片|分散片|软膏|凝胶|乳膏|合剂|口服液|煎膏|疫苗|毒素|法新|单抗注射液|眼内注射溶液|咀嚼片|肠溶胶囊|缓释胶囊|滴眼液|滴鼻液|吸入剂|吸入粉雾剂|吸入溶液|贴膏|贴膜|栓剂|灌肠剂|混悬液)';

export function parseDrugSection(flat, category, meta) {
  const policies = [];
  const body = stripSectionHeader(flat);
  const re = new RegExp(
    `(\\d{1,4})` +
    `([\\u4e00-\\u9fa5][\\u4e00-\\u9fa5A-Za-z0-9（）()±+\\-·ω]{1,56}?${DRUG_TAIL}|\\u03c9[\\u4e00-\\u9fa5A-Za-z0-9（）()±+\\-·]{1,48}?${DRUG_TAIL}|[\\u4e00-\\u9fa5][\\u4e00-\\u9fa5A-Za-z0-9（）()·]{1,44}(?:分散片|干混悬剂|口溶膜|灌肠剂|组合包装|生长激素))` +
    `(使用了该药品[^\\d]{8,200}?|参保人[^\\d]{4,100}?|使用药品[^\\d]{4,100}?|参保人年龄超出儿童年龄限制|参保人年龄超出新生儿年龄限制|超互联网医院|药品超限定支付范围)` +
    `(限[：:][^\\d]{4,1800}?|限[^\\d]{4,1800}?)` +
    `(?:知识点对应药品代码数量)?(\\d{1,5})?` +
    `(?=\\d{1,4}[\\u4e00-\\u9fa5A-Z\\u03c9]|合计|序号|$)`,
    'g',
  );
  let m;
  while ((m = re.exec(body)) !== null) {
    const [, seq, rawName, logicPart, basisPart, encTail] = m;
    const name = rawName.replace(/\s+/g, '').trim();
    const logic = (logicPart || '').replace(/\s+/g, '').slice(0, 240);
    const basis = (basisPart || '').replace(/\s+/g, ' ').trim().slice(0, 1500);
    const encodingCount = trailingEncodingCount(encTail);
    const text = [name, logic, basis].filter((x) => x && x.length > 2).join(' · ');
    pushPolicy(policies, buildPolicy({ category, name, logic, basis, seq, text, encodingCount, meta }));
  }
  return policies;
}

export function scoreDrugChunk(chunk) {
  const body = stripSectionHeader(chunk);
  const hits = body.match(/使用药品的疾病诊断不符合|参保人险种|限：|限支付/g);
  return hits ? hits.length : 0;
}
