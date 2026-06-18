'use strict';

const fs = require('fs');
const path = require('path');

const CHECKLIST_PATH = path.join(__dirname, '../../data/priority/checklists.json');

const DEFAULT_CHECKLIST = {
  checklists: [{
    checklist_id: 'national-2026-self',
    name: '2026 定点医疗机构自查自纠问题清单（演示版）',
    scope: 'national',
    items: [
      { id: 'Q-01', domain: '肿瘤', text: '无指征开展基因检测或靶向用药', rule_profile: ['T-201', 'T-203'] },
      { id: 'Q-02', domain: '骨科', text: '重复收费、分解收费、串换项目', rule_profile: ['A-101', 'A-106', 'A-107'] },
      { id: 'Q-03', domain: 'DRG', text: '高编高套、分解住院、转嫁费用', rule_profile: ['D-401', 'C-301', 'D-402'] },
      { id: 'Q-04', domain: '临床检验', text: '重复收费（血气分析含电解质等）', rule_profile: ['A-105'] },
      { id: 'Q-05', domain: '重症医学', text: '呼吸机/CRRT 时长与明细不符', rule_profile: ['ICU-302'] },
    ],
    rule_profile: { mode: 'exam', engine: 'deterministic' },
    updated_at: '2026-06-18T00:00:00.000Z',
  }],
};

function loadChecklists() {
  try {
    return JSON.parse(fs.readFileSync(CHECKLIST_PATH, 'utf8'));
  } catch {
    return DEFAULT_CHECKLIST;
  }
}

function saveChecklists(data) {
  fs.mkdirSync(path.dirname(CHECKLIST_PATH), { recursive: true });
  fs.writeFileSync(CHECKLIST_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function listChecklists() {
  return loadChecklists().checklists || [];
}

function getChecklist(id) {
  return listChecklists().find(c => c.checklist_id === id) || null;
}

function mapChecklistToFindings(checklistId, findings) {
  const cl = getChecklist(checklistId);
  if (!cl) return { ok: false, error: 'checklist not found' };
  const active = (findings || []).filter(f => !f.shadow);
  return {
    ok: true,
    checklist: cl,
    rows: cl.items.map(item => {
      const hits = active.filter(f => item.rule_profile.includes(f.rule_id));
      return {
        ...item,
        hit: hits.length > 0,
        findings: hits.map(f => ({
          finding_id: f.finding_id,
          status: f.status,
          amount: f.amount_involved,
          policy_excerpt: f.policy?.[0]?.text?.slice(0, 200),
        })),
      };
    }),
  };
}

module.exports = {
  CHECKLIST_PATH,
  loadChecklists,
  saveChecklists,
  listChecklists,
  getChecklist,
  mapChecklistToFindings,
};
