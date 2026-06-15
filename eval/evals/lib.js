// lib.js — 共享工具:稳健 JSON 提取、路径取值、声明式断言引擎、模板填充、并发。
'use strict';
const fs = require('fs');
const path = require('path');

const PROMPT_DIR = path.join(__dirname, '..', 'prompts');
const PROMPT_DIR_V7 = path.join(__dirname, '..', 'prompts_v7');

// ---- 稳健 JSON 提取(任务 §5)----
// 难点:弱模型常先输出思维链(其中会回显 trigger_elements 这类 {..} 片段),
// 再在 ```json 围栏里给最终答案,最后还跟一段"### 解释"散文。
// 朴素的"首{到末}"会把中间的推理花括号一并吞入 → 误判 JSON 不合规。
// 正确做法:① 优先取 ```json 围栏内容(取最后一个能解析的);
//          ② 否则用"字符串感知的配平花括号扫描"枚举所有顶层 {..},取最后一个能解析成对象的(最终答案通常在最后);
//          ③ 最后才回退首{到末}。失败返回 null(计 JSON 不合规,不崩溃)。
function tryParse(s) {
  try { return JSON.parse(s); } catch (_) {}
  // 容错:去尾随逗号
  try { return JSON.parse(s.replace(/,\s*([}\]])/g, '$1')); } catch (_) {}
  return undefined;
}
// 字符串感知地找出所有顶层配平的 {...} 子串
function balancedObjects(t) {
  const out = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let k = 0; k < t.length; k++) {
    const ch = t[k];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') { if (depth === 0) start = k; depth++; }
    else if (ch === '}') { depth--; if (depth === 0 && start >= 0) { out.push(t.slice(start, k + 1)); start = -1; } }
  }
  return out;
}
function extractJson(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.trim();
  // ① ```json 围栏:取所有围栏块,从后往前找第一个能解析的
  const fenceRe = /```(?:json|JSON)?\s*([\s\S]*?)```/g;
  const fences = [];
  let m;
  while ((m = fenceRe.exec(t)) !== null) fences.push(m[1].trim());
  for (let k = fences.length - 1; k >= 0; k--) {
    const r = tryParse(fences[k]);
    if (r !== undefined && r !== null && typeof r === 'object') return r;
    // 围栏内若仍夹散文,扫配平对象
    const objs = balancedObjects(fences[k]);
    for (let q = objs.length - 1; q >= 0; q--) { const rr = tryParse(objs[q]); if (rr && typeof rr === 'object' && !Array.isArray(rr)) return rr; }
  }
  // ② 整段直接 parse
  const whole = tryParse(t);
  if (whole !== undefined && whole !== null) return whole;
  // ③ 配平花括号扫描:取最后一个能解析成"对象"(非数组)的
  const objs = balancedObjects(t);
  for (let k = objs.length - 1; k >= 0; k--) {
    const r = tryParse(objs[k]);
    if (r && typeof r === 'object' && !Array.isArray(r)) return r;
  }
  // ④ 回退:首{到末}
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i >= 0 && j > i) { const r = tryParse(t.slice(i, j + 1)); if (r !== undefined) return r; }
  return null;
}

// ---- 路径取值:支持 "a.b.0.c" ----
function getPath(obj, p) {
  if (obj == null) return undefined;
  const parts = String(p).split('.');
  let cur = obj;
  for (const part of parts) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}

function asArray(v) { return Array.isArray(v) ? v : (v == null ? [] : [v]); }
function isNonEmptyArray(v) { return Array.isArray(v) && v.length > 0; }
function isEmptyArrayOrAbsent(v) { return v == null || (Array.isArray(v) && v.length === 0); }

// 数值近似(模型可能输出字符串/带单位),抽数字比较
function toNum(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const m = v.replace(/[, ]/g, '').match(/-?\d+(\.\d+)?/);
    if (m) return parseFloat(m[0]);
  }
  return NaN;
}

// 递归收集对象中所有数值(用于"无任何金额等于被篡改值"这类检查)
function collectNumbers(obj, acc = []) {
  if (obj == null) return acc;
  if (typeof obj === 'number') { acc.push(obj); return acc; }
  if (typeof obj === 'string') { const n = toNum(obj); if (!isNaN(n)) acc.push(n); return acc; }
  if (Array.isArray(obj)) { obj.forEach(x => collectNumbers(x, acc)); return acc; }
  if (typeof obj === 'object') { Object.values(obj).forEach(x => collectNumbers(x, acc)); return acc; }
  return acc;
}

