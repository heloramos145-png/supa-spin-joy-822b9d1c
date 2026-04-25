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

        {/* Live Brasília clock — sits ABOVE the grid */}
        <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-400">
              Horário de Brasília
            </div>
            <div className="text-[10px] text-slate-500">{clockDate}</div>
          </div>
          <div className="font-mono text-2xl font-bold tabular-nums text-emerald-400 sm:text-3xl">
            {clockTime}
          </div>
        </div>

        {/* Stats strip (current Brasília hour) */}
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
                {row.map((cell) => (
                  <div
                    key={cell.col}
                    className="flex items-center justify-center gap-[3px] rounded border border-slate-800/80 bg-slate-950/60 p-1"
                  >
                    <Stone result={cell.first} />
                    <Stone result={cell.second} />
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
