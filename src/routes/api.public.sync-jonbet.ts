import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const API_URL =
  "https://jonbet.bet.br/api/singleplayer-originals/originals/roulette_games/recent/1";

type ApiItem = {
  id: string;
  created_at: string;
  color: number;
  roll: number;
  server_seed?: string;
};

async function runSync() {
  const SUPABASE_URL = process.env.JONBET_SUPABASE_URL!;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.JONBET_SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const baseHeaders: Record<string, string> = {
    Accept: "application/json",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    Referer: "https://jonbet.bet.br/pt/games/double",
    Origin: "https://jonbet.bet.br",
  };

  let res = await fetch(API_URL, { headers: baseHeaders });

  // Se 403 (provável Cloudflare), tenta resolver via CapSolver
  if (!res.ok && res.status === 403 && process.env.CAPSOLVER_API_KEY) {
    try {
      const cf = await solveCloudflareWithCapSolver(API_URL, baseHeaders["User-Agent"]);
      if (cf?.cookie) {
        res = await fetch(API_URL, {
          headers: {
            ...baseHeaders,
            Cookie: cf.cookie,
            "User-Agent": cf.userAgent || baseHeaders["User-Agent"],
          },
        });
      }
    } catch (e) {
      console.error("CapSolver error:", e);
    }
  }

  if (!res.ok) {
    return { ok: false, inserted: 0, error: `Jonbet API ${res.status}` };
  }
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) {
    return { ok: false, inserted: 0, error: "Unexpected API shape" };
  }
  const items = (data as ApiItem[]).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  const rows = items
    .filter(
      (it) =>
        typeof it?.id === "string" &&
        typeof it?.roll === "number" &&
        typeof it?.color === "number" &&
        typeof it?.created_at === "string",
    )
    .map((it) => ({
      game_id: it.id,
      roll: it.roll,
      color: it.color,
      created_at: it.created_at,
      raw: it as unknown,
    }));

  if (rows.length === 0) return { ok: true, inserted: 0, note: "no rows" };

  const { error, count } = await admin
    .from("double_results")
    .upsert(rows, {
      onConflict: "game_id",
      count: "exact",
      ignoreDuplicates: true,
    });

  if (error) return { ok: false, inserted: 0, error: error.message };

  // Mantém só pedras do dia em Brasília
  const now = new Date();
  const brasiliaNowUtcMs = now.getTime() - 3 * 60 * 60 * 1000;
  const b = new Date(brasiliaNowUtcMs);
  const startOfDayBrasiliaUtc = new Date(
    Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate(), 3, 0, 0),
  );
  await admin
    .from("double_results")
    .delete()
    .lt("created_at", startOfDayBrasiliaUtc.toISOString());

  return { ok: true, inserted: count ?? rows.length };
}

export const Route = createFileRoute("/api/public/sync-jonbet")({
  server: {
    handlers: {
      GET: async () => {
        const result = await runSync();
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
      POST: async () => {
        const result = await runSync();
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
