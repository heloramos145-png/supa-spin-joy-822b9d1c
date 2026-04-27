// Cliente Supabase dedicado pro projeto Jonbet (onde mora double_results).
// O client.ts genérico aponta pro Supabase do Lovable Cloud (vazio); aqui
// usamos as credenciais do projeto antigo pra ler/gravar pedras.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type DoubleResultRow = {
  id: number;
  jonbet_game_id: string;
  game_id: string | null;
  number: number;
  roll?: number | null;
  color: string | number;
  rolled_at: string;
  created_at: string;
  minute_key: string | null;
};

type DoubleResultInsert = {
  jonbet_game_id: string;
  number: number;
  color: string;
  rolled_at: string;
  minute_key: string;
};

export type JonbetDatabase = {
  public: {
    Tables: {
      double_results: {
        Row: DoubleResultRow;
        Insert: DoubleResultInsert;
        Update: Partial<DoubleResultInsert>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

function pickEnv(viteName: string, processName: string): string | undefined {
  const fromVite =
    typeof import.meta !== "undefined"
      ? (import.meta as unknown as { env?: Record<string, string | undefined> })
          .env?.[viteName]
      : undefined;
  if (fromVite) return fromVite;
  if (typeof process !== "undefined" && process.env) {
    return process.env[processName];
  }
  return undefined;
}

function makeClient(): SupabaseClient<JonbetDatabase> {
  // Tenta primeiro JONBET_*, depois cai pro padrão (caso o usuário queira
  // usar o projeto principal). No frontend, expomos VITE_JONBET_*.
  const url =
    pickEnv("VITE_JONBET_SUPABASE_URL", "JONBET_SUPABASE_URL") ||
    pickEnv("VITE_SUPABASE_URL", "SUPABASE_URL");
  const anon =
    pickEnv("VITE_JONBET_SUPABASE_ANON_KEY", "JONBET_SUPABASE_ANON_KEY") ||
    pickEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_PUBLISHABLE_KEY");

  if (!url || !anon) {
    throw new Error(
      "Jonbet Supabase env vars ausentes (VITE_JONBET_SUPABASE_URL / VITE_JONBET_SUPABASE_ANON_KEY).",
    );
  }

  return createClient<JonbetDatabase>(url, anon, {
    auth: {
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let _client: SupabaseClient<JonbetDatabase> | undefined;

export const jonbetSupabase = new Proxy(
  {} as SupabaseClient<JonbetDatabase>,
  {
    get(_, prop, receiver) {
      if (!_client) _client = makeClient();
      return Reflect.get(_client, prop, receiver);
    },
  },
);
