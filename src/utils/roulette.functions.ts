import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const API_URL =
  "https://jonbet.bet.br/api/singleplayer-originals/originals/roulette_games/recent/1";

// Roulette color mapping (European/single-zero roulette)
const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

function getColor(n: number): "red" | "black" | "green" {
  if (n === 0) return "green";
  return RED_NUMBERS.has(n) ? "red" : "black";
}

type ApiItem = {
  id?: string | number;
  game_id?: string | number;
  number?: number;
  result?: number;
  color?: string;
  created_at?: string;
  [k: string]: unknown;
};

export const syncJonbetRoulette = createServerFn({ method: "POST" }).handler(async () => {
  let apiPayload: unknown;
  try {
    const res = await fetch(API_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (compatible; LovableRouletteSync/1.0)",
      },
    });
    if (!res.ok) {
      return { ok: false, inserted: 0, error: `Jonbet API ${res.status}` };
    }
    apiPayload = await res.json();
  } catch (err) {
    return { ok: false, inserted: 0, error: `fetch failed: ${(err as Error).message}` };
  }

  // Try to find an array of items in the payload (API shape may vary)
  let items: ApiItem[] = [];
  if (Array.isArray(apiPayload)) {
    items = apiPayload as ApiItem[];
  } else if (apiPayload && typeof apiPayload === "object") {
    const obj = apiPayload as Record<string, unknown>;
    for (const key of ["data", "results", "items", "recent", "games"]) {
      if (Array.isArray(obj[key])) {
        items = obj[key] as ApiItem[];
        break;
      }
    }
    if (items.length === 0) {
      // single object
      items = [obj as ApiItem];
    }
  }

  const rows = items
    .map((it) => {
      const rawNumber =
        typeof it.number === "number"
          ? it.number
          : typeof it.result === "number"
            ? it.result
            : null;
      const gameId =
        it.game_id != null
          ? String(it.game_id)
          : it.id != null
            ? String(it.id)
            : null;
      if (rawNumber == null || gameId == null) return null;
      const color =
        it.color === "red" || it.color === "black" || it.color === "green"
          ? it.color
          : getColor(rawNumber);
      return {
        game_id: gameId,
        number: rawNumber,
        color,
        created_at: it.created_at ?? new Date().toISOString(),
        raw: it as unknown,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) {
    return { ok: true, inserted: 0, note: "no rows in payload" };
  }

  const { error, count } = await supabaseAdmin
    .from("roulette_results")
    .upsert(rows, { onConflict: "game_id", count: "exact", ignoreDuplicates: true });

  if (error) {
    return { ok: false, inserted: 0, error: error.message };
  }

  return { ok: true, inserted: count ?? rows.length };
});
