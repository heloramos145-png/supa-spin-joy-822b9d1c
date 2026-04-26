-- ============================================================
-- SQL 1 — Criar a tabela double_results
-- ============================================================
-- IMPORTANTE: Se você já tem uma tabela double_results com schema
-- diferente (game_id, roll, color int), renomeie antes de rodar:
--   ALTER TABLE public.double_results RENAME TO double_results_old;

create table if not exists public.double_results (
  id uuid primary key default gen_random_uuid(),
  jonbet_game_id text unique,
  number integer not null,
  color text not null,
  rolled_at timestamptz not null,
  minute_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_double_results_rolled_at
  on public.double_results (rolled_at desc);

create index if not exists idx_double_results_minute_key
  on public.double_results (minute_key);

alter table public.double_results enable row level security;

drop policy if exists "Anyone can view double results" on public.double_results;
create policy "Anyone can view double results"
  on public.double_results for select
  to public
  using (true);
