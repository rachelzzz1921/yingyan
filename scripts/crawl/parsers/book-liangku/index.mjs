import { parseDrugSection, scoreDrugChunk } from './drug.mjs';
import { parseTcmSection, parseTcmRuleSection } from './tcm.mjs';
import { parseGenderDrugSection } from './gender.mjs';
import { parseDuplicateRxSection } from './duplicate-rx.mjs';
import { parseCodingMismatchSection } from './coding.mjs';
import { parseClinicalIndicationSection } from './clinical.mjs';
import { parseConsumableSection } from './consumable.mjs';
import { parseSafetySection } from './safety.mjs';
import { extractSections, BOOK } from './shared.mjs';

export { BOOK };

const SKIP_CATEGORIES = [
  /医疗服务项目重复收费/,
  /手术项目未按规定折价/,
  /医疗服务项目限定频次/,
  /医疗服务项目限支付疗程/,
  /分解收费/,
  /超限定单价/,
];

export function shouldSkipCategory(category) {
  return SKIP_CATEGORIES.some((re) => re.test(category));
}

function scoreChunk(chunk, category) {
  const rows = parseSection(chunk, category, { dryScore: true });
  return rows.length;
}

export function parseSection(chunk, category, meta = {}) {
  if (meta.dryScore && shouldSkipCategory(category)) return [];
  if (shouldSkipCategory(category)) return [];

  if (/重复开药/.test(category)) return parseDuplicateRxSection(chunk, category, meta);
  if (/诊断编码与手术|诊断与患者|手术操作编码与性别/.test(category)) {
    return parseCodingMismatchSection(chunk, category, meta);
  }
  if (/中药饮片配伍禁忌|中药饮片超量|中药饮片超大处方/.test(category)) {
    return parseTcmRuleSection(chunk, category, meta);
  }
  if (/中药饮片/.test(category)) return parseTcmSection(chunk, category, meta);
  if (/医用耗材/.test(category)) return parseConsumableSection(chunk, category, meta);
  if (/无指征检验|无指征治疗|围手术期抗菌/.test(category)) {
    return parseClinicalIndicationSection(chunk, category, meta);
  }
  if (/超说明书|老年人用药|妊娠期|药品相互作用|药品禁忌症/.test(category)) {
    return parseSafetySection(chunk, category, meta);
  }
  if (/区分性别|儿童专用|儿童禁用/.test(category)) {
    const gender = parseGenderDrugSection(chunk, category, meta);
    if (gender.length) return gender;
  }
  if (/药品/.test(category)) return parseDrugSection(chunk, category, meta);
  return [];
}

export function parseBookFlat(flat, meta = {}) {
  const sections = extractSections(flat, (chunk, cat) => {
    if (/药品限适应症|限二线|限支付疗程|限医疗机构|限就医方式|限工伤保险|限生育保险/.test(cat)) {
      return scoreDrugChunk(chunk) || parseSection(chunk, cat, { dryScore: true }).length;
    }
    return parseSection(chunk, cat, { dryScore: true }).length;
  });

  const allPolicies = [];
  const byCategory = {};
  for (const { cat, chunk } of sections) {
    const rows = parseSection(chunk, cat, meta);
    byCategory[cat] = rows.length;
    allPolicies.push(...rows);
  }
  return { sections, policies: allPolicies, byCategory };
}

export { extractSections };
