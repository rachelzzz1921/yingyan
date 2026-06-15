/**
 * 鹰眼 · 医院系统连接器（接口已留好）
 * ------------------------------------------------------------
 * 统一适配器接口：把医院 HIS/EMR/LIS/电子病历 的一次就诊数据，
 * 拉取/映射为鹰眼 medical_record 结构化材料包。
 *
 * 生产部署时只需为目标医院实现一个 Connector 子类（实现 pullEncounter）。
 * 数据不出域：连接器在院内私有化环境运行，鹰眼引擎本地稽核，二者同网段、患者数据不外发。
 *
 * 已提供：
 *   - MockHISConnector   —— 可运行 demo（返回内置样例，证明链路通）
 *   - FHIRConnector      —— 契约级（FHIR R4 Bundle → medical_record 映射骨架，需配 base/token）
 *   - HL7v2Connector     —— 契约级（HL7 v2 ADT/ORM/ORU 消息 → medical_record，需接院内集成引擎）
 */
'use strict';

/** 适配器基类（接口契约） */
class HospitalConnector {
  constructor(config = {}) { this.config = config; }
  get id() { return 'base'; }
  get name() { return '基础连接器'; }
  get status() { return { ready: false, note: '抽象基类，不可直接用' }; }
  /** 按 就诊标识（住院号/门诊流水号）拉取并映射为 medical_record。返回 {ok, record?, error?} */
  async pullEncounter(encounterId) { throw new Error('未实现 pullEncounter'); }
}

/** ① Mock HIS —— demo 用，返回内置样例，证明"从HIS拉取→稽核"链路打通 */
class MockHISConnector extends HospitalConnector {
  get id() { return 'mock-his'; }
  get name() { return '示范医院 HIS（Mock·演示）'; }
  get status() { return { ready: true, note: '演示连接器：返回内置样例就诊数据' }; }
  async pullEncounter(encounterId) {
    // 真实实现：查 HIS 视图(病案首页/医嘱/收费/检验/病程) → 映射。此处返回最小样例。
    const id = encounterId || 'ZY-MOCK-0001';
    return {
      ok: true,
      record: {
        case_meta: { case_id: 'YY-HIS-' + id, case_title: '从HIS拉取·' + id, embedded_violation_count: null },
        front_page: {
          patient_name: '（HIS脱敏）', sex: '男', age: 60, admit_time: '2026-05-01 09:00', discharge_time: '2026-05-06 10:00',
          principal_diagnosis: { name: '社区获得性肺炎', icd10: 'J18.101' }, other_diagnosis: [],
        },
        progress_notes: [{ date: '2026-05-01', type: '首次病程', text: '从HIS拉取的病程文本（样例）。' }],
        long_term_orders: { items: [{ order_id: 'L01', content: '二级护理', start: '2026-05-01', stop: '2026-05-06' }] },
        temporary_orders: { items: [] },
        nursing_records: { nursing_level_executed: '二级护理', entries: [] },
        lab_reports: [], pathology_report: {}, gene_test_report: { status: '不适用' },
        fee_list: { items: [{ line_no: 1, fee_date: '2026-05-01~05-06', category: '护理费', item_name: '二级护理', qty: 5, unit: '日', unit_price: 12, amount: 60, insurance_class: '医保', linked_order: 'L01' }], total_amount: 60 },
        discharge_summary: { discharge_date: '2026-05-06', discharge_diagnosis: ['社区获得性肺炎'] },
      },
      pull_log: [`MockHIS: 按就诊号 ${id} 拉取病案首页/医嘱/收费/检验/病程并映射为 medical_record`],
    };
  }
}

/** ② FHIR R4 —— 契约级（映射骨架），需配 fhirBase + token */
class FHIRConnector extends HospitalConnector {
  get id() { return 'fhir-r4'; }
  get name() { return 'FHIR R4（电子病历互操作）'; }
  get status() { return { ready: !!this.config.fhirBase, note: this.config.fhirBase ? 'FHIR base 已配' : '需配 fhirBase + token' }; }
  async pullEncounter(encounterId) {
    if (!this.config.fhirBase) return { ok: false, error: '未配置 FHIR base/token（接口已留好：实现下方映射即可）', contract: this.mappingContract() };
    // 生产：GET {base}/Encounter/{id}?_include=... 拉 Patient/Condition/MedicationRequest/Observation/Procedure/ChargeItem
    // 然后按 mappingContract 映射为 medical_record。此处仅声明契约。
    return { ok: false, error: 'FHIR 拉取未实现（契约已声明，按 mappingContract 落地）', contract: this.mappingContract() };
  }
  mappingContract() {
    return {
      'Patient → front_page': '姓名/性别/出生 → patient_name/sex/age',
      'Encounter → front_page': 'period.start/end → admit_time/discharge_time',
      'Condition(主) → principal_diagnosis': 'code(ICD10)+text',
      'MedicationRequest → long_term_orders/temporary_orders': 'dosage+timing → content/start/stop',
      'Observation → lab_reports': 'code+value+unit+referenceRange',
      'Procedure → operation_note': 'code+performedDateTime+用耗材(device)',
      'ChargeItem/Invoice → fee_list': 'code+quantity+priceComponent → item_name/qty/amount',
    };
  }
}

/** ③ HL7 v2 —— 契约级，需接院内集成引擎(Mirth等) */
class HL7v2Connector extends HospitalConnector {
  get id() { return 'hl7v2'; }
  get name() { return 'HL7 v2（ADT/ORM/ORU·集成引擎）'; }
  get status() { return { ready: false, note: '需接院内集成引擎(如 Mirth Connect) 订阅 ADT/ORM/ORU 消息' }; }
  async pullEncounter() { return { ok: false, error: 'HL7v2 需经院内集成引擎，接口已留好（订阅 ADT-A01入院/ORM医嘱/ORU检验 消息→映射）' }; }
}

const REGISTRY = [new MockHISConnector(), new FHIRConnector(), new HL7v2Connector()];

function listConnectors() {
  return REGISTRY.map(c => ({ id: c.id, name: c.name, status: c.status }));
}
function getConnector(id) { return REGISTRY.find(c => c.id === id); }

module.exports = { HospitalConnector, MockHISConnector, FHIRConnector, HL7v2Connector, listConnectors, getConnector };
