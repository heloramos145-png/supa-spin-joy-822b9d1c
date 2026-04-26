import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClientJonbetSync, type ClientSyncState } from "@/hooks/useClientJonbetSync";
import SpinWheel from "@/components/SpinWheel";
export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Análise Double Jonbet — Histórico em grid" },
      {
        name: "description",
        content:
          "Histórico do Double da Jonbet em grid de minutos: colunas 0-9, linhas a cada 10 minutos.",
      },
    ],
  }),
});

type DoubleRow = {
  id: number;
  game_id: string;
  roll: number;
  color: number; // 0=white, 1=green(1-7), 2=black(8-14)
  created_at: string;
};

const POLL_MS = 3000;
// Tempo médio de uma rodada da Jonbet Double (~37s + animação ~3s ≈ 40s).
// O countdown é calculado a partir do created_at da última pedra.
const ROUND_SECONDS = 40;

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

function Stone({ result }: { result: DoubleRow | null }) {
  if (!result) {
    return (
      <div className="h-[22px] w-[22px] rounded-[5px] border border-dashed border-slate-700/40" />
    );
  }
  // Colors faithful to the provided icons
  let fill = "#ffffff";
  let stroke = "#2e7d32"; // green border for white
  let textColor = "#111827";
  if (result.color === 1) {
    fill = "#7CFC6B"; // bright green
    stroke = "#3b7a2b";
    textColor = "#0b1a06";
  } else if (result.color === 2) {
    fill = "#1f1f1f"; // near black
    stroke = "#3a3a3a";
    textColor = "#ffffff";
  }
  return (
    <svg
      viewBox="0 0 24 24"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      className="block"
      aria-label={`pedra ${result.roll}`}
    >
      <title>
        {new Date(result.created_at).toLocaleTimeString("pt-BR")} • {result.roll}
      </title>
      <rect
        x="1.5"
        y="1.5"
        width="21"
        height="21"
        rx="5"
        ry="5"
        fill={fill}
        stroke={stroke}
        strokeWidth="1.5"
      />
      <circle
        cx="12"
        cy="12"
        r="6.5"
        fill="none"
        stroke={textColor}
        strokeWidth="1.4"
      />
      <text
        x="12"
        y="12.5"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontWeight="800"
        fontSize="11"
        fill={textColor}
      >
        {result.roll}
      </text>
    </svg>
  );
}

