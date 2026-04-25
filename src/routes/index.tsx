import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { syncJonbetDouble } from "@/utils/roulette.functions";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import stone0 from "@/assets/stones/0.png";
import stone1 from "@/assets/stones/1.png";
import stone2 from "@/assets/stones/2.png";
import stone3 from "@/assets/stones/3.png";
import stone4 from "@/assets/stones/4.png";
import stone5 from "@/assets/stones/5.png";
import stone6 from "@/assets/stones/6.png";
import stone7 from "@/assets/stones/7.png";
import stone8 from "@/assets/stones/8.png";
import stone9 from "@/assets/stones/9.png";
import stone10 from "@/assets/stones/10.png";
import stone11 from "@/assets/stones/11.png";
import stone12 from "@/assets/stones/12.png";
import stone13 from "@/assets/stones/13.png";
import stone14 from "@/assets/stones/14.png";

const STONES = [
  stone0, stone1, stone2, stone3, stone4, stone5, stone6, stone7,
  stone8, stone9, stone10, stone11, stone12, stone13, stone14,
];

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




function Stone({ result }: { result: DoubleRow | null }) {
  if (!result) {
    return (
      <div className="flex h-[24px] w-[24px] items-center justify-center rounded-md border border-dashed border-slate-700/40 text-[9px] text-slate-600/60">
        ·
      </div>
    );
  }
  const src = STONES[result.roll] ?? STONES[0];
  return (
    <img
      src={src}
      alt={`pedra ${result.roll}`}
      title={`${new Date(result.created_at).toLocaleTimeString("pt-BR")} • ${result.roll}`}
      className="h-[24px] w-[24px] object-contain"
      draggable={false}
    />
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

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Build rows of 10 stones each, newest first
  const COLS_PER_ROW = 10;
  const ROWS_VISIBLE = 30; // 300 last results visible (30 rows × 10)
  const rows = useMemo(() => {
    const r: (DoubleRow | null)[][] = [];
    for (let i = 0; i < ROWS_VISIBLE; i++) {
      const slice = results.slice(i * COLS_PER_ROW, (i + 1) * COLS_PER_ROW);
      while (slice.length < COLS_PER_ROW) slice.push(null as unknown as DoubleRow);
      r.push(slice as (DoubleRow | null)[]);
    }
    return r;
  }, [results]);

  // Stats over all loaded results
  const stats = useMemo(() => {
    let red = 0, black = 0, white = 0;
    for (const r of results) {
      if (r.color === 0) white++;
      else if (r.color === 1) red++;
      else black++;
    }
    return { total: results.length, red, black, white };
  }, [results]);

  const clockTime = now.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const clockDate = now.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    weekday: "long",
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

        {/* Live clock — sits ABOVE the grid */}
        <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
          <div className="text-xs uppercase tracking-wider text-slate-400">
            Horário
          </div>
          <div className="text-right">
            <div className="font-mono text-2xl font-bold tabular-nums text-emerald-400 sm:text-3xl">
              {clockTime}
            </div>
            <div className="text-[11px] capitalize text-slate-400">
              {clockDate}
            </div>
          </div>
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

        {/* Grid — newest on top, 10 per row */}
        <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/40 p-2">
          <div className="min-w-[420px]">
            {rows.map((row, rIdx) => (
              <div
                key={rIdx}
                className="mb-[3px] grid grid-cols-10 gap-[3px]"
              >
                {row.map((cell, cIdx) => (
                  <div
                    key={cIdx}
                    className="flex items-center justify-center rounded border border-slate-800/80 bg-slate-950/60 p-1"
                  >
                    <Stone result={cell} />
                  </div>
                ))}
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
