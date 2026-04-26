# Jonbet Double — Coleta 24/7

Coleta o histórico do Double da **Jonbet** a cada minuto via Edge Function
(WebSocket ao vivo + REST fallback) e salva em `public.double_results`.
Funciona com a aba do site fechada, computador desligado, etc — roda no
servidor do Supabase.

## Ordem de execução

1. **Deploy da Edge Function** (no terminal local com Supabase CLI):

   ```bash
   supabase login
   supabase link --project-ref gkirupsizqghgsoyjsvy
   supabase functions deploy fetch-jonbet-double --no-verify-jwt
   ```

2. **Rodar os SQLs no SQL Editor do Supabase** (na ordem):
   - `migrations/01_create_double_results.sql` — cria tabela
     ⚠️ Se você já tem uma tabela `double_results` antiga com schema
     diferente, renomeie antes:
     `ALTER TABLE public.double_results RENAME TO double_results_old;`
   - `migrations/02_enable_cron_extensions.sql` — habilita pg_cron + pg_net
   - `migrations/03_configure_settings.sql` — **substitua a service_role_key
     real** antes de rodar (Project Settings → API → `service_role`)
   - `migrations/04_wrapper_function.sql` — função wrapper
   - `migrations/05_schedule_cron.sql` — agenda cron a cada 1 min

3. **Conferir**:
   ```sql
   select * from cron.job;
   select * from cron.job_run_details order by start_time desc limit 20;
   select count(*) from public.double_results;
   ```

## Schema da tabela

| coluna           | tipo          | descrição                      |
|------------------|---------------|--------------------------------|
| id               | uuid          | PK                             |
| jonbet_game_id   | text unique   | id do round na Jonbet          |
| number           | integer       | 0–14                           |
| color            | text          | `white` \| `red` \| `black`    |
| rolled_at        | timestamptz   | quando o round saiu            |
| minute_key       | text          | `YYYY-MM-DD HH:MM` Brasília    |
| created_at       | timestamptz   | inserção no banco              |
