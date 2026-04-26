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

          const row = {
            game_id: body.id,
            roll: body.roll,
            color: body.color,
            created_at: body.created_at ?? new Date().toISOString(),
            raw: body as unknown as Record<string, unknown>,
          };

          const { error } = await admin
            .from("double_results")
            .upsert(row, { onConflict: "game_id", ignoreDuplicates: true });

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
