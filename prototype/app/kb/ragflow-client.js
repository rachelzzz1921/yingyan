'use strict';

const { ragConfig } = require('./config');

/**
 * Route B · RAGFlow PDF 解析客户端（契约层）
 * 部署 RAGFlow 后填入 RAGFLOW_URL + RAGFLOW_API_KEY，由 ingest 脚本调用。
 */
async function parseDocument({ filePath, title, layer }) {
  const cfg = ragConfig();
  if (!cfg.ragflowUrl || !cfg.ragflowApiKey) {
    return {
      ok: false,
      status: 'skipped',
      reason: 'RAGFlow 未配置（RAGFLOW_URL / RAGFLOW_API_KEY）',
    };
  }
  const res = await fetch(`${cfg.ragflowUrl.replace(/\/$/, '')}/api/v1/documents/parse`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.ragflowApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file_path: filePath, title, layer }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, status: 'failed', reason: data.message || res.statusText };
  }
  return {
    ok: true,
    status: 'parsed',
    ragflow_doc_id: data.doc_id || data.id,
    parsed_json: data,
  };
}

module.exports = { parseDocument };
