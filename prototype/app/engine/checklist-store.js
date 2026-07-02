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

// ---------- 全量自查清单工作台（从官方问题清单 KB 生成，逐条可勾选） ----------

const PROGRESS_PATH = path.join(__dirname, '../../data/priority/checklist_progress.json');
const PROGRESS_STATUSES = ['未查', '已查无问题', '发现问题', '已整改'];

// 违规类型关键词 → 可对照的引擎规则（供"引擎命中"提示，非强绑定）
const TYPE_RULE_MAP = [
  [/重复收费|重复计费/, ['A-101', 'A-102']],
  [/分解收费|分解项目/, ['A-106']],
  [/串换/, ['A-107']],
  [/超标准/, ['A-103', 'A-104', 'A-105']],
  [/虚记|虚构/, ['A-108']],
  [/多记|超量|超医嘱/, ['A-109']],
  [/过度(检查|诊疗)/, ['B-207']],
  [/无指征/, ['B-202', 'B-207']],
  [/限定支付|超限定/, ['B-201']],
  [/高套|高编/, ['D-401']],
  [/分解住院/, ['C-301']],
  [/转嫁/, ['D-402', 'T-207']],
  [/挂床/, ['C-302']],
];
const DOMAIN_RULE_MAP = {
  肿瘤: ['T-201', 'T-202', 'T-203', 'T-204', 'T-205', 'T-206', 'T-207', 'T-208'],
  麻醉: ['M-301', 'M-302', 'M-303', 'M-304'],
  重症医学: ['ICU-301', 'ICU-302', 'ICU-303'],
  医学影像: ['IMG-301', 'IMG-302', 'IMG-303'],
  定点零售药店: ['P-301', 'P-302', 'P-303'],
  心血管内科: ['CV-301', 'CV-302'],
  血液净化: ['BP-301'],
};

/** 从 kb1_problem_lists.json 的 domains 生成全量可勾选清单（12 领域 236 条） */
function buildFullChecklist(problemLists) {
  const items = [];
  for (const d of problemLists?.domains || []) {
    for (const it of d.items || []) {
      const typeRules = [];
      for (const [re, rules] of TYPE_RULE_MAP) {
        if (re.test(`${it.type || ''} ${it.text || ''}`)) typeRules.push(...rules);
      }
      const domainRules = DOMAIN_RULE_MAP[d.domain] || [];
      items.push({
        id: `${d.domain}-${d.version || ''}-${it.no ?? items.length + 1}`,
        domain: d.domain,
        version: d.version || '',
        no: it.no ?? null,
        type: it.type || '',
        text: it.text || '',
        verify: d.verify_status || '',
        rule_profile: [...new Set([...typeRules, ...domainRules])],
      });
    }
  }
  return {
    checklist_id: 'national-full-self',
    name: '定点医疗机构自查自纠问题清单（官方全量 · 逐条勾选）',
    scope: 'national-full',
    source: 'kb1_problem_lists.json',
    items,
    updated_at: new Date().toISOString(),
  };
}

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8')); } catch { return { checklists: {} }; }
}

function saveProgress(data) {
  fs.mkdirSync(path.dirname(PROGRESS_PATH), { recursive: true });
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function setItemProgress(checklistId, itemId, { status, dept, note } = {}) {
  if (status && !PROGRESS_STATUSES.includes(status)) {
    return { ok: false, error: `status 必须是 ${PROGRESS_STATUSES.join('/')}` };
  }
  const data = loadProgress();
  data.checklists = data.checklists || {};
  const cl = data.checklists[checklistId] = data.checklists[checklistId] || {};
  cl[itemId] = {
    ...(cl[itemId] || {}),
    ...(status ? { status } : {}),
    ...(dept !== undefined ? { dept } : {}),
    ...(note !== undefined ? { note } : {}),
    updated_at: new Date().toISOString(),
  };
  saveProgress(data);
  return { ok: true, item: cl[itemId] };
}

/** 清单 + 勾选进度 + 按领域完成率统计（+ 可选引擎命中映射） */
function checklistWithProgress(checklist, findings = null) {
  const progress = (loadProgress().checklists || {})[checklist.checklist_id] || {};
  const activeFindings = (findings || []).filter(f => !f.shadow);
  const byDomain = {};
  const rows = checklist.items.map(item => {
    const pg = progress[item.id] || {};
    const status = pg.status || '未查';
    const hits = activeFindings.filter(f => (item.rule_profile || []).includes(f.rule_id));
    const dm = byDomain[item.domain] = byDomain[item.domain] || { domain: item.domain, total: 0, checked: 0, found: 0, rectified: 0, engine_hits: 0 };
    dm.total++;
    if (status !== '未查') dm.checked++;
    if (status === '发现问题') dm.found++;
    if (status === '已整改') dm.rectified++;
    if (hits.length) dm.engine_hits++;
    return {
      ...item,
      status,
      dept: pg.dept || '',
      note: pg.note || '',
      progress_updated_at: pg.updated_at || null,
      engine_hit: hits.length > 0,
      engine_findings: hits.map(f => ({ finding_id: f.finding_id, rule_id: f.rule_id, status: f.status, amount: f.amount_involved })),
    };
  });
  const totals = rows.reduce((a, r) => {
    a.total++;
    if (r.status !== '未查') a.checked++;
    if (r.status === '发现问题') a.found++;
    if (r.status === '已整改') a.rectified++;
    return a;
  }, { total: 0, checked: 0, found: 0, rectified: 0 });
  return {
    ok: true,
    checklist_id: checklist.checklist_id,
    name: checklist.name,
    summary: { ...totals, completion: totals.total ? Math.round(totals.checked / totals.total * 100) : 0 },
    by_domain: Object.values(byDomain),
    rows,
  };
}

module.exports = {
  CHECKLIST_PATH,
  PROGRESS_PATH,
  PROGRESS_STATUSES,
  loadChecklists,
  saveChecklists,
  listChecklists,
  getChecklist,
  mapChecklistToFindings,
  buildFullChecklist,
  loadProgress,
  saveProgress,
  setItemProgress,
  checklistWithProgress,
};
