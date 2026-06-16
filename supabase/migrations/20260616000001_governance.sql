-- 鹰眼 · 规则治理落库（iter-25 T8-1）
-- 本地 rule_states.json ↔ Supabase 双向同步；快照表供审计备份

create table if not exists governance_rule_states (
  rule_id text primary key,
  status text not null default 'active'
    check (status in ('active', 'shadow', 'deprecated', 'draft', 'in_review')),
  reason text,
  ack_rejects int not null default 0,
  history jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  synced_at timestamptz not null default now()
);

create index if not exists idx_governance_rule_states_status on governance_rule_states (status);

create table if not exists governance_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot jsonb not null,
  source text not null default 'local',
  created_at timestamptz not null default now()
);

create index if not exists idx_governance_snapshots_created on governance_snapshots (created_at desc);

alter table governance_rule_states enable row level security;
alter table governance_snapshots enable row level security;

create policy "governance_rule_states_read" on governance_rule_states for select using (true);
create policy "governance_snapshots_read" on governance_snapshots for select using (true);

comment on table governance_rule_states is '规则三态治理落盘 — shadow/deprecated/active';
comment on table governance_snapshots is '治理全量快照备份（rule_states + review 统计聚合）';
