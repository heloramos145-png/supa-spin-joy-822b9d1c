// Admin server-side client pro projeto Jonbet (onde mora double_results).
// Usa service role pra bypass de RLS. Só pode ser importado em código server.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { JonbetDatabase } from "./jonbet";

function makeAdminClient(): SupabaseClient<JonbetDatabase> {
  const url = process.env.JONBET_SUPABASE_URL;
  const key = process.env.JONBET_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing JONBET_SUPABASE_URL / JONBET_SUPABASE_SERVICE_ROLE_KEY env vars.",
    );
  }
  return createClient<JonbetDatabase>(url, key, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let _client: SupabaseClient<JonbetDatabase> | undefined;

export const jonbetAdmin = new Proxy(
  {} as SupabaseClient<JonbetDatabase>,
  {
    get(_, prop, receiver) {
      if (!_client) _client = makeAdminClient();
      return Reflect.get(_client, prop, receiver);
    },
  },
);
