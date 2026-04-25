import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { syncJonbetDouble } from "@/utils/roulette.functions";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import stoneWhite from "@/assets/stone-white.jpeg";
import stoneGreen from "@/assets/stone-green.jpeg";
import stoneBlack from "@/assets/stone-black.jpeg";

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
  color: number; // 0=white, 1=red(1-7), 2=black(8-14)
  created_at: string;
};

const POLL_MS = 5000;

// 6 row buckets: 0-9 min, 10-19, 20-29, 30-39, 40-49, 50-59
const ROW_BUCKETS = [0, 10, 20, 30, 40, 50] as const;
// Columns 0..9 = last digit of the minute
const COLS = Array.from({ length: 10 }, (_, i) => i);

// Each minute has 2 cells: half 0 (seconds 0-29) and half 1 (seconds 30-59)
type Cell = { row: number; col: number; half: 0 | 1; result: DoubleRow | null };

function stoneIcon(color: number) {
  if (color === 0) return stoneWhite;
  if (color === 1) return stoneGreen;
  return stoneBlack;
}

function stoneTextClass(color: number) {
  if (color === 0) return "text-zinc-900";
  if (color === 1) return "text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]";
  return "text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]";
}

function Stone({ result }: { result: DoubleRow | null }) {
  if (!result) {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-dashed border-slate-700/40 text-[10px] text-slate-600/60">
        ·
      </div>
    );
  }
  return (
    <div
      title={`${new Date(result.created_at).toLocaleTimeString("pt-BR")} • ${result.roll}`}
      className="relative h-8 w-8"
    >
      <img
        src={stoneIcon(result.color)}
        alt={`pedra ${result.roll}`}
        className="h-8 w-8 rounded-lg object-cover"
        draggable={false}
      />
      <span
        className={`absolute inset-0 flex items-center justify-center text-xs font-extrabold ${stoneTextClass(result.color)}`}
      >
        {result.roll}
      </span>
    </div>
  );
}

