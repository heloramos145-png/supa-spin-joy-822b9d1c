import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { jonbetSupabase as supabase } from "@/integrations/supabase/jonbet";
import type { ClientSyncState } from "@/hooks/useClientJonbetSync";
import { useJonbetWebSocket, type LivePayload } from "@/hooks/useJonbetWebSocket";
import { useIsMobile } from "@/hooks/use-mobile";
import SpinWheel from "@/components/SpinWheel";
import FluxoCores from "@/components/FluxoCores";
import BrancosFluxoJon from "@/components/BrancosFluxoJon";
import CorrecaoBrancos from "@/components/CorrecaoBrancos";
import TemporalFluxoJon from "@/components/TemporalFluxoJon";
import Slot from "@/components/Slot";
import DrawingOverlay from "@/components/DrawingOverlay";
export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "FluxoJon — Análise Double Jonbet em tempo real" },
      {
        name: "description",
        content:
          "FluxoJon: histórico do Double da Jonbet em grid de minutos com pedras antecipadas em tempo real.",
      },
    ],
  }),
});

type RawDoubleRow = {
  id: string | number;
  game_id?: string | null;
  jonbet_game_id?: string | null;
  roll?: number | string | null;
  number?: number | string | null;
  color?: number | string | null;
  created_at?: string | null;
  rolled_at?: string | null;
};

type DoubleRow = {
  id: string;
  game_id: string;
  roll: number;
  color: number; // 0=white, 1=green(1-7), 2=black(8-14)
  created_at: string;
};

// Regra fixa Jonbet Double: 0 = branco, 1–7 = verde, 8–14 = preto.
// A cor é SEMPRE derivada do número (ignora o que veio salvo, que pode estar
// no esquema antigo da Blaze onde 1 significava vermelho).
function normalizeColor(_color: RawDoubleRow["color"], roll: number): number {
  if (roll === 0) return 0;
  return roll <= 7 ? 1 : 2;
}

function normalizeRow(row: RawDoubleRow): DoubleRow | null {
  const gameId = row.game_id ?? row.jonbet_game_id ?? null;
  const rawRoll = row.roll ?? row.number ?? null;
  const roll =
    typeof rawRoll === "number"
      ? rawRoll
      : typeof rawRoll === "string" && rawRoll.trim() !== ""
        ? Number(rawRoll)
        : NaN;
  const createdAt = row.rolled_at ?? row.created_at ?? null;

  if (!gameId || !Number.isFinite(roll) || !createdAt) return null;

  return {
    id: String(row.id ?? gameId),
    game_id: gameId,
    roll,
    color: normalizeColor(row.color, roll),
    created_at: createdAt,
  };
}

const POLL_MS = 3000;
// Tempo total de uma rodada da Jonbet Double:
// 5s aceitando aposta + 11s girando = 16s.
const ROUND_SECONDS = 16;

// 6 row buckets: top = 50–00 (newest), bottom = 00–10 (oldest within hour)
const ROW_BUCKETS = [50, 40, 30, 20, 10, 0] as const;
const COLS = Array.from({ length: 10 }, (_, i) => i);

// Início do dia atual em Brasília (UTC-3, sem horário de verão) em ISO UTC.
function startOfBrasiliaDayISO(ref: Date = new Date()): string {
  const brasiliaNowMs = ref.getTime() - 3 * 60 * 60 * 1000;
  const b = new Date(brasiliaNowMs);
  const startUtc = new Date(
    Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate(), 3, 0, 0),
  );
  return startUtc.toISOString();
}

type Cell = {
  rowStart: number;
  col: number;
  minute: number;
  first: DoubleRow | null;
  second: DoubleRow | null;
};

type MinuteCol = {
  minuteStartUtc: number;
  label: string;
  stones: DoubleRow[];
};

function compareByCreatedAtAsc(a: DoubleRow, b: DoubleRow) {
  const timeDiff =
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  if (timeDiff !== 0) return timeDiff;
  return a.id.localeCompare(b.id);
}

// REGRA FIXA: exatamente 2 pedras por minuto (as 2 mais recentes do minuto).
// NÃO ALTERAR esse limite sem instrução explícita do usuário.
const STONES_PER_MINUTE = 2;

