-- ============================================================
-- SQL 6 — Limpar duplicatas + blindar contra novas duplicatas
-- ============================================================
-- Execute UMA VEZ no SQL Editor do Supabase.
-- Idempotente: pode rodar de novo sem quebrar.

-- 1) Backfill SEGURO: copia game_id (legacy) pra jonbet_game_id quando vazio
-- Antes, remove linhas legacy cujo game_id colidiria com um jonbet_game_id já existente.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'double_results'
      and column_name = 'game_id'
  ) then
    delete from public.double_results a
    using public.double_results b
    where a.jonbet_game_id is null
      and a.game_id is not null
      and b.jonbet_game_id = a.game_id
      and a.id <> b.id;

    update public.double_results
    set jonbet_game_id = game_id
    where jonbet_game_id is null and game_id is not null;
  end if;
end $$;

-- 2) Backfill: number/color/rolled_at a partir das colunas legacy
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'double_results'
      and column_name = 'roll'
  ) then
    update public.double_results
    set number = coalesce(number, roll)
    where number is null and roll is not null;
  end if;
end $$;

update public.double_results
set color = case
  when number = 0 then 'white'
  when number between 1 and 7 then 'red'
  else 'black'
end
where color is null or color not in ('white','red','black');

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'double_results'
      and column_name = 'created_at'
  ) then
    update public.double_results
    set rolled_at = coalesce(rolled_at, created_at)
    where rolled_at is null and created_at is not null;
  end if;
end $$;

update public.double_results
set minute_key = to_char(rolled_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI')
where minute_key is null and rolled_at is not null;

-- 3) DEDUP: mantém uma única pedra por (number, janela de 25s no rolled_at)
-- Estratégia: agrupa pedras com mesmo number e rolled_at dentro de 25s,
-- mantém a mais antiga, apaga as demais.
with bucketed as (
  select
    id,
    number,
    rolled_at,
    -- bucket de 25 segundos
    floor(extract(epoch from rolled_at) / 25)::bigint as bucket
  from public.double_results
  where rolled_at is not null and number is not null
),
ranked as (
  select
    id,
    row_number() over (
      partition by number, bucket
      order by rolled_at asc, id asc
    ) as rn
  from bucketed
)
delete from public.double_results dr
using ranked
where dr.id = ranked.id and ranked.rn > 1;

-- 4) Constraint de unicidade composta: impede 2 pedras iguais no mesmo
-- bucket de 25s (mesmo número + tempo próximo = mesma pedra duplicada).
-- Usamos um índice único em expressão.
drop index if exists public.uniq_double_results_number_bucket;
create unique index uniq_double_results_number_bucket
  on public.double_results (
    number,
    (floor(extract(epoch from rolled_at) / 25)::bigint)
  )
  where rolled_at is not null and number is not null;

-- 5) Conferir resultado:
--   select count(*) as total, count(distinct jonbet_game_id) as ids_unicos
--   from public.double_results;
--
--   select minute_key, count(*) as pedras
--   from public.double_results
--   where rolled_at > now() - interval '30 minutes'
--   group by minute_key
--   order by minute_key desc;
