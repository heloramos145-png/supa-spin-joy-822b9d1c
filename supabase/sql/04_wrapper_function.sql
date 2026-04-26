-- ============================================================
-- SQL 4 — Função wrapper que chama a Edge Function
-- ============================================================
create or replace function public.run_fetch_jonbet_double_job()
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
begin
  perform net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/fetch-jonbet-double',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    )::jsonb,
    body := '{}'::jsonb
  );
end;
$$;
