-- iter-26 · 治理表 RLS 写策略收紧
-- anon/authenticated 仅 SELECT；INSERT/UPDATE/DELETE 仅 service_role（绕过 RLS）

revoke insert, update, delete on public.governance_rule_states from anon, authenticated;
revoke insert, update, delete on public.governance_snapshots from anon, authenticated;

grant select on public.governance_rule_states to anon, authenticated;
grant select on public.governance_snapshots to anon, authenticated;

-- 快照表禁止 anon 读取（含 review 聚合，略敏感）— 仅 service_role + 应用层 token
revoke select on public.governance_snapshots from anon, authenticated;

comment on policy "governance_rule_states_read" on public.governance_rule_states is
  'iter-26: 公开只读 rule_id/status；写入走 service_role + YINGYAN_ADMIN_TOKEN 应用层';
