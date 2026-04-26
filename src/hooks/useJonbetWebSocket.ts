import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const WS_URL =
  "wss://api-gaming.jonbet.bet.br/replication/?EIO=3&transport=websocket";

export type LivePayload = {
  id: string;
  roll: number;
  color: number;
  status: "waiting" | "rolling" | "complete" | string;
  created_at?: string;
};

export type WsState = {
  connected: boolean;
  lastEventAt: number | null;
  lastError: string | null;
};

/**
 * Conecta direto no WebSocket Socket.IO v3 da Jonbet (engine.io v3).
 * Roda apenas no navegador do usuário enquanto a aba estiver aberta.
 * - status "rolling" → pedra antecipada (mostra na hora)
 * - status "complete" → pedra final, salva no Supabase
 */
export function useJonbetWebSocket(
  onLive: (payload: LivePayload) => void,
) {
  const [state, setState] = useState<WsState>({
    connected: false,
    lastEventAt: null,
    lastError: null,
  });
  const onLiveRef = useRef(onLive);
  onLiveRef.current = onLive;

  useEffect(() => {
    if (typeof window === "undefined") return;

    let ws: WebSocket | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    let lastSavedId: string | null = null;
    let lastLiveId: string | null = null;

    async function persistComplete(p: LivePayload) {
      if (lastSavedId === p.id) return;
      lastSavedId = p.id;
      try {
        await supabase.from("double_results").upsert(
          {
            game_id: p.id,
            roll: p.roll,
            color: p.color,
            created_at: p.created_at ?? new Date().toISOString(),
            raw: p as unknown as Record<string, unknown>,
          },
          { onConflict: "game_id", ignoreDuplicates: true },
        );
      } catch (err) {
        console.warn("[ws] erro ao salvar pedra:", err);
      }
    }

    function connect() {
      if (cancelled) return;
      try {
        ws = new WebSocket(WS_URL);
      } catch (err) {
        setState((s) => ({ ...s, lastError: (err as Error).message }));
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        setState((s) => ({ ...s, connected: true, lastError: null }));
      };

      ws.onmessage = (ev) => {
        const msg = typeof ev.data === "string" ? ev.data : "";
        if (!msg) return;

        // Engine.IO handshake: "0{...}"
        if (msg.startsWith("0")) {
          // Upgrade Socket.IO + subscribe na sala double
          ws?.send("40");
          ws?.send(
            '420["cmd",{"id":"subscribe","payload":{"room":"double_room_1"}}]',
          );
          // Heartbeat: navegador responde "3" a cada "2" recebido,
          // mas alguns servidores esperam ping nosso. Mandamos a cada 25s.
          pingTimer = setInterval(() => {
            try {
              ws?.send("2");
            } catch {
              // ignore
            }
          }, 25_000);
          return;
        }

        // Ping do servidor → pong
        if (msg === "2") {
          ws?.send("3");
          return;
        }

        // Evento Socket.IO: "42[...]"
        if (msg.startsWith("42")) {
          let data: unknown;
          try {
            data = JSON.parse(msg.slice(2));
          } catch {
            return;
          }
          if (!Array.isArray(data) || data.length < 2) return;
          const [event, wrapper] = data as [string, Record<string, unknown>];
          if (event !== "data") return;
          if (wrapper?.id !== "double.tick") return;

          const payload = wrapper.payload as LivePayload | undefined;
          if (!payload || typeof payload.roll !== "number") return;
          if (payload.status !== "rolling" && payload.status !== "complete") {
            return;
          }
          // anti-duplicação por id+status
          const key = `${payload.id}:${payload.status}`;
          if (lastLiveId === key) return;
          lastLiveId = key;

          setState((s) => ({ ...s, lastEventAt: Date.now() }));
          onLiveRef.current(payload);

          if (payload.status === "complete") {
            void persistComplete(payload);
          }
        }
      };

      ws.onerror = () => {
        setState((s) => ({ ...s, lastError: "ws error" }));
      };

      ws.onclose = () => {
        setState((s) => ({ ...s, connected: false }));
        if (pingTimer) {
          clearInterval(pingTimer);
          pingTimer = null;
        }
        scheduleReconnect();
      };
    }

    function scheduleReconnect() {
      if (cancelled) return;
      if (reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 3000);
    }

    connect();

    return () => {
      cancelled = true;
      if (pingTimer) clearInterval(pingTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        ws?.close();
      } catch {
        // ignore
      }
    };
  }, []);

  return state;
}
