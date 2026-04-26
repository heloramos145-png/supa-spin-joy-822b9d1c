-- ============================================================
-- SQL 3 — Configurar URL e service key como settings do banco
-- ============================================================
-- ⚠️ SUBSTITUA  SUA_SERVICE_ROLE_KEY_AQUI  pela chave real do seu projeto
--    (Project Settings → API → service_role).

alter database postgres set "app.settings.supabase_url" =
  'https://gkirupsizqghgsoyjsvy.supabase.co';

alter database postgres set "app.settings.service_role_key" =
  'SUA_SERVICE_ROLE_KEY_AQUI';
