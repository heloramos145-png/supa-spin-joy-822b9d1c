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

// URL e anon key do projeto Jonbet (chave pública, segura no client).
const JONBET_URL = "https://gkirupsizqghgsoyjsvy.supabase.co";
const JONBET_ANON = "sb_publishable__yC2pEqTL0OkWiloeGFwoQ_n7q2kPnh";

function makeClient(): SupabaseClient<JonbetDatabase> {
  return createClient<JonbetDatabase>(JONBET_URL, JONBET_ANON, {
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