// ---- 声明式断言引擎 ----
// expect 支持的键(每个生成一条断言):
//   is_json: true                        → parsed!=null
//   nonempty: ["path", ...]              → 数组非空
//   empty: ["path", ...]                 → 数组为空/不存在
//   equals: {path: value}                → 严格等
//   not_equals: {path: value}            → 不等
//   in: {path: [v1,v2]}                  → 取值 ∈ 列表
//   not_in: {path: [v1,v2]}              → 取值 ∉ 列表
//   truthy: ["path"]                     → 真值
//   falsy: ["path"]                      → 假值/不存在
//   custom: ["checkName", ...]           → 调 customChecks[checkName](parsed, raw, caseObj)
// custom 函数返回 {pass:bool, detail:string}
function runExpect(expect, parsed, raw, caseObj, customChecks = {}) {
  const results = [];
  const add = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail || '' });

  if (expect == null) return results;

  if (expect.is_json) add('is_json', parsed != null, parsed != null ? '' : 'JSON 不可解析');
  // 若 JSON 都没解析出来,其余结构断言无意义,直接全标失败(但仍记录)
  const jsonOk = parsed != null;

  for (const p of expect.nonempty || []) {
    const v = getPath(parsed, p);
    add(`nonempty:${p}`, jsonOk && isNonEmptyArray(v), jsonOk ? `len=${Array.isArray(v) ? v.length : 'N/A'}` : 'no-json');
  }
  for (const p of expect.empty || []) {
    const v = getPath(parsed, p);
    add(`empty:${p}`, jsonOk && isEmptyArrayOrAbsent(v), jsonOk ? `val=${JSON.stringify(v)}` : 'no-json');
  }
  for (const [p, val] of Object.entries(expect.equals || {})) {
    const v = getPath(parsed, p);
    add(`equals:${p}=${JSON.stringify(val)}`, jsonOk && v === val, `got=${JSON.stringify(v)}`);
  }
  for (const [p, val] of Object.entries(expect.not_equals || {})) {
    const v = getPath(parsed, p);
    add(`not_equals:${p}!=${JSON.stringify(val)}`, jsonOk && v !== val, `got=${JSON.stringify(v)}`);
  }
  for (const [p, arr] of Object.entries(expect.in || {})) {
    const v = getPath(parsed, p);
    add(`in:${p}∈${JSON.stringify(arr)}`, jsonOk && arr.includes(v), `got=${JSON.stringify(v)}`);
  }
  for (const [p, arr] of Object.entries(expect.not_in || {})) {
    const v = getPath(parsed, p);
    add(`not_in:${p}∉${JSON.stringify(arr)}`, jsonOk && !arr.includes(v), `got=${JSON.stringify(v)}`);
  }
  for (const p of expect.truthy || []) {
    const v = getPath(parsed, p);
    add(`truthy:${p}`, jsonOk && !!v, `got=${JSON.stringify(v)}`);
  }
  for (const p of expect.falsy || []) {
    const v = getPath(parsed, p);
    add(`falsy:${p}`, jsonOk && !v, `got=${JSON.stringify(v)}`);
  }
  for (const name of expect.custom || []) {
    const fn = customChecks[name];
    if (!fn) { add(`custom:${name}`, false, 'check 未实现'); continue; }
    try {
      const r = fn(parsed, raw, caseObj);
      add(`custom:${name}`, r && r.pass, (r && r.detail) || '');
    } catch (e) {
      add(`custom:${name}`, false, 'check 抛错: ' + String(e?.message || e));
    }
  }
  return results;
}

// ---- 模板填充:仅替换精确的 {slot} 占位,绝不动 JSON 示例里的花括号 ----
function fillTemplate(tpl, vars) {
  let out = tpl;
  for (const [k, v] of Object.entries(vars || {})) {
    const val = (typeof v === 'string') ? v : JSON.stringify(v, null, 2);
    out = out.split(`{${k}}`).join(val);
  }
  return out;
}

function loadPrompt(file, useV7 = false) {
  const dir = useV7 ? PROMPT_DIR_V7 : PROMPT_DIR;
  return fs.readFileSync(path.join(dir, file), 'utf8');
}
function loadCases(file) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'cases', file), 'utf8'));
}

// ---- 简单并发 map ----
async function pMap(items, fn, concurrency = 4) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const my = idx++;
      results[my] = await fn(items[my], my);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

// 归一化裁判 verdict / 状态(P5 位置一致性比对用)。
// 折叠同义:违规/成立/维持→疑点;降为线索/存疑→线索;撤销/不成立/不构成违规→撤销。
// 注意:"否定违规"(不构成违规/无违规)必须在"疑点"分支之前判,否则会被"违规"二字误归疑点。
function normVerdict(s) {
  if (!s || typeof s !== 'string') return '';
  const t = s.trim();
  if (/撤销|不成立|不予|驳回|排除|不构成|无违规|未见违规|不属于违规|无疑点/.test(t)) return '撤销';
  if (/线索|存疑|待[观核复审]|降为?线索|降级|有待/.test(t)) return '线索';
  if (/疑点|违规|违法|成立|维持|属实|确认违/.test(t)) return '疑点';
  if (/不报|合规|正常/.test(t)) return '撤销';
  return t;
}

module.exports = {
  extractJson, getPath, asArray, isNonEmptyArray, isEmptyArrayOrAbsent,
  toNum, collectNumbers, runExpect, fillTemplate, loadPrompt, loadCases, pMap, normVerdict,
  PROMPT_DIR, PROMPT_DIR_V7,
};
