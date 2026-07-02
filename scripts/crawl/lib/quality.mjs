// KB 入库质量门：拦截表头错位/纯编号/合计行等解析垃圾。
// 历史教训：两库 xlsx 表头启发式失败时，会把「序号」「1」「合计」当正文入库
// （batch1 产出 781 条中 ~172 条坏行）。判定规则用实测校准过：
// 合法条目最短如「地诺前列酮栓 · 参保人险种非生育保险 · 1 · 限生育保险 · 1」不会被误杀。

export function isJunkPolicyText(text) {
  const t = String(text || '').trim();
  if (!t) return true;
  if (/^(序号|合计|小计|备注|\d+(\.\d+)?)$/.test(t)) return true;
  // 政策/知识点正文必然含至少一段 ≥4 连续汉字；纯数字/编号/符号拼接行不含
  if (!/[\u4e00-\u9fa5]{4,}/.test(t)) return true;
  return false;
}

/** 过滤 policies 数组，返回 { kept, rejected, rejectedRows } */
export function filterJunkPolicies(policies) {
  const kept = [];
  const rejectedRows = [];
  for (const p of policies || []) {
    if (isJunkPolicyText(p.text)) rejectedRows.push(p);
    else kept.push(p);
  }
  return { kept, rejected: rejectedRows.length, rejectedRows };
}