function Index() {
  const [results, setResults] = useState<DoubleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncState, setSyncState] = useState<ClientSyncState>({
    status: "idle",
    lastInserted: 0,
    lastError: null,
    lastRunAt: null,
  });
  // now começa em 0 no SSR e só vira Date no cliente — evita hydration mismatch
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
  }, []);

  async function fetchResults() {
    const sinceISO = startOfBrasiliaDayISO();
    const { data, error } = await supabase
      .from("double_results")
      .select("*")
      .gte("created_at", sinceISO)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) {
      setSyncState((s) => ({ ...s, lastError: error.message, status: "error" }));
      return;
    }
    setResults((data ?? []) as DoubleRow[]);
  }

  // Sync client-side: o navegador (IP BR) busca da Jonbet a cada POLL_MS
  // e insere no banco. O realtime abaixo entrega para o gráfico.
  useClientJonbetSync(POLL_MS, setSyncState);

  // Detecta virada de dia em Brasília → limpa pedras antigas da tela e recarrega.
  useEffect(() => {
    let lastDay = startOfBrasiliaDayISO();
    const id = setInterval(() => {
      const today = startOfBrasiliaDayISO();
      if (today !== lastDay) {
        lastDay = today;
        setResults([]);
        fetchResults();
      }
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    (async () => {
      await fetchResults();
      setLoading(false);
    })();

    // Realtime: insere pedras na hora que chegam no banco
    const channel = supabase
      .channel("double_results_live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "double_results" },
        (payload) => {
          const row = payload.new as DoubleRow;
          // Descarta pedras anteriores ao início do dia em Brasília
          if (new Date(row.created_at).getTime() < new Date(startOfBrasiliaDayISO()).getTime()) {
            return;
          }
          setResults((prev) => {
            if (prev.some((r) => r.id === row.id)) return prev;
            return [row, ...prev].sort(
              (a, b) =>
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime(),
            );
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
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
    // Ordena cada minuto por horário (recente em cima)
    for (const list of byMinute.values()) {
      list.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
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

  // Countdown da próxima rodada — calculado a partir do created_at
  // da última pedra. Cada rodada na Jonbet dura ~ROUND_SECONDS.
  const nextRoundIn = useMemo(() => {
    const last = results[0];
    if (!last || !now) return 0;
    const elapsed = (now.getTime() - new Date(last.created_at).getTime()) / 1000;
    const remaining = Math.max(0, Math.ceil(ROUND_SECONDS - elapsed));
    return remaining;
  }, [results, now]);


  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800/60 bg-slate-900/40">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              Análise Double Jonbet
            </h1>
            <p className="text-xs text-slate-400">
              Atualiza a cada {POLL_MS / 1000}s • {results.length} rodadas
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {syncState.lastRunAt && (
              <span className="text-slate-400">
                Sync:{" "}
                {new Date(syncState.lastRunAt).toLocaleTimeString("pt-BR")}
              </span>
            )}
            <span
              className={
                syncState.status === "ok"
                  ? "rounded bg-emerald-500/20 px-2 py-0.5 text-emerald-300"
                  : syncState.status === "blocked"
                  ? "rounded bg-amber-500/20 px-2 py-0.5 text-amber-300"
                  : syncState.status === "error"
                  ? "rounded bg-rose-500/20 px-2 py-0.5 text-rose-300"
                  : "rounded bg-slate-500/20 px-2 py-0.5 text-slate-300"
              }
            >
              {syncState.status === "ok"
                ? "ao vivo"
                : syncState.status === "blocked"
                ? "bloqueado"
                : syncState.status}
            </span>
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
          roll={results[0]?.roll ?? null}
          resultId={results[0]?.game_id ?? null}
          status="waiting"
          countdown={nextRoundIn}
        />

        {/* Relógio de Brasília — compacto, acima do gráfico */}
        <div className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900/60 px-3 py-1.5">
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-300">
              Horário de Brasília
            </span>
          </div>
          <div className="font-mono text-[14px] font-bold tabular-nums text-emerald-400 sm:text-base">
            {clockTime}
          </div>
          <div className="hidden text-[10px] text-slate-400 sm:block">
            {clockDate}
          </div>
        </div>

        {/* Badge: última pedra recebida (debug visível) */}
        {results[0] && (
          <div className="flex items-center justify-between rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs">
            <span className="text-emerald-300">Última pedra recebida</span>
            <span className="font-mono font-bold text-emerald-200">
              {new Date(results[0].created_at).toLocaleTimeString("pt-BR", {
                timeZone: "America/Sao_Paulo",
              })}{" "}
              • roll {results[0].roll}
            </span>
          </div>
        )}

        {/* Grade contínua: 10 colunas, pedras do mesmo minuto lado a lado */}
        {(() => {
          // Largura por pedra e largura da coluna (proporcional ao máximo global de pedras por minuto)
          const STONE_W = 28;
          const STONE_GAP = 3;
          const PAD = 4;
          const globalMax = Math.max(
            1,
            ...minuteRows.flatMap((row) => row.map((c) => c.stones.length)),
          );
          const colW = Math.max(
            44,
            PAD * 2 + globalMax * STONE_W + (globalMax - 1) * STONE_GAP,
          );
          const gridTemplate = `repeat(10, ${colW}px)`;
          return (
            <div className="overflow-x-auto rounded-md border border-slate-800 bg-slate-900/40 p-2">
              <div
                className="sticky top-0 z-10 mb-1 grid gap-1 bg-slate-900/80 pb-1 backdrop-blur"
                style={{ gridTemplateColumns: gridTemplate }}
              >
                {COLS.map((c) => (
                  <div
                    key={c}
                    className="flex h-7 items-center justify-center rounded bg-slate-800/70 font-bold text-slate-200"
                    style={{ width: colW, fontSize: 14 }}
                  >
                    {String(c).padStart(2, "0")}
                  </div>
                ))}
              </div>

              {minuteRows.map((row, rIdx) => (
                <div
                  key={rIdx}
                  className="grid gap-1 pb-1"
                  style={{ gridTemplateColumns: gridTemplate }}
                >
                  {row.map((cell) => {
                    const hasData = cell.stones.length > 0;
                    return (
                      <div
                        key={cell.minuteStartUtc}
                        className={`flex flex-col items-center justify-center rounded border ${
                          hasData
                            ? "border-slate-800/80 bg-slate-950/60"
                            : "border-dashed border-slate-800/40 bg-slate-950/20"
                        }`}
                        style={{ width: colW, padding: PAD, minHeight: 48 }}
                      >
                        <div
                          className="flex flex-row items-center justify-center"
                          style={{ gap: STONE_GAP }}
                        >
                          {cell.stones.map((s) => (
                            <div
                              key={s.id}
                              style={{ width: STONE_W, height: STONE_W }}
                              className="flex items-center justify-center"
                            >
                              <Stone result={s} />
                            </div>
                          ))}
                        </div>
                        {hasData && (
                          <div
                            className="leading-none text-slate-400 tabular-nums"
                            style={{ fontSize: 10, marginTop: 3 }}
                          >
                            {cell.label}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
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
    </div>
  );
}
