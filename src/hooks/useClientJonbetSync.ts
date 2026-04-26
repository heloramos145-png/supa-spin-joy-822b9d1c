import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const API_URL =
  "https://jonbet.bet.br/api/singleplayer-originals/originals/roulette_games/recent/1";

type ApiItem = {
  id: string;
  created_at: string;
  color: number;
  roll: number;
};

type Status = "idle" | "ok" | "blocked" | "error";

export type ClientSyncState = {
  status: Status;
  lastInserted: number;
  lastError: string | null;
  lastRunAt: number | null;
};

/**
 * Sincronização client-side: o navegador do usuário (IP brasileiro) busca
 * direto da Jonbet a cada `intervalMs` e insere as pedras novas no banco.
 *
 * Por que client-side:
 *   O servidor do Supabase/Lovable é bloqueado pelo Cloudflare da Jonbet
 *   (Code 1016 — geo-block). O navegador do usuário não é bloqueado.
 *
 * Como funciona:
 *   1. fetch direto pra API da Jonbet a partir do navegador
 *   2. upsert no Supabase com onConflict=game_id (ignora duplicatas)
 *   3. o realtime do Supabase entrega as novas pedras pro gráfico
 */
export function useClientJonbetSync(
  intervalMs = 3000,
  onState?: (s: ClientSyncState) => void,
) {
  const stateRef = useRef<ClientSyncState>({
    status: "idle",
    lastInserted: 0,
    lastError: null,
    lastRunAt: null,
  });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const update = (patch: Partial<ClientSyncState>) => {
      stateRef.current = { ...stateRef.current, ...patch, lastRunAt: Date.now() };
      onState?.(stateRef.current);
    };

    async function tick() {
      try {
        const res = await fetch(API_URL, {
          method: "GET",
          credentials: "omit",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) {
          update({
            status: res.status === 403 || res.status === 1016 ? "blocked" : "error",
            lastError: `Jonbet HTTP ${res.status}`,
          });
          return;
        }
        const data = (await res.json()) as unknown;
        if (!Array.isArray(data)) {
          update({ status: "error", lastError: "Payload inesperado" });
          return;
        }
        const items = data as ApiItem[];
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
          }));

        if (rows.length === 0) {
          update({ status: "ok", lastInserted: 0, lastError: null });
          return;
        }

        const { error, count } = await supabase
          .from("double_results")
          .upsert(rows, {
            onConflict: "game_id",
            count: "exact",
            ignoreDuplicates: true,
          });

        if (error) {
          update({ status: "error", lastError: error.message });
          return;
        }
        update({
          status: "ok",
          lastInserted: count ?? 0,
          lastError: null,
        });
      } catch (err) {
        const msg = (err as Error).message;
        // CORS / bloqueio Cloudflare normalmente caem aqui no browser
        update({
          status: /failed to fetch|network|cors|cloudflare/i.test(msg)
            ? "blocked"
            : "error",
          lastError: msg,
        });
      } finally {
        if (!cancelled) timer = setTimeout(tick, intervalMs);
      }
    }

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [intervalMs, onState]);
}
