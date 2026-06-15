/**
 * 鹰眼 · 材料摄取层（输入端）—— 把"材料怎么进来"补齐
 * ------------------------------------------------------------
 * 三条入口，统一产出 medical_record 结构化材料包（再交给事实层+引擎）：
 *   1) structured  —— 直接上传/粘贴已结构化 JSON（即刻可用，无需任何外部依赖）
 *   2) document    —— 扫描件/照片/PDF 多模态解析 → 结构化（接 Claude 视觉；无 key 时给出接 PP-StructureV3/RAGFlow 的契约说明）
 *   3) connector   —— 从医院 HIS/EMR/FHIR 拉取（见 connectors/hospital.js 的适配器接口）
 *
 * 设计原则：摄取产物必须满足 medical_record 契约（下方 REQUIRED_SHAPE），
 *           多模态解析要尽量带回每个字段的源锚点(page/bbox/ocr_conf)，喂给事实层的 anchor。
 */
'use strict';

const { callVision, isReady, providerName, visionModelName } = require('./llm-provider');

// medical_record 契约（最小必备形状）——摄取产物据此校验
const REQUIRED_SHAPE = {
  required: ['case_meta', 'front_page', 'fee_list'],
  front_page: ['patient_name', 'admit_time', 'discharge_time', 'principal_diagnosis'],
  fee_list: ['items'],
};

function validateRecord(rec) {
  const errs = [];
  for (const k of REQUIRED_SHAPE.required) if (!rec[k]) errs.push(`缺少顶层字段 ${k}`);
  if (rec.front_page) for (const k of REQUIRED_SHAPE.front_page) if (rec.front_page[k] == null) errs.push(`front_page 缺少 ${k}`);
  if (rec.fee_list && !Array.isArray(rec.fee_list.items)) errs.push('fee_list.items 必须是数组');
  return { ok: errs.length === 0, errors: errs };
}

// ① 结构化上传/粘贴
function ingestStructured(json) {
  let rec;
  try { rec = typeof json === 'string' ? JSON.parse(json) : json; }
  catch (e) { return { ok: false, error: 'JSON 解析失败: ' + e.message }; }
  const v = validateRecord(rec);
  if (!v.ok) return { ok: false, error: '材料不满足 medical_record 契约', details: v.errors };
  return { ok: true, record: rec, parse_log: ['structured: 直接采用上传的结构化材料，已通过契约校验'], source: 'structured' };
}

// ② 多模态解析（扫描件/照片/PDF → 结构化）
async function ingestDocument(base64, mime) {
  if (!isReady()) {
    return {
      ok: false,
      error: '多模态解析需配置视觉模型（MINIMAX_API_KEY / ANTHROPIC_API_KEY）或接入 PP-StructureV3/RAGFlow DeepDoc',
      contract: {
        说明: '本端点已留好；生产可接两类解析器，二者均回填 medical_record 契约 + 每字段源锚点',
        选项A_视觉模型: '配 MINIMAX_API_KEY(原生多模态) 后本端点用 MiniMax-VL 直接读扫描件/照片 → 结构化',
        选项B_PP_StructureV3: 'PaddleOCR PP-StructureV3 布局解析→坐标JSON(每元素bbox)→映射 medical_record，bbox直接填事实层 anchor.bbox（点击疑点→原件高亮的坐标来源）',
        选项C_RAGFlow_DeepDoc: 'RAGFlow DeepDoc 解析扫描件表格/多栏，引用可跳源文档精确位置',
      },
    };
  }
  const isPdf = /pdf/i.test(mime);
  if (isPdf) return { ok: false, error: 'PDF 需先转图像页（视觉模型读图像）。请上传扫描件/照片(jpg/png)，或生产期接 PP-StructureV3 直读PDF。' };
  let text;
  try {
    text = await callVision({ system: '你是医保病历结构化抽取器，只输出JSON。', user: buildExtractionPrompt(), images: [base64], mime: mime || 'image/png', maxTokens: 8000 });
  } catch (e) { return { ok: false, error: '视觉模型调用失败: ' + e.message }; }
  const jsonStr = (text.match(/\{[\s\S]*\}/) || [text])[0];
  let rec;
  try { rec = JSON.parse(jsonStr); } catch (e) { return { ok: false, error: '解析结果非合法JSON: ' + e.message, raw: text.slice(0, 200) }; }
  const v = validateRecord(rec);
  return {
    ok: true, record: rec, source: `document(vision·${visionModelName()})`,
    parse_log: [`多模态: ${visionModelName()} 读取图像→结构化`, v.ok ? '契约校验通过' : '契约部分缺失(降级可用): ' + v.errors.join('；')],
    warnings: v.ok ? [] : v.errors,
  };
}

function buildExtractionPrompt() {
  return [
    '你是医保病历结构化抽取器。读取这份医疗材料（扫描件/PDF/照片），抽取为鹰眼 medical_record JSON。',
    '只输出 JSON，不要解释。尽量带回每个关键字段的源位置(页码/区域)，放在 anchor 里。schema：',
    '{ "case_meta":{"case_id","case_title","embedded_violation_count":0},',
    '  "front_page":{"patient_name","sex","age","admit_time","discharge_time","principal_diagnosis":{"name","icd10"},"other_diagnosis":[]},',
    '  "admission_note":{"chief_complaint","present_illness"}, "progress_notes":[{"date","type","text"}],',
    '  "long_term_orders":{"items":[{"order_id","content","start","stop"}]}, "temporary_orders":{"items":[]},',
    '  "nursing_records":{"nursing_level_executed","entries":[]}, "lab_reports":[{"report_id","category","results":[{"item","value","unit","ref"}]}],',
    '  "pathology_report":{}, "gene_test_report":{"status"}, "operation_note":null,',
    '  "fee_list":{"items":[{"line_no","fee_date","category","item_name","spec","qty","unit","unit_price","amount","insurance_class","linked_order","anchor":{"doc","page","bbox":[x,y,w,h],"ocr_conf"}}]}, "discharge_summary":{} }',
    '抽不到的字段给合理默认或省略；数字字段必须是 number；OCR 不确定的字段把 anchor.ocr_conf 设低（<0.8）。',
  ].join('\n');
}

module.exports = { ingestStructured, ingestDocument, validateRecord };
