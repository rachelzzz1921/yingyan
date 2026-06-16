'use strict';

function env(k, fallback = '') {
  return (process.env[k] || fallback).trim();
}

function isConfigured(v) {
  if (!v) return false;
  const s = String(v).trim();
  if (!s || s.startsWith('your_') || s === 'changeme') return false;
  return true;
}

function ragConfig() {
  return {
    enabled: env('RAG_ENABLED', 'true') !== 'false',
    mode: env('RAG_MODE', 'auto'), // auto | supabase | json
    corpusVersion: env('RAG_CORPUS_VERSION', '2026.06.15-v1'),
    supabaseUrl: env('SUPABASE_URL'),
    supabaseServiceKey: env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SERVICE_KEY'),
    supabaseAnonKey: env('SUPABASE_ANON_KEY'),
    stepfunApiKey: env('STEPFUN_API_KEY') || env('STEP_API_KEY'),
    stepfunBaseUrl: env('STEPFUN_BASE_URL', 'https://api.stepfun.com/v1'),
    stepfunVectorStoreId: env('STEPFUN_VECTOR_STORE_ID'),
    stepfunVectorStoreName: env('STEPFUN_VECTOR_STORE_NAME', 'yingyan-kb'),
    ragflowUrl: env('RAGFLOW_URL'),
    ragflowApiKey: env('RAGFLOW_API_KEY'),
    embeddingProvider: env('RAG_EMBEDDING_PROVIDER', 'dashscope'),
    embeddingModel: env('RAG_EMBEDDING_MODEL', 'text-embedding-v3'),
    embeddingDimensions: Number(env('RAG_EMBEDDING_DIMENSIONS', '1024')),
    dashscopeApiKey: env('DASHSCOPE_API_KEY'),
    zhipuApiKey: env('ZHIPU_API_KEY'),
  };
}

function canUseSupabase(cfg = ragConfig()) {
  return isConfigured(cfg.supabaseUrl) && isConfigured(cfg.supabaseServiceKey);
}

function canUseStepfun(cfg = ragConfig()) {
  return isConfigured(cfg.stepfunApiKey);
}

module.exports = { ragConfig, canUseSupabase, canUseStepfun, isConfigured };
