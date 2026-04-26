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

function rollToColorText(roll: number): string {
  if (roll === 0) return "white";
  if (roll >= 1 && roll <= 7) return "red";
  return "black";
}

function toBrasiliaMinuteKey(d: Date): string {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = f.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

async function runSync() {
  const SUPABASE_URL = process.env.JONBET_SUPABASE_URL!;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.JONBET_SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    Referer: "https://jonbet.bet.br/pt/games/double",
    Origin: "https://jonbet.bet.br",
  };

  const res = await fetch(API_URL, { headers });

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
        typeof it?.created_at === "string",
    )
    .map((it) => {
      const rolledAt = new Date(it.created_at);
      return {
        jonbet_game_id: it.id,
        number: it.roll,
        color: rollToColorText(it.roll),
        rolled_at: rolledAt.toISOString(),
        minute_key: toBrasiliaMinuteKey(rolledAt),
      };
    });

  if (rows.length === 0) return { ok: true, inserted: 0, note: "no rows" };

  const { error, count } = await admin
    .from("double_results")
    .upsert(rows, {
      onConflict: "jonbet_game_id",
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
    .lt("rolled_at", startOfDayBrasiliaUtc.toISOString());

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