function dedupeResultsByMinute(rows: DoubleRow[]): DoubleRow[] {
  const byMinute = new Map<number, DoubleRow[]>();

  // Ordena cronologicamente para manter as últimas N do minuto
  const sorted = [...rows].sort(compareByCreatedAtAsc);

  for (const row of sorted) {
    const minuteKey = Math.floor(new Date(row.created_at).getTime() / 60000);
    const list = byMinute.get(minuteKey) ?? [];
    list.push(row);
    // mantém apenas as STONES_PER_MINUTE mais recentes
    if (list.length > STONES_PER_MINUTE) list.shift();
    byMinute.set(minuteKey, list);
  }

  const flat: DoubleRow[] = [];
  for (const list of byMinute.values()) flat.push(...list);
  return flat.sort(compareByCreatedAtAsc);
}

// Stone helpers — converte DoubleRow no formato esperado pelo Slot
function colorName(roll: number): "white" | "green" | "black" {
  if (roll === 0) return "white";
  return roll <= 7 ? "green" : "black";
}

function pad2(v: number) {
  return String(v).padStart(2, "0");
}

function Index() {
  const isMobile = useIsMobile();
  const [results, setResults] = useState<DoubleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [syncState, setSyncState] = useState<ClientSyncState>({
    status: "idle",
    lastInserted: 0,
    lastError: null,
    lastRunAt: null,
  });
  // now começa em 0 no SSR e só vira Date no cliente — evita hydration mismatch
  const [now, setNow] = useState<Date | null>(null);
  const [livePreview, setLivePreview] = useState<LivePayload | null>(null);
  useEffect(() => {
    setNow(new Date());
    // gate de auth no client (evita hydration mismatch)
    import("@/lib/auth").then(({ getSession }) => {
      const s = getSession();
      if (!s) {
        window.location.href = "/login";
        return;
      }
      setAuthChecked(true);
    });
  }, []);

  // WebSocket direto na Jonbet (browser) — antecipa a pedra (status "rolling")
  // e salva a final (status "complete") no Supabase. Só roda com a aba aberta.
  const wsState = useJonbetWebSocket((payload) => {
    setLivePreview(payload);
    if (payload.status === "complete") {
      // limpa preview após a pedra final ser confirmada
      setTimeout(() => {
        setLivePreview((cur) => (cur?.id === payload.id ? null : cur));
      }, 1500);
    }
  });

  async function fetchResults() {
    const sinceISO = startOfBrasiliaDayISO();
    const { data, error } = await supabase
      .from("double_results")
      .select("*")
      .gte("created_at", sinceISO)
      .order("created_at", { ascending: true })
      .range(0, 4000);
    if (error) {
      setLoading(false);
      setSyncState((s) => ({ ...s, lastError: error.message, status: "error" }));
      return;
    }
    const nextResults = dedupeResultsByMinute(((data ?? []) as RawDoubleRow[])
      .map(normalizeRow)
      .filter((row): row is DoubleRow => row !== null)
      .sort(compareByCreatedAtAsc));
    setResults(nextResults);
    setLoading(false);
  }

  // Sync da Jonbet roda no servidor (cron pg_cron / Vercel cron),
  // não no navegador — o front só lê do banco e renderiza.
  // useClientJonbetSync foi desativado pra evitar erros "Load failed"
  // no preview da Lovable (Cloudflare Worker é bloqueado pela Jonbet).

  // Detecta virada de dia em Brasília → limpa pedras antigas da tela e recarrega.
  useEffect(() => {
    let lastDay = startOfBrasiliaDayISO();
    const id = setInterval(() => {
      const today = startOfBrasiliaDayISO();
      if (today !== lastDay) {
        lastDay = today;
        setResults([]);
        void fetchResults();
      }
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    // A coleta 24/7 é feita pela Edge Function `fetch-jonbet-double` do
    // Supabase, agendada via pg_cron a cada 1 minuto. O frontend apenas LÊ
    // do banco — não tenta sincronizar pelo navegador (Cloudflare da Jonbet
    // bloqueia o IP do worker da Lovable com 403).
    void fetchResults();

    // Realtime: insere pedras na hora que chegam no banco (se publicação estiver habilitada)
    const channel = supabase
      .channel("double_results_live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "double_results" },
        (payload) => {
          const row = normalizeRow(payload.new as RawDoubleRow);
          if (!row) return;
          if (new Date(row.created_at).getTime() < new Date(startOfBrasiliaDayISO()).getTime()) {
            return;
          }
          setResults((prev) => {
            if (prev.some((r) => r.id === row.id)) return prev;
            return dedupeResultsByMinute([...prev, row].sort(compareByCreatedAtAsc));
          });
        },
      )
      .on("system", {}, () => {
        void fetchResults();
      })
      .subscribe();

    // Fallback robusto: refetch periódico do banco a cada 5s.
    // Garante que pedras inseridas pelo cron (com site fechado) apareçam
    // ao reabrir o site, mesmo se o Realtime estiver desabilitado/fora do ar.
    const refetchInterval = setInterval(() => {
      void fetchResults();
    }, 5000);

    // Refetch também quando a aba volta a ficar visível
    const onVisibility = () => {
      if (document.visibilityState === "visible") void fetchResults();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(refetchInterval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live clock — São Paulo (Brasília time)
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);


  // Current Brasília hour reference (UTC-3, no DST)
  const brasiliaParts = useMemo(() => {
    const fmt = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = fmt.formatToParts(now ?? new Date(0));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
    return {
      day: get("day"),
      month: get("month"),
      year: get("year"),
      hour: get("hour"),
      minute: get("minute"),
      second: get("second"),
    };
  }, [now]);

  // Linhas alinhadas: cada linha = dezena de minutos (HH:M0..HH:M9 em Brasília),
  // cada coluna 0..9 = dígito do minuto. Cada pedra é uma célula independente
  // empilhada verticalmente dentro da sua coluna (ordem cronológica, recente em cima).
  const minuteRows = useMemo(() => {
    const fmtHM = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    // Indexa todas as pedras por minuto (lista, mais recente primeiro)
    const byMinute = new Map<number, DoubleRow[]>();
    let minMinute = Infinity;
    let maxMinute = -Infinity;
    for (const r of results) {
      const t = new Date(r.created_at).getTime();
      const minuteStartUtc = Math.floor(t / 60000) * 60000;
      if (minuteStartUtc < minMinute) minMinute = minuteStartUtc;
      if (minuteStartUtc > maxMinute) maxMinute = minuteStartUtc;
      const list = byMinute.get(minuteStartUtc) ?? [];
      list.push(r);
      byMinute.set(minuteStartUtc, list);
    }
    // Ordena cada minuto cronologicamente: a 1ª pedra do minuto fica à esquerda
    for (const list of byMinute.values()) {
      list.sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    }

    if (!isFinite(minMinute)) return [] as MinuteCol[][];

    const minuteDigit = (utcMs: number) => new Date(utcMs).getUTCMinutes() % 10;
    const decadeStart = (utcMs: number) =>
      utcMs - minuteDigit(utcMs) * 60000;

    const firstDecade = decadeStart(minMinute);
    const lastDecade = decadeStart(maxMinute);

    const rows: MinuteCol[][] = [];
    for (let dec = lastDecade; dec >= firstDecade; dec -= 10 * 60000) {
      const row: MinuteCol[] = [];
      let any = false;
      for (let col = 0; col < 10; col++) {
        const minuteStartUtc = dec + col * 60000;
        const stones = byMinute.get(minuteStartUtc) ?? [];
        if (stones.length) any = true;
        row.push({
          minuteStartUtc,
          label: fmtHM.format(new Date(minuteStartUtc)),
          stones,
        });
      }
      if (any) rows.push(row);
    }
    return rows;
  }, [results]);


  const clockTime = `${brasiliaParts.hour}:${brasiliaParts.minute}:${brasiliaParts.second}`;
  const clockDate = `${brasiliaParts.day}/${brasiliaParts.month}/${brasiliaParts.year}`;
  const latestResult = results[results.length - 1] ?? null;

  // Countdown da próxima rodada — calculado a partir do created_at
  // da última pedra. Cada rodada na Jonbet dura ~ROUND_SECONDS.
  const nextRoundIn = useMemo(() => {
    if (!latestResult || !now) return 0;
    const elapsed =
      (now.getTime() - new Date(latestResult.created_at).getTime()) / 1000;
    const remaining = Math.max(0, Math.ceil(ROUND_SECONDS - elapsed));
    return remaining;
  }, [latestResult, now]);


  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-emerald-500/30 bg-gradient-to-r from-slate-950 via-emerald-950/40 to-slate-950">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
              <span className="text-white">FLUXO</span>
              <span className="text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]">JON</span>
            </h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-3 px-2 py-4 sm:px-4">
        {syncState.lastError && (
          <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {syncState.lastError}
          </div>
        )}


        {/* Roleta animada — gira ao receber novo resultado */}
        <SpinWheel
          roll={latestResult?.roll ?? null}
          resultId={latestResult?.game_id ?? null}
          status="waiting"
          countdown={nextRoundIn}
        />

        {/* Temporal do Fluxo Jon — surf de cores + REC de branco */}
        <TemporalFluxoJon stones={results} nowMs={now ? now.getTime() : 0} />

        {/* Pedra antecipada removida a pedido do usuário */}

        {/* Relógio e badge da última pedra movidos para dentro do histórico */}

        {/* Histórico — 10 colunas fixas (00..09), 2 pedras por minuto, mín 6 linhas */}
        {(() => {
          const displayCols = 10;
          const stonesPerMinute = STONES_PER_MINUTE;
          const cellWidthClass = isMobile ? "w-[86px]" : "w-[92px]";
          const gridMinWidthClass = isMobile ? "min-w-[912px]" : "min-w-[972px]";
          const FLUXO_W = 280;

          // Monta minuteRows direto a partir de `results` no formato da spec
          const rowsForGrid = (() => {
            if (results.length === 0) {
              // sem dados ainda: cria 6 linhas vazias ancoradas no minuto atual de Brasília
              const ref = now ?? new Date();
              const brasiliaMs = ref.getTime() - 3 * 60 * 60 * 1000;
              const minuteStartMs = Math.floor(brasiliaMs / 60000) * 60000;
              const anchor = new Date(
                minuteStartMs - (new Date(minuteStartMs).getUTCMinutes() % 10) * 60000,
              );
              return Array.from({ length: 6 }, (_, rowIdx) => {
                const rowStart = new Date(anchor);
                rowStart.setUTCMinutes(anchor.getUTCMinutes() - rowIdx * 10);
                return {
                  rowKey: `empty-${rowIdx}`,
                  cells: Array.from({ length: displayCols }, (_, col) => {
                    const md = new Date(rowStart);
                    md.setUTCMinutes(rowStart.getUTCMinutes() + col);
                    return {
                      key: `${rowIdx}-${col}`,
                      timeLabel: `${pad2(md.getUTCHours())}:${pad2(md.getUTCMinutes())}`,
                      items: [] as DoubleRow[],
                    };
                  }),
                };
              });
            }

            // Em Brasília (UTC-3): cada pedra ganha um minute_key "YYYY-MM-DD HH:MM"
            const toBrasilia = (iso: string) =>
              new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000);
            const minuteKeyOf = (iso: string) => {
              const d = toBrasilia(iso);
              return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
            };

            const byMinute = new Map<string, DoubleRow[]>();
            for (const r of results) {
              const k = minuteKeyOf(r.created_at);
              const list = byMinute.get(k) ?? [];
              list.push(r);
              byMinute.set(k, list);
            }
            for (const list of byMinute.values()) {
              list.sort(
                (a, b) =>
                  new Date(a.created_at).getTime() -
                  new Date(b.created_at).getTime(),
              );
            }

            // Mais novo (results já está asc, então pega o último)
            const newest = toBrasilia(results[results.length - 1].created_at);
            const oldest = toBrasilia(results[0].created_at);

            const anchorRowStart = new Date(
              Date.UTC(
                newest.getUTCFullYear(),
                newest.getUTCMonth(),
                newest.getUTCDate(),
                newest.getUTCHours(),
                Math.floor(newest.getUTCMinutes() / 10) * 10,
              ),
            );
            const oldestRowStart = new Date(
              Date.UTC(
                oldest.getUTCFullYear(),
                oldest.getUTCMonth(),
                oldest.getUTCDate(),
                oldest.getUTCHours(),
                Math.floor(oldest.getUTCMinutes() / 10) * 10,
              ),
            );

            const rowCount = Math.max(
              6,
              Math.ceil(
                (anchorRowStart.getTime() - oldestRowStart.getTime()) /
                  (10 * 60 * 1000),
              ) + 1,
            );

            return Array.from({ length: rowCount }, (_, rowIdx) => {
              const rowStart = new Date(anchorRowStart);
              rowStart.setUTCMinutes(anchorRowStart.getUTCMinutes() - rowIdx * 10);
              return {
                rowKey: `${rowStart.getTime()}`,
                cells: Array.from({ length: displayCols }, (_, col) => {
                  const md = new Date(rowStart);
                  md.setUTCMinutes(rowStart.getUTCMinutes() + col);
                  const key = `${md.getUTCFullYear()}-${pad2(md.getUTCMonth() + 1)}-${pad2(md.getUTCDate())} ${pad2(md.getUTCHours())}:${pad2(md.getUTCMinutes())}`;
                  return {
                    key,
                    timeLabel: `${pad2(md.getUTCHours())}:${pad2(md.getUTCMinutes())}`,
                    items: (byMinute.get(key) ?? []).slice(0, stonesPerMinute),
                  };
                }),
              };
            });
          })();

          const renderEmptyStone = (key: string, timeLabel: string) => (
            <div key={key} className="flex flex-col items-center gap-0.5">
              <div className="h-8 w-8 rounded-full border border-white/20 bg-white/5" />
              <span className="text-[9px] font-bold text-white/70 tracking-wider bg-white/10 px-1.5 py-0.5 rounded-sm">
                {timeLabel}
              </span>
            </div>
          );

          const todayLabel = new Date().toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          });

          return (
            <div className="overflow-x-auto">
              <div className="flex items-start gap-2">
                <div
                  className={`${gridMinWidthClass} bg-white/5 rounded-lg overflow-hidden`}
                >
                  {/* Barra de data + relógio Brasília */}
                  <div
                    className="flex items-center justify-between gap-3 px-3 py-2"
                    style={{ background: "linear-gradient(135deg, #0277bd, #01579b)" }}
                  >
                    <span className="text-[13px] font-bold text-white/90 tabular-nums tracking-wider">
                      {todayLabel}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                      </span>
                      <span className="font-mono text-[16px] font-extrabold tabular-nums text-white">
                        {clockTime}
                      </span>
                    </div>
                  </div>

                  {/* Header das colunas (00..09) */}
                  <div className="flex border-b-2 border-white/20 bg-white/10">
                    {Array.from({ length: displayCols }, (_, i) => (
                      <div
                        key={i}
                        className={`${cellWidthClass} flex-shrink-0 ${i > 0 ? "border-l border-white/20" : ""} py-3 text-center`}
                      >
                        <span className="text-[11px] font-bold text-white tracking-wider">
                          {pad2(i)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Linhas */}
                  <div>
                    {rowsForGrid.map((row, rowIdx) => (
                      <div
                        key={row.rowKey}
                        className={`flex border-b border-white/10 ${rowIdx === 0 ? "bg-red-500/5" : "hover:bg-red-500/5"}`}
                      >
                        {row.cells.map((cell) => (
                          <div
                            key={cell.key}
                            className={`${cellWidthClass} flex-shrink-0 border-l border-white/10 px-1 py-2 overflow-hidden`}
                          >
                            <div className="flex items-start justify-center gap-0.5">
                              {Array.from({ length: stonesPerMinute }, (_, stoneIdx) => {
                                const stone = cell.items[stoneIdx];
                                return (
                                  <div
                                    key={
                                      stone
                                        ? `${cell.key}-${stone.id}`
                                        : `${cell.key}-empty-${stoneIdx}`
                                    }
                                    className="flex flex-col items-center gap-1"
                                  >
                                    {stone ? (
                                      <Slot
                                        number={stone.roll}
                                        color={colorName(stone.roll)}
                                        size="sm"
                                      />
                                    ) : (
                                      <div className="h-9 w-9 rounded-lg border border-white/20 bg-white/5" />
                                    )}
                                    <span className="text-[10px] font-bold text-white leading-none tracking-tight tabular-nums bg-white/10 px-1 py-0.5 rounded-sm">
                                      {cell.timeLabel}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Painel Fluxo Jon Cores + Brancos do Fluxo Jon */}
                <div style={{ width: FLUXO_W, flexShrink: 0 }} className="space-y-3">
                  <FluxoCores stones={results} nowMs={now ? now.getTime() : 0} />
                  <BrancosFluxoJon stones={results} nowMs={now ? now.getTime() : 0} />
                  <CorrecaoBrancos stones={results} nowMs={now ? now.getTime() : 0} />
                </div>
              </div>
            </div>
          );
        })()}


        {loading && (
          <p className="text-center text-sm text-slate-400">Carregando…</p>
        )}
        {!loading && results.length === 0 && (
          <p className="text-center text-sm text-slate-400">
            Aguardando primeiros dados da API…
          </p>
        )}
      </main>
      <DrawingOverlay />
    </div>
  );
}
