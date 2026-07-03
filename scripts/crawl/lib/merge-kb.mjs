import fs from 'fs';
import path from 'path';
import { KB_DIR, CORPUS_KB_DIR, CONFIG, ROOT } from '../config.mjs';
import { isJunkPolicyText } from './quality.mjs';

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function saveJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
}

function isProtected(entry) {
  const vs = entry.verify_status || '';
  return CONFIG.protectedVerifyPrefixes.some((p) => vs.startsWith(p));
}

function shouldReplace(existing, incoming, force) {
  if (!existing) return true;
  if (isProtected(existing) && !force) return false;
  return true;
}

function upsertPolicies(kb, incoming, force) {
  const byRef = new Map((kb.entries || []).map((e) => [e.ref_id, e]));
  // 两库 content_key 去重：新稳定 ref_id 入库时移除同内容旧 ref（仅爬虫待抽检条目）
  const liangkuByContent = new Map();
  for (const e of kb.entries || []) {
    if (e.doc_id !== 'KB1-两库2025') continue;
    const ck = e.metadata?.content_key;
    if (ck) liangkuByContent.set(ck, e.ref_id);
  }

  let added = 0;
  let updated = 0;
  let skipped = 0;
  let rejected = 0;
  let deduped = 0;
  for (const row of incoming) {
    // 入库质量门（第二道防线，覆盖所有 parser）：解析垃圾不入库
    if (isJunkPolicyText(row.text)) {
      rejected++;
      continue;
    }
    const ck = row.metadata?.content_key;
    if (ck && row.doc_id === 'KB1-两库2025') {
      const oldRef = liangkuByContent.get(ck);
      if (oldRef && oldRef !== row.ref_id) {
        const oldEntry = byRef.get(oldRef);
        if (oldEntry && !isProtected(oldEntry)) {
          byRef.delete(oldRef);
          deduped++;
        }
      }
      liangkuByContent.set(ck, row.ref_id);
    }
    const prev = byRef.get(row.ref_id);
    if (!shouldReplace(prev, row, force)) {
      skipped++;
      continue;
    }
    if (prev) updated++;
    else added++;
    byRef.set(row.ref_id, { ...prev, ...row });
  }
  kb.entries = [...byRef.values()];
  return { added, updated, skipped, rejected, deduped, total: kb.entries.length };
}

function mergeProblemDomains(kb, domains, force) {
  if (!domains?.length) return { added: 0, updated: 0, skipped: 0 };
  kb.domains = kb.domains || [];
  const byKey = new Map(kb.domains.map((d) => [`${d.domain}|${d.version}`, d]));
  let added = 0;
  let updated = 0;
  let skipped = 0;
  for (const dom of domains) {
    const key = `${dom.domain}|${dom.version}`;
    const prev = byKey.get(key);
    if (prev && isProtected(prev) && !force) {
      skipped++;
      continue;
    }
    if (prev) {
      const itemMap = new Map((prev.items || []).map((i) => [i.no, i]));
      for (const it of dom.items || []) {
        if (!itemMap.has(it.no)) itemMap.set(it.no, it);
      }
      byKey.set(key, { ...prev, ...dom, items: [...itemMap.values()].sort((a, b) => a.no - b.no) });
      updated++;
    } else {
      byKey.set(key, dom);
      added++;
    }
  }
  kb.domains = [...byKey.values()];
  return { added, updated, skipped };
}

export function mergeIntoKb({ policies = [], problemDomains = [] }, opts = {}) {
  const force = !!opts.force;
  const policiesPath = path.join(KB_DIR, 'kb1_policies.json');
  const problemPath = path.join(KB_DIR, 'kb1_problem_lists.json');
  const kb1 = loadJson(policiesPath);
  const pl = loadJson(problemPath);

  const pStats = upsertPolicies(kb1, policies, force);
  const dStats = mergeProblemDomains(pl, problemDomains, force);

  kb1.kb_meta = kb1.kb_meta || {};
  kb1.kb_meta.last_crawl_at = new Date().toISOString();
  pl.kb_meta = pl.kb_meta || {};
  pl.kb_meta.last_crawl_at = new Date().toISOString();

  saveJson(policiesPath, kb1);
  saveJson(problemPath, pl);

  syncCorpus();

  return {
    policies: pStats,
    problemDomains: dStats,
    paths: { policiesPath, problemPath },
  };
}

function syncCorpus() {
  fs.mkdirSync(CORPUS_KB_DIR, { recursive: true });
  for (const name of ['kb1_policies.json', 'kb1_problem_lists.json']) {
    fs.copyFileSync(path.join(KB_DIR, name), path.join(CORPUS_KB_DIR, name));
  }
}

export function countKbStats() {
  const kb1 = loadJson(path.join(KB_DIR, 'kb1_policies.json'));
  const pl = loadJson(path.join(KB_DIR, 'kb1_problem_lists.json'));
  const items = (pl.domains || []).reduce((n, d) => n + (d.items?.length || 0), 0);
  return {
    kb1_entries: kb1.entries?.length || 0,
    problem_domains: pl.domains?.length || 0,
    problem_items: items,
    total_grand: (kb1.entries?.length || 0) + items,
  };
}

export function updateManifest(crawlSummary) {
  const realPath = path.join(ROOT, 'public-data-corpus/manifest.json');
  if (!fs.existsSync(realPath)) return;
  const manifest = loadJson(realPath);
  const stats = countKbStats();
  manifest.generated_at = new Date().toISOString().slice(0, 10);
  manifest.summary = {
    ...manifest.summary,
    kb1_policy_entries: stats.kb1_entries,
    problem_list_items: stats.problem_items,
    total_grand: stats.total_grand,
    last_crawl: crawlSummary,
  };
  if (!manifest.crawl_runs) manifest.crawl_runs = [];
  manifest.crawl_runs.push({ at: new Date().toISOString(), ...crawlSummary });
  saveJson(realPath, manifest);
}
