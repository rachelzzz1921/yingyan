-- 鹰眼 · Route B 知识库（Supabase 结构化 + pgvector 语义层）
-- KB1 精确召回走 ref_id；KB2 / 问题清单走向量检索

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- kb_entries — 结构化条目（法规条款、目录行、临床指南、问题清单项）
-- ---------------------------------------------------------------------------
create table if not exists kb_entries (
  id uuid primary key default gen_random_uuid(),
  kb_layer text not null check (kb_layer in ('KB1', 'KB2', 'PL')),
  ref_id text not null unique,
  doc_id text,
  layer text,
  authority text,
  doc_no text,
  doc_name text,
  effective_from date,
  effective_to date,
  region text,
  unit_type text,
  locator text,
  text text not null,
  violation_tags text[] default '{}',
  linked_rules text[] default '{}',
  verify_status text,
  source_url text,
  metadata jsonb not null default '{}',
  corpus_version text not null default '2026.06.15-v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_kb_entries_layer on kb_entries (kb_layer);
create index if not exists idx_kb_entries_ref on kb_entries (ref_id);
create index if not exists idx_kb_entries_rules on kb_entries using gin (linked_rules);

-- ---------------------------------------------------------------------------
-- kb_chunks — 语义检索分块（pgvector；embedding 由阶跃 Vector Store 或离线脚本写入）
-- ---------------------------------------------------------------------------
create table if not exists kb_chunks (
  id uuid primary key default gen_random_uuid(),
  ref_id text not null references kb_entries(ref_id) on delete cascade,
  kb_layer text not null,
  chunk_index int not null default 0,
  content text not null,
  metadata jsonb not null default '{}',
  embedding vector(1024),
  corpus_version text not null default '2026.06.15-v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ref_id, chunk_index, corpus_version)
);

create index if not exists idx_kb_chunks_layer on kb_chunks (kb_layer);
create index if not exists idx_kb_chunks_ref on kb_chunks (ref_id);

-- ---------------------------------------------------------------------------
-- kb_documents — RAGFlow PDF 解析暂存（Route B 解析层 → 人工/脚本核准 → kb_entries）
-- ---------------------------------------------------------------------------
create table if not exists kb_documents (
  id uuid primary key default gen_random_uuid(),
  source_path text,
  ragflow_doc_id text,
  parse_status text not null default 'pending'
    check (parse_status in ('pending', 'parsing', 'parsed', 'approved', 'rejected', 'failed')),
  title text,
  layer text,
  raw_text text,
  parsed_json jsonb,
  error_message text,
  corpus_version text not null default '2026.06.15-v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_kb_documents_status on kb_documents (parse_status);

-- ---------------------------------------------------------------------------
-- kb_sync — 阶跃 Vector Store 同步元数据
-- ---------------------------------------------------------------------------
create table if not exists kb_sync (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'stepfun',
  vector_store_id text,
  vector_store_name text not null default 'yingyan-kb',
  last_sync_at timestamptz,
  entry_count int default 0,
  metadata jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 向量相似度检索（调试 / 服务端调用）
-- ---------------------------------------------------------------------------
create or replace function kb_match(
  query_embedding vector(1024),
  match_layer text default null,
  match_count int default 8,
  min_similarity float default 0.3
)
returns table (
  ref_id text,
  kb_layer text,
  content text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    c.ref_id,
    c.kb_layer,
    c.content,
    (1 - (c.embedding <=> query_embedding))::float as similarity
  from kb_chunks c
  where c.embedding is not null
    and (match_layer is null or c.kb_layer = match_layer)
    and (1 - (c.embedding <=> query_embedding)) >= min_similarity
  order by c.embedding <=> query_embedding
  limit match_count;
end;
$$;

alter table kb_entries enable row level security;
alter table kb_chunks enable row level security;
alter table kb_documents enable row level security;
alter table kb_sync enable row level security;

create policy "kb_entries_read" on kb_entries for select using (true);
create policy "kb_chunks_read" on kb_chunks for select using (true);
create policy "kb_documents_read" on kb_documents for select using (true);
create policy "kb_sync_read" on kb_sync for select using (true);

comment on table kb_entries is '鹰眼 KB1/KB2/问题清单结构化条目 — ref_id 精确召回';
comment on table kb_chunks is '语义分块；embedding 维度假设 1024（与阶跃 Vector Store 对齐）';
comment on table kb_documents is 'RAGFlow PDF 解析暂存，核准后写入 kb_entries';
