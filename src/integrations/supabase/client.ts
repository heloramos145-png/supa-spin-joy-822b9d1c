import { createClient } from "@supabase/supabase-js";

// Publishable (anon) credentials — safe to expose to the browser
const SUPABASE_URL = "https://gkirupsizqghgsoyjsvy.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable__yC2pEqTL0OkWiloeGFwoQ_n7q2kPnh";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
