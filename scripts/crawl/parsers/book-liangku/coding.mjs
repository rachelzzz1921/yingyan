import { buildPolicy, pushPolicy, stripSectionHeader } from './shared.mjs';

/** 诊断与患者性别不符 */
export function parseDiagnosisDemographicSection(flat, category, meta) {
  const policies = [];
  const body = stripSectionHeader(flat);
  const re = /(\d{1,5})(A\d{2}(?:\.\d+)?(?:x\d+)?(?:\+\w+)?\*?)([\u4e00-\u9fa5（）()A-Za-z0-9·\-+]{2,40})([男女])与限定性别不符([^0-9]{4,120}?)(?=\d{1,5}A\d{2}|合计|$)/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const [, seq, code, diagName, gender, basis] = m;
    const name = `${code}${diagName}`;
    const logic = `${gender}与限定性别不符`;
    const text = [name, logic, basis.trim()].join(' · ');
    pushPolicy(policies, buildPolicy({
      category, name, logic, basis: basis.trim(), seq, text, meta,
      extraMeta: { icd10_code: code, limit_sex: gender },
    }));
  }
  return policies;
}

/** 诊断与患者年龄不符 */
export function parseDiagnosisAgeSection(flat, category, meta) {
  const policies = [];
  const body = stripSectionHeader(flat);
  const re = /(\d{1,5})(A\d{2}(?:\.\d+)?(?:x\d+)?(?:\+\w+)?\*?)([\u4e00-\u9fa5（）()A-Za-z0-9·\-+]{2,48})诊断对应年龄与参保人年龄不符([^0-9]{4,120}?)(?=\d{1,5}A\d{2}|合计|$)/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const [, seq, code, diagName, basis] = m;
    const name = `${code}${diagName}`;
    const logic = '诊断对应年龄与参保人年龄不符';
    const text = [name, logic, basis.trim()].join(' · ');
    pushPolicy(policies, buildPolicy({
      category, name, logic, basis: basis.trim(), seq, text, meta,
      extraMeta: { icd10_code: code },
    }));
  }
  return policies;
}

/** 诊断编码与手术操作编码不符 */
export function parseDiagnosisSurgerySection(flat, category, meta) {
  const policies = [];
  const body = stripSectionHeader(flat);
  const re = /(\d{1,5})(\d{2}\.\d{4}[\u4e00-\u9fa5A-Za-z0-9（）()·\-+]{2,48})(\d{1,3})([A-Z]\d{2}(?:\.\d+)?(?:x\d+)?(?:\+\w+)?\*?)([\u4e00-\u9fa5（）()A-Za-z0-9·\-+]{2,40})就诊信息中主要手术操作编码与主要诊断编码不符([^0-9]{4,120}?)(?=\d{1,5}\d{2}\.|合计|$)/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const [, seq, surgery, group, icd, diag, basis] = m;
    const name = `${surgery}×${icd}${diag}`;
    const logic = '就诊信息中主要手术操作编码与主要诊断编码不符';
    const text = [name, logic, basis.trim()].join(' · ');
    pushPolicy(policies, buildPolicy({
      category, name, logic, basis: basis.trim(), seq, text, meta,
      extraMeta: { surgery_code: surgery, icd10_code: icd, match_group: group },
    }));
  }
  return policies;
}

/** 手术操作编码与性别不符 */
export function parseSurgeryGenderSection(flat, category, meta) {
  const policies = [];
  const body = stripSectionHeader(flat);
  const re = /(\d{1,5})(\d{2}\.\d{4}[\u4e00-\u9fa5A-Za-z0-9（）()·\-+]{2,48})([男女])与限定性别不符([^0-9]{4,120}?)(?=\d{1,5}\d{2}\.|合计|$)/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const [, seq, surgery, gender, basis] = m;
    const logic = `${gender}与限定性别不符`;
    const text = [surgery, logic, basis.trim()].join(' · ');
    pushPolicy(policies, buildPolicy({
      category, name: surgery, logic, basis: basis.trim(), seq, text, meta,
      extraMeta: { limit_sex: gender },
    }));
  }
  return policies;
}

export function parseCodingMismatchSection(flat, category, meta) {
  if (/诊断编码与手术/.test(category)) return parseDiagnosisSurgerySection(flat, category, meta);
  if (/手术操作编码与性别/.test(category)) return parseSurgeryGenderSection(flat, category, meta);
  if (/诊断与患者年龄/.test(category)) return parseDiagnosisAgeSection(flat, category, meta);
  if (/诊断与患者性别/.test(category)) return parseDiagnosisDemographicSection(flat, category, meta);
  return [];
}
