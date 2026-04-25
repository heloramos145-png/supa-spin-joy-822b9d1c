import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { syncJonbetDouble } from "@/utils/roulette.functions";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
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

const POLL_MS = 5000;

// 6 row buckets: top = 50–00 (newest), bottom = 00–10 (oldest within hour)
const ROW_BUCKETS = [50, 40, 30, 20, 10, 0] as const;
const COLS = Array.from({ length: 10 }, (_, i) => i);

type Cell = {
  rowStart: number;
  col: number;
  minute: number;
  first: DoubleRow | null;
  second: DoubleRow | null;
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
      width={22}
      height={22}
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
        y="12"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontWeight="800"
        fontSize="9"
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
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  async function fetchResults() {
    const { data, error } = await supabase
      .from("double_results")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1500);
    if (error) {
      setError(error.message);
      return;
    }
    setError(null);
    setResults((data ?? []) as DoubleRow[]);
  }

  async function doSync() {
    setSyncing(true);
    try {
      const res = await syncJonbetDouble();
      if (!res.ok) setError(res.error ?? "Falha ao sincronizar");
      setLastSync(new Date().toLocaleTimeString("pt-BR"));
      await fetchResults();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    (async () => {
      await fetchResults();
      setLoading(false);
      await doSync();
    })();
    const interval = setInterval(doSync, POLL_MS);
    return () => clearInterval(interval);
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
    const parts = fmt.formatToParts(now);
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

  // Build the 6×10 grid for the CURRENT Brasília hour, each cell has 2 half-minute stones
  const rows = useMemo(() => {
    // Compute start of current Brasília hour as a UTC instant
    const y = Number(brasiliaParts.year);
    const mo = Number(brasiliaParts.month);
    const d = Number(brasiliaParts.day);
    const h = Number(brasiliaParts.hour);
    // America/Sao_Paulo is UTC-3 year-round
    const hourStartUtc = Date.UTC(y, mo - 1, d, h + 3, 0, 0);
    const hourEndUtc = hourStartUtc + 60 * 60 * 1000;

    const buckets = new Map<string, DoubleRow>();
    for (const r of results) {
      const t = new Date(r.created_at).getTime();
      if (t < hourStartUtc || t >= hourEndUtc) continue;
      const minute = Math.floor((t - hourStartUtc) / 60000); // 0..59
      const half = (t - hourStartUtc) % 60000 < 30000 ? 0 : 1;
      const key = `${minute}-${half}`;
      const existing = buckets.get(key);
      if (!existing || new Date(existing.created_at).getTime() < t) {
        buckets.set(key, r);
      }
    }

    return ROW_BUCKETS.map((rowStart) =>
      COLS.map<Cell>((col) => {
        const minute = rowStart + col;
        return {
          rowStart,
          col,
          minute,
          first: buckets.get(`${minute}-0`) ?? null,
          second: buckets.get(`${minute}-1`) ?? null,
        };
      }),
    );
  }, [results, brasiliaParts]);

  // Stats over the displayed Brasília hour
  const stats = useMemo(() => {
    let red = 0, black = 0, white = 0, total = 0;
    for (const row of rows) {
      for (const cell of row) {
        for (const r of [cell.first, cell.second]) {
          if (!r) continue;
          total++;
          if (r.color === 0) white++;
          else if (r.color === 1) red++;
          else black++;
        }
      }
    }
    return { total, red, black, white };
  }, [rows]);

  const clockTime = `${brasiliaParts.hour}:${brasiliaParts.minute}:${brasiliaParts.second}`;
  const clockDate = `${brasiliaParts.day}/${brasiliaParts.month}/${brasiliaParts.year}`;

  // "Girando em MM:SS" — countdown to next round (rounds happen ~ every minute on Jonbet Double)
  const spinCountdown = useMemo(() => {
    const sec = Number(brasiliaParts.second);
    const remaining = 60 - sec;
    const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
    const ss = String(remaining % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }, [brasiliaParts.second]);

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
          <div className="flex items-center gap-2">
            {lastSync && (
              <span className="text-xs text-slate-400">Sync: {lastSync}</span>
            )}
            <Button
              onClick={doSync}
              disabled={syncing}
              size="sm"
              className="bg-blue-600 hover:bg-blue-500"
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`}
              />
              Atualizar
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-3 px-2 py-4 sm:px-4">
        {error && (
          <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {error}
          </div>
        )}

        {/* JON BET AO VIVO — banner girando, igual à roleta da Jonbet */}
        <div className="relative overflow-hidden rounded-lg border border-blue-500/40 bg-gradient-to-r from-blue-700 via-blue-600 to-blue-700 px-4 py-3 shadow-[0_0_24px_rgba(37,99,235,0.35)]">
          <div className="absolute inset-0 -translate-x-full animate-[shimmer_2.5s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
              </span>
              <span className="text-sm font-extrabold tracking-wider text-white sm:text-base">
                JON BET AO VIVO
              </span>
            </div>
            <div className="font-mono text-base font-bold tabular-nums text-white sm:text-lg">
              Girando em {spinCountdown}
            </div>
            <div className="hidden text-[11px] text-blue-100 sm:block">
              {clockDate} • {clockTime}
            </div>
          </div>
        </div>

        {/* Grid — 10 columns (00–09), 6 rows (10-min buckets, no side labels) */}
        <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/40 p-2">
          <div className="min-w-[560px]">
            {/* Column header */}
            <div className="grid grid-cols-10 gap-[3px] pb-[4px]">
              {COLS.map((c) => (
                <div
                  key={c}
                  className="rounded bg-slate-800/60 py-0.5 text-center text-[13px] font-bold text-slate-200"
                >
                  {String(c).padStart(2, "0")}
                </div>
              ))}
            </div>

            {/* Rows */}
            {rows.map((row, rIdx) => (
              <div
                key={rIdx}
                className="mb-[3px] grid grid-cols-10 gap-[3px]"
              >
                {row.map((cell) => {
                  const mm = String(Math.floor(cell.minute / 10)).padStart(2, "0");
                  const ss = String(cell.minute % 10).padStart(2, "0");
                  return (
                    <div
                      key={cell.col}
                      className="flex flex-col items-center justify-center gap-[2px] rounded border border-slate-800/80 bg-slate-950/60 p-1"
                    >
                      <div className="flex items-center justify-center gap-[3px]">
                        <Stone result={cell.first} />
                        <Stone result={cell.second} />
                      </div>
                      <div className="text-[9px] font-medium leading-none text-slate-400 tabular-nums">
                        {brasiliaParts.hour}:{mm}{ss}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

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
