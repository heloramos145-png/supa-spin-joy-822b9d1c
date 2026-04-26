-- ============================================================
-- SQL 5 — Agendar o CRON (a cada minuto, 24h por dia)
-- ============================================================

-- Remove agendamento anterior, se existir (idempotente)
do $$
begin
  perform cron.unschedule('fetch-jonbet-double-every-minute');
exception when others then
  null;
end $$;

select cron.schedule(
  'fetch-jonbet-double-every-minute',
  '* * * * *',
  $$ select public.run_fetch_jonbet_double_job(); $$
);

-- Conferir:
--   select * from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 20;
-- Remover (se precisar):
--   select cron.unschedule('fetch-jonbet-double-every-minute');
