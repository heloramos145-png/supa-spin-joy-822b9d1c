import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

function toColorText(color: number): "white" | "red" | "black" {
  if (color === 0) return "white";
  if (color === 1) return "red";
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
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

function getAdmin() {
  const url = process.env.JONBET_SUPABASE_URL!;
  const key = process.env.JONBET_SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Início do dia atual em Brasília (UTC-3, sem horário de verão) em ISO UTC.
function startOfBrasiliaDayISO(ref: Date = new Date()): string {
  const brasiliaNowMs = ref.getTime() - 3 * 60 * 60 * 1000;
  const b = new Date(brasiliaNowMs);
  const startUtc = new Date(
    Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate(), 3, 0, 0),
  );
  return startUtc.toISOString();
}

export const Route = createFileRoute("/api/public/save-stone")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, { status: 204, headers: corsHeaders }),

      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            id?: string;
            roll?: number;
            color?: number;
            created_at?: string;
          };

          if (
            typeof body?.id !== "string" ||
            typeof body?.roll !== "number" ||
            typeof body?.color !== "number"
          ) {
            return new Response(
              JSON.stringify({ ok: false, error: "invalid payload" }),
              { status: 400, headers: corsHeaders },
            );
          }

          const admin = getAdmin();
          const createdAt = body.created_at ?? new Date().toISOString();
          const rolledAtDate = new Date(createdAt);
          const modernRow = {
            jonbet_game_id: body.id,
            number: body.roll,
            color: toColorText(body.color),
            rolled_at: rolledAtDate.toISOString(),
            minute_key: toBrasiliaMinuteKey(rolledAtDate),
          };

          // Dedup defensiva: se já existe uma pedra com mesmo number numa janela
          // de ±20s do rolled_at, é a mesma pedra (id diferente vindo de outro
          // canal — WS vs REST). Não insere de novo.
          const windowMs = 20_000;
          const fromIso = new Date(rolledAtDate.getTime() - windowMs).toISOString();
          const toIso = new Date(rolledAtDate.getTime() + windowMs).toISOString();
          const { data: existing } = await admin
            .from("double_results")
            .select("id")
            .eq("number", body.roll)
            .gte("rolled_at", fromIso)
            .lte("rolled_at", toIso)
            .limit(1);

          if (existing && existing.length > 0) {
            return new Response(JSON.stringify({ ok: true, deduped: true }), {
              status: 200,
              headers: corsHeaders,
            });
          }

          const { error } = await admin
            .from("double_results")
            .upsert(modernRow, {
              onConflict: "jonbet_game_id",
              ignoreDuplicates: true,
            });

          if (error) {
            console.error("[save-stone] upsert error:", error.message);
            return new Response(
              JSON.stringify({ ok: false, error: error.message }),
              { status: 500, headers: corsHeaders },
            );
          }

          // Limpa pedras de dias anteriores (economiza espaço)
          const startToday = startOfBrasiliaDayISO();
          await admin
            .from("double_results")
            .delete()
            .lt("rolled_at", startToday);

          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: corsHeaders,
          });
        } catch (err) {
          return new Response(
            JSON.stringify({ ok: false, error: (err as Error).message }),
            { status: 500, headers: corsHeaders },
          );
        }
      },
    },
  },
});
