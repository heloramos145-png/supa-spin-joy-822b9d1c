import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

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

          const rolledAt = body.created_at ?? new Date().toISOString();
          // minute_key no fuso de Brasília (UTC-3): "YYYY-MM-DD HH:MM"
          const brTime = new Date(new Date(rolledAt).getTime() - 3 * 60 * 60 * 1000);
          const pad = (n: number) => String(n).padStart(2, "0");
          const minuteKey = `${brTime.getUTCFullYear()}-${pad(brTime.getUTCMonth() + 1)}-${pad(brTime.getUTCDate())} ${pad(brTime.getUTCHours())}:${pad(brTime.getUTCMinutes())}`;

          // color vem como número (0=white, 1=red, 2=black). Converte pra texto.
          const colorText =
            body.color === 0 ? "white" : body.color === 1 ? "red" : "black";

          const row = {
            jonbet_game_id: body.id,
            number: body.roll,
            color: colorText,
            rolled_at: rolledAt,
            minute_key: minuteKey,
          };

          const { error } = await admin
            .from("double_results")
            .upsert(row, { onConflict: "jonbet_game_id", ignoreDuplicates: true });

          if (error) {
            console.error("[save-stone] upsert error:", error.message, "row:", row);
            return new Response(
              JSON.stringify({ ok: false, error: error.message, row }),
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
