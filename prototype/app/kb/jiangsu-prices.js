'use strict';

/** 江苏省护理类医疗服务价格（苏医保发〔2025〕20号 · iter-20 research 核验） */
const REF_ID = 'KB1-江苏-护理价格2025';

const JIANGSU_NURSING_PRICE = {
  '特级护理': 160,
  '一级护理': 65,
  '二级护理': 30,
  '三级护理': 22,
};

const POLICY_ENTRY = {
  doc_id: 'KB1-江苏',
  ref_id: REF_ID,
  layer: '目录',
  authority: '江苏省医保局',
  doc_no: '苏医保发〔2025〕20号',
  doc_name: '江苏省基本医疗保险江苏省护理类医疗服务价格项目规范整合',
  effective_from: '2025-01-01',
  effective_to: null,
  region: '江苏省',
  unit_type: '项目行',
  locator: '护理类价格（元/日）',
  text: '江苏省护理类医疗服务价格项目规范整合（苏医保发〔2025〕20号）：特级护理160元/日、一级护理65元/日、二级护理30元/日、三级护理22元/日。重症监护与专项护理不得重复收取一般专项护理费用（与重症问题清单序175口径一致，本省价格目录执行）。',
  violation_tags: ['超标准收费', '重复收费'],
  linked_rules: ['A-105', 'ICU-301'],
  source_url: 'http://ybj.jiangsu.gov.cn/',
  verify_status: '✅已核实（iter-20 research：特160/Ⅰ65/Ⅱ30/Ⅲ22元/日官方表述）',
  audit_note: '替换 hospital.js 占位12元/日；A-105 差额核算以本省目录单价为准。',
};

module.exports = { REF_ID, JIANGSU_NURSING_PRICE, POLICY_ENTRY };
