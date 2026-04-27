-- Tabela de códigos de ativação criados pelo admin
CREATE TABLE public.activation_codes (
  code TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 1,
  used_by TEXT[] NOT NULL DEFAULT '{}',
  note TEXT,
  revoked BOOLEAN NOT NULL DEFAULT false
);

-- Tabela de usuários cadastrados (não usa supabase auth — sistema próprio)
CREATE TABLE public.app_users (
  email TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  code_used TEXT NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  code_expires_at TIMESTAMPTZ NOT NULL
);

-- Sem RLS pública: o acesso é todo via server functions com service role (admin)
-- ou via server function pública específica (login). Bloqueia leitura direta do client.
ALTER TABLE public.activation_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

-- Nenhuma policy = nada acessível direto pelo client (anon key).
-- Acesso só via server-side com service role key.