function Index() {
  const [results, setResults] = useState<DoubleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hourOffset, setHourOffset] = useState(0); // 0 = current hour

  async function fetchResults() {
    const { data, error } = await supabase
      .from("double_results")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
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

  // Determine the displayed hour
  const displayedHour = useMemo(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + hourOffset);
    return d;
  }, [hourOffset, lastSync]);

  // Build the 60-minute, 2-half grid filled with results that fall in the displayed hour
  const grid = useMemo<Cell[][]>(() => {
    const start = displayedHour.getTime();
    const end = start + 60 * 60 * 1000;
    const buckets = new Map<string, DoubleRow>();
    for (const r of results) {
      const t = new Date(r.created_at).getTime();
      if (t < start || t >= end) continue;
      const minute = Math.floor((t - start) / 60000); // 0..59
      const half: 0 | 1 = ((t - start) % 60000) < 30000 ? 0 : 1;
      const key = `${minute}-${half}`;
      // Keep latest in case of duplicates
      const existing = buckets.get(key);
      if (!existing || new Date(existing.created_at).getTime() < t) {
        buckets.set(key, r);
      }
    }

    return ROW_BUCKETS.map((rowStart) =>
      COLS.map((col) => {
        const minute = rowStart + col;
        return {
          row: rowStart,
          col,
          half: 0 as 0 | 1,
          result: buckets.get(`${minute}-0`) ?? null,
        };
      }),
    ).flatMap((row, idx) => {
      // Each row is one row of 10 cells of 2 stones each
      return [
        row.map((c) => ({ ...c, half: 0 as 0 | 1, result: c.result })),
        row.map((c) => ({
          ...c,
          half: 1 as 0 | 1,
          result: buckets.get(`${ROW_BUCKETS[idx] + c.col}-1`) ?? null,
        })),
      ] as unknown as Cell[][];
    });
    // grid above produces array of pairs; we'll restructure below
  }, [results, displayedHour]);

  // Recombine grid into rows of cells where each cell has both halves
  const rows = useMemo(() => {
    return ROW_BUCKETS.map((rowStart, rIdx) => {
      const half0 = grid[rIdx * 2];
      const half1 = grid[rIdx * 2 + 1];
      return COLS.map((col) => ({
        rowStart,
        col,
        minute: rowStart + col,
        first: half0?.[col]?.result ?? null,
        second: half1?.[col]?.result ?? null,
      }));
    });
  }, [grid]);

  // Stats over all results in displayed hour
  const stats = useMemo(() => {
    const start = displayedHour.getTime();
    const end = start + 60 * 60 * 1000;
    let red = 0,
      black = 0,
      white = 0,
      total = 0;
    for (const r of results) {
      const t = new Date(r.created_at).getTime();
      if (t < start || t >= end) continue;
      total++;
      if (r.color === 0) white++;
      else if (r.color === 1) red++;
      else black++;
    }
    return { total, red, black, white };
  }, [results, displayedHour]);

  const hourLabel = displayedHour.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800/60 bg-slate-900/40">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              Análise Double Jonbet
            </h1>
            <p className="text-xs text-slate-400">
              Grid em tempo real • atualiza a cada {POLL_MS / 1000}s
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

      <main className="mx-auto max-w-7xl space-y-4 px-2 py-4 sm:px-4">
        {error && (
          <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {error}
          </div>
        )}

        {/* Hour navigator */}
        <div className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setHourOffset((h) => h - 1)}
            className="text-slate-300"
          >
            ◀ Hora anterior
          </Button>
          <div className="font-mono font-semibold text-slate-200">
            {hourLabel}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setHourOffset((h) => Math.min(0, h + 1))}
            disabled={hourOffset >= 0}
            className="text-slate-300"
          >
            Próxima hora ▶
          </Button>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-4 gap-2 text-center text-sm">
          <div className="rounded-md border border-slate-800 bg-slate-900/50 py-2">
            <div className="text-[11px] uppercase text-slate-400">Total</div>
            <div className="font-bold">{stats.total}</div>
          </div>
          <div className="rounded-md border border-emerald-700/40 bg-emerald-500/10 py-2">
            <div className="text-[11px] uppercase text-emerald-300">Verde</div>
            <div className="font-bold text-emerald-200">{stats.red}</div>
          </div>
          <div className="rounded-md border border-zinc-700/60 bg-zinc-800/40 py-2">
            <div className="text-[11px] uppercase text-zinc-300">Preto</div>
            <div className="font-bold">{stats.black}</div>
          </div>
          <div className="rounded-md border border-slate-300/30 bg-white/5 py-2">
            <div className="text-[11px] uppercase text-slate-300">Branco</div>
            <div className="font-bold">{stats.white}</div>
          </div>
        </div>

        {/* Grid */}
        <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/40 p-2">
          <div className="min-w-[640px]">
            {/* Column header */}
            <div className="grid grid-cols-[56px_repeat(10,minmax(0,1fr))] gap-1 pb-2">
              <div />
              {COLS.map((c) => (
                <div
                  key={c}
                  className="rounded-md bg-slate-800/60 py-1 text-center text-xs font-bold text-slate-200"
                >
                  {String(c).padStart(2, "0")}
                </div>
              ))}
            </div>

            {/* Rows */}
            {rows.map((row, rIdx) => {
              const startMin = ROW_BUCKETS[rIdx];
              const endMin = (startMin + 10) % 60;
              return (
                <div
                  key={rIdx}
                  className="mb-1 grid grid-cols-[56px_repeat(10,minmax(0,1fr))] gap-1"
                >
                  <div className="flex items-center justify-center rounded-md bg-slate-800/60 px-1 text-[11px] font-semibold text-slate-300">
                    {String(startMin).padStart(2, "0")}–
                    {String(endMin).padStart(2, "0")}
                  </div>
                  {row.map((cell) => (
                    <div
                      key={cell.col}
                      className="flex flex-col items-center justify-center gap-1 rounded-md border border-slate-800/80 bg-slate-950/60 p-1"
                    >
                      <div className="flex items-center gap-1">
                        <Stone result={cell.first} />
                        <Stone result={cell.second} />
                      </div>
                      <div className="text-[9px] font-mono text-slate-500">
                        {String(cell.minute).padStart(2, "0")}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
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
