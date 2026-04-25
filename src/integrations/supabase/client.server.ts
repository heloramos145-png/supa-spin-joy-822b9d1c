import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.JONBET_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.JONBET_SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing JONBET_SUPABASE_URL or JONBET_SUPABASE_SERVICE_ROLE_KEY env vars");
}

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
