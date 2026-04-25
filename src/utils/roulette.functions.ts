import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const API_URL =
  "https://jonbet.bet.br/api/singleplayer-originals/originals/roulette_games/recent/1";

type ApiItem = {
  id: string;
  created_at: string;
  color: number; // 0=white, 1=red, 2=black
  roll: number; // 0-14
  server_seed?: string;
};

export const syncJonbetDouble = createServerFn({ method: "POST" }).handler(
  async () => {
    let items: ApiItem[] = [];
    try {
      const res = await fetch(API_URL, {
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
          Referer: "https://jonbet.bet.br/",
          Origin: "https://jonbet.bet.br",
        },
      });
      if (!res.ok) {
        return { ok: false, inserted: 0, error: `Jonbet API ${res.status}` };
      }
      const data = (await res.json()) as unknown;
      if (Array.isArray(data)) {
        items = data as ApiItem[];
      } else {
        return { ok: false, inserted: 0, error: "Unexpected API shape" };
      }
    } catch (err) {
      return {
        ok: false,
        inserted: 0,
        error: `fetch failed: ${(err as Error).message}`,
      };
    }

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

    if (rows.length === 0) {
      return { ok: true, inserted: 0, note: "no rows in payload" };
    }

    const { error, count } = await supabaseAdmin
      .from("double_results")
      .upsert(rows, {
        onConflict: "game_id",
        count: "exact",
        ignoreDuplicates: true,
      });

    if (error) {
      return { ok: false, inserted: 0, error: error.message };
    }

    // Trim to keep only the 1500 most recent rows
    const KEEP = 1500;
    const { data: cutoffRow } = await supabaseAdmin
      .from("double_results")
      .select("created_at")
      .order("created_at", { ascending: false })
      .range(KEEP - 1, KEEP - 1)
      .maybeSingle();

    if (cutoffRow?.created_at) {
      await supabaseAdmin
        .from("double_results")
        .delete()
        .lt("created_at", cutoffRow.created_at);
    }

    return { ok: true, inserted: count ?? rows.length };
  },
);
