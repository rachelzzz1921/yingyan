-- 鹰眼 · 竞赛交付演示表（与官方模板一致，便于 compose 自测）
create table if not exists demo_result (
  id bigserial primary key,
  name text not null,
  score numeric not null,
  created_at timestamptz not null default now()
);
