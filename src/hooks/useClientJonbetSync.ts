import { useEffect, useRef } from "react";
import { syncJonbetDouble } from "@/utils/roulette.functions";

type Status = "idle" | "ok" | "blocked" | "error";

export type ClientSyncState = {
  status: Status;
  lastInserted: number;
  lastError: string | null;
  lastRunAt: number | null;
};

/**
 * Sync periódico chamando a server function syncJonbetDouble.
 * O servidor (IP brasileiro no Lovable) busca da Jonbet e faz upsert no banco.
 * O navegador NÃO chama a Jonbet diretamente porque cai em CORS / Cloudflare.
 *
 * Roda apenas no cliente — não executa no SSR (evita hydration mismatch).
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
    if (typeof window === "undefined") return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const update = (patch: Partial<ClientSyncState>) => {
      stateRef.current = { ...stateRef.current, ...patch, lastRunAt: Date.now() };
      onState?.(stateRef.current);
    };

    async function tick() {
      try {
        const res = await syncJonbetDouble();
        if (!res?.ok) {
          update({
            status: /1016|cloudflare|forbidden|403/i.test(res?.error ?? "")
              ? "blocked"
              : "error",
            lastError: res?.error ?? "Falha desconhecida",
          });
        } else {
          update({
            status: "ok",
            lastInserted: res.inserted ?? 0,
            lastError: null,
          });
        }
      } catch (err) {
        update({ status: "error", lastError: (err as Error).message });
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
