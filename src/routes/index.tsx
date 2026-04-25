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
      width={24}
      height={24}
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

  // Agrupa pedras por hora de Brasília (UTC-3) — uma grade 6×10 por hora
  const hourSections = useMemo(() => {
    type Bucket = { first: DoubleRow | null; second: DoubleRow | null };
    // Map<hourKey, Map<"minute-half", DoubleRow>>
    // hourKey = epoch ms do início da hora em UTC para a hora de Brasília
    const byHour = new Map<number, Map<string, DoubleRow>>();

    for (const r of results) {
      const t = new Date(r.created_at).getTime();
      // Início da hora de Brasília (UTC-3) que contém esse instante
      const localMs = t - 3 * 60 * 60 * 1000;
      const hourStartLocal = Math.floor(localMs / (60 * 60 * 1000)) * (60 * 60 * 1000);
      const hourStartUtc = hourStartLocal + 3 * 60 * 60 * 1000;
      const minute = Math.floor((t - hourStartUtc) / 60000);
      const half = (t - hourStartUtc) % 60000 < 30000 ? 0 : 1;
      const key = `${minute}-${half}`;

      let bucket = byHour.get(hourStartUtc);
      if (!bucket) {
        bucket = new Map();
        byHour.set(hourStartUtc, bucket);
      }
      const existing = bucket.get(key);
      if (!existing || new Date(existing.created_at).getTime() < t) {
        bucket.set(key, r);
      }
    }

    // Ordena horas, mais recente primeiro
    const sortedHours = Array.from(byHour.keys()).sort((a, b) => b - a);

    return sortedHours.map((hourStartUtc) => {
      const bucket = byHour.get(hourStartUtc)!;
      // Label HH em Brasília
      const hourLabel = new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        hour12: false,
      }).format(new Date(hourStartUtc));

      const rows = ROW_BUCKETS.map((rowStart) =>
        COLS.map<Cell>((col) => {
          const minute = rowStart + col;
          return {
            rowStart,
            col,
            minute,
            first: bucket.get(`${minute}-0`) ?? null,
            second: bucket.get(`${minute}-1`) ?? null,
          };
        }),
      );

      return { hourStartUtc, hourLabel, rows };
    });
  }, [results]);


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

        {/* Grade do dia: uma sub-grade por hora de Brasília, mais recente em cima */}
        <div className="space-y-3">
          {hourSections.map((section) => (
            <div
              key={section.hourStartUtc}
              className="overflow-x-auto rounded-md border border-slate-800 bg-slate-900/40 p-2"
            >
              <div className="mb-1 flex items-center justify-between px-1">
                <div className="text-[12px] font-bold text-emerald-400">
                  {section.hourLabel}:00
                </div>
                <div className="text-[10px] text-slate-500">
                  Hor. de Brasília
                </div>
              </div>

              <div
                className="grid gap-1 pb-1"
                style={{ gridTemplateColumns: "repeat(10, 56px)" }}
              >
                {COLS.map((c) => (
                  <div
                    key={c}
                    className="flex h-8 items-center justify-center rounded bg-slate-800/60 font-bold text-slate-200"
                    style={{ width: 56, fontSize: 15 }}
                  >
                    {String(c).padStart(2, "0")}
                  </div>
                ))}
              </div>

              {section.rows.map((row, rIdx) => (
                <div
                  key={rIdx}
                  className="grid gap-1 pb-1"
                  style={{ gridTemplateColumns: "repeat(10, 56px)" }}
                >
                  {row.map((cell) => {
                    const minuteStr = String(cell.minute).padStart(2, "0");
                    return (
                      <div
                        key={cell.col}
                        className="flex flex-col items-center justify-center rounded border border-slate-800/80 bg-slate-950/60"
                        style={{ width: 56, height: 46 }}
                      >
                        <div className="flex items-center justify-center gap-[2px]">
                          <Stone result={cell.first} />
                          <Stone result={cell.second} />
                        </div>
                        <div
                          className="leading-none text-slate-400 tabular-nums"
                          style={{ fontSize: 10, marginTop: 2 }}
                        >
                          {section.hourLabel}:{minuteStr}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
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
