// Edge Function: fetch-jonbet-double
// Coleta resultados do Double da Jonbet via WebSocket (ao vivo) + REST (fallback)
// e faz upsert na tabela public.double_results.
// Roda 24/7 chamada por pg_cron a cada 1 minuto.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function getColor(n: number): string {
  if (n === 0) return "white";
  if (n >= 1 && n <= 7) return "red";
  return "black";
}

function toBrasiliaMinuteKey(date: Date): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

// ============ COLETA VIA WEBSOCKET (ao vivo) ============
async function fetchViaWebSocket(
  lastKnownGameId: string | null,
  timeoutMs = 55000,
  targetResults = 10,
): Promise<any[]> {
  const WS_URLS = [
    "wss://api-gaming.jonbet.bet.br/replication/?EIO=3&transport=websocket",
  ];
  const SUBSCRIBE =
    '420["cmd",{"id":"subscribe","payload":{"room":"double_room_1"}}]';
  const collected: any[] = [];

  for (const url of WS_URLS) {
    try {
      const result = await new Promise<any[]>((resolve) => {
        const ws = new WebSocket(url);
        const found: any[] = [];
        let pingInterval: number | undefined;

        const finish = () => {
          if (pingInterval) clearInterval(pingInterval);
          try {
            ws.close();
          } catch {
            // ignore
          }
          resolve(found);
        };

        const timer = setTimeout(finish, timeoutMs);

        ws.onopen = () => {
          try {
            ws.send(SUBSCRIBE);
          } catch {
            // ignore
          }
          pingInterval = setInterval(() => {
            try {
              ws.send("2");
            } catch {
              if (pingInterval) clearInterval(pingInterval);
            }
          }, 25000) as unknown as number;
        };

        ws.onmessage = (event) => {
          try {
            const msg = String(event.data);
            if (msg.startsWith("0")) {
              // server hello
            } else if (msg === "3") {
              // pong
            } else if (msg.startsWith("42")) {
              const json = JSON.parse(msg.substring(2));
              if (Array.isArray(json) && json[0] === "data") {
                const payload = json[1]?.payload;
                if (
                  payload?.status === "complete" &&
                  typeof payload.roll === "number"
                ) {
                  if (payload.id === lastKnownGameId) return;
                  if (found.find((f) => f.id === payload.id)) return;
                  found.push(payload);
                  if (found.length >= targetResults) {
                    clearTimeout(timer);
                    finish();
                  }
                }
              }
            }
          } catch {
            // ignore
          }
        };

        ws.onerror = () => {
          clearTimeout(timer);
          finish();
        };

        ws.onclose = () => {
          clearTimeout(timer);
          if (pingInterval) clearInterval(pingInterval);
          resolve(found);
        };
      });

      if (result.length > 0) {
        collected.push(...result);
        break;
      }
    } catch {
      continue;
    }
  }

  return collected;
}

// ============ COLETA VIA REST (fallback / histórico) ============
async function fetchViaRest(lastKnownGameId: string | null): Promise<any[]> {
  const REST_URLS = [
    "https://jonbet.bet.br/api/singleplayer-originals/originals/roulette_games/recent/1",
    "https://jonbet.bet.br/api/roulette_games/recent",
  ];

  for (const url of REST_URLS) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
          Accept: "application/json",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
          Referer: "https://jonbet.bet.br/pt/games/double",
          Origin: "https://jonbet.bet.br",
        },
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data)) continue;
      const filtered = lastKnownGameId
        ? data.filter((d: any) => d.id !== lastKnownGameId)
        : data;
      if (filtered.length > 0) return filtered;
    } catch {
      continue;
    }
  }

  return [];
}

// ============ HANDLER PRINCIPAL ============
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // 1. Pega o último ID salvo
    const { data: lastRow } = await supabase
      .from("double_results")
      .select("jonbet_game_id")
      .order("rolled_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastKnownGameId = lastRow?.jonbet_game_id ?? null;

    // 2. Coleta via REST + WebSocket em paralelo
    const [restResults, wsResults] = await Promise.all([
      fetchViaRest(lastKnownGameId),
      fetchViaWebSocket(lastKnownGameId, 55000, 10),
    ]);

    const allRaw = [...restResults, ...wsResults];

    // 3. Dedup por ID
    const seen = new Set<string>();
    const unique = allRaw.filter((r: any) => {
      if (!r?.id || seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    if (unique.length === 0) {
      return new Response(
        JSON.stringify({ inserted: 0, message: "no new results" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 4. Normaliza pro schema
    const rows = unique
      .filter((r: any) => typeof r.roll === "number" && r.created_at)
      .map((r: any) => {
        const rolledAt = new Date(r.created_at);
        return {
          jonbet_game_id: r.id,
          number: r.roll,
          color: getColor(r.roll),
          rolled_at: rolledAt.toISOString(),
          minute_key: toBrasiliaMinuteKey(rolledAt),
        };
      });

    // 5. Upsert (evita duplicatas)
    const { error } = await supabase
      .from("double_results")
      .upsert(rows, {
        onConflict: "jonbet_game_id",
        ignoreDuplicates: true,
      });

    if (error) {
      console.error("upsert error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ inserted: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("handler error:", err);
    return new Response(
      JSON.stringify({ error: err?.message ?? "unknown" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
