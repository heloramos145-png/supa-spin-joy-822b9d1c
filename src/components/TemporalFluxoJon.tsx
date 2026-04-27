import { useEffect, useMemo, useState } from "react";
import { Flame, Snowflake, Zap, Target, AlertTriangle, CheckCircle2 } from "lucide-react";

export type TemporalStone = {
  id: string | number;
  roll: number;
  color: number; // 0=branco, 1=verde, 2=preto
  created_at: string;
};

const SIGNALS_STORAGE_KEY = "brancos-fluxo-jon:signals:v1";

type StoredSignal = { timeMs: number; label: string };
type StoredSignals = Record<string, StoredSignal[]>;
type SignalsStore = { dayKey: string; signals: StoredSignals };

type SignalStatus = "pending" | "waiting" | "win-latado" | "win-margem" | "loss";

function evaluateSignal(
  timeMs: number,
  whitesMs: number[],
  nowMs: number,
): SignalStatus {
  const minStart = timeMs;
  const minEnd = timeMs + 60000;
  const prevStart = timeMs - 60000;
  const nextEnd = timeMs + 120000;

  const inMinute = whitesMs.some((t) => t >= minStart && t < minEnd);
  if (inMinute) return "win-latado";

  const inPrev = whitesMs.some((t) => t >= prevStart && t < minStart);
  const inNext = whitesMs.some((t) => t >= minEnd && t < nextEnd);
  if (inPrev || inNext) return "win-margem";

  if (nowMs >= nextEnd) return "loss";
  if (nowMs < prevStart) return "pending";
  return "waiting";
}

export default function TemporalFluxoJon({
  stones,
  nowMs,
}: {
  stones: TemporalStone[];
  nowMs: number;
}) {
  const whites = useMemo(
    () =>
      stones
        .filter((s) => s.color === 0)
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime(),
        ),
    [stones],
  );

  // Lê sinais do BrancosFluxoJon (todas as abas) do localStorage
  const [storedSignals, setStoredSignals] = useState<StoredSignal[]>([]);

  useEffect(() => {
    function load() {
      try {
        const raw = localStorage.getItem(SIGNALS_STORAGE_KEY);
        if (!raw) {
          setStoredSignals([]);
          return;
        }
        const parsed = JSON.parse(raw) as StoredSignals | SignalsStore;
        const map: StoredSignals =
          parsed && typeof parsed === "object" && "signals" in parsed
            ? (parsed as SignalsStore).signals
            : (parsed as StoredSignals);
        const all: StoredSignal[] = [];
        for (const k of Object.keys(map ?? {})) {
          for (const s of map[k] ?? []) all.push(s);
        }
        all.sort((a, b) => a.timeMs - b.timeMs);
        setStoredSignals(all);
      } catch {
        setStoredSignals([]);
      }
    }
    load();
    const id = window.setInterval(load, 5000);
    const onStorage = (e: StorageEvent) => {
      if (e.key === SIGNALS_STORAGE_KEY) load();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const recInfo = useMemo(() => {
    const whitesMs = whites.map((w) => new Date(w.created_at).getTime());
    const lastWhiteMs = whitesMs.length ? whitesMs[whitesMs.length - 1] : 0;
    const stonesSince = lastWhiteMs
      ? stones.filter((s) => new Date(s.created_at).getTime() > lastWhiteMs).length
      : stones.length;
    const sinceMin = lastWhiteMs && nowMs ? Math.floor((nowMs - lastWhiteMs) / 60000) : 0;

    // Avalia os últimos sinais já fechados (pending/waiting não contam)
    const evaluated = storedSignals
      .map((s) => ({ ...s, status: evaluateSignal(s.timeMs, whitesMs, nowMs) }))
      .filter((s) => s.status === "loss" || s.status === "win-latado" || s.status === "win-margem");

    // Conta perdas consecutivas no final
    let lossStreak = 0;
    for (let i = evaluated.length - 1; i >= 0; i--) {
      if (evaluated[i].status === "loss") lossStreak++;
      else break;
    }

    const recBy25 = stonesSince >= 25;
    const recByLoss = lossStreak >= 3;
    const isRec = recBy25 || recByLoss;

    return {
      isRec,
      recBy25,
      recByLoss,
      stonesSince,
      sinceMin,
      lossStreak,
    };
  }, [whites, stones, nowMs, storedSignals]);

  const reasonText = recInfo.recByLoss
    ? `${recInfo.lossStreak} sinais seguidos perdidos`
    : recInfo.recBy25
      ? `${recInfo.stonesSince} pedras sem branco`
      : `${recInfo.stonesSince} pedras sem branco`;

  return (
    <div
      className={`relative overflow-hidden rounded-xl border px-4 py-3 transition-all ${
        recInfo.isRec
          ? "border-amber-400/50 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-rose-500/15 shadow-[0_0_24px_-6px_rgba(251,191,36,0.55)]"
          : "border-slate-700/70 bg-gradient-to-r from-slate-900/70 via-slate-800/60 to-slate-900/70"
      }`}
    >
      {/* Glow pulsante quando em REC */}
      {recInfo.isRec && (
        <div className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-amber-300/10 to-transparent" />
      )}

      <div className="relative flex items-center gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${
            recInfo.isRec
              ? "border-amber-300/60 bg-amber-400/15 text-amber-300"
              : "border-slate-600/70 bg-slate-800/60 text-slate-300"
          }`}
        >
          {recInfo.isRec ? (
            <Flame className="h-5 w-5 drop-shadow-[0_0_6px_rgba(251,191,36,0.7)]" />
          ) : (
            <Snowflake className="h-5 w-5" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`text-[11px] font-extrabold uppercase tracking-[0.18em] ${
                recInfo.isRec ? "text-amber-300" : "text-slate-200"
              }`}
            >
              Temporal do Fluxo Jon
            </span>
            {recInfo.isRec && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/60 bg-amber-400/20 px-2 py-[1px] text-[9px] font-black uppercase tracking-wider text-amber-200">
                <Zap className="h-2.5 w-2.5" /> REC
              </span>
            )}
          </div>
          <div
            className={`mt-1 text-[11px] font-medium ${
              recInfo.isRec ? "text-amber-100/90" : "text-slate-400"
            }`}
          >
            {whites.length < 1
              ? "Aguardando histórico…"
              : recInfo.isRec
                ? `🔥 ${reasonText} • há ${recInfo.sinceMin}min`
                : `${recInfo.stonesSince} pedras sem branco • há ${recInfo.sinceMin}min`}
          </div>
        </div>

        {/* Mini barra de intensidade */}
        <div className="hidden sm:flex flex-col items-end gap-0.5">
          <div className="text-[9px] uppercase tracking-wider text-slate-400">
            Intensidade
          </div>
          <div className="flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => {
              const level = Math.min(
                5,
                Math.max(
                  Math.floor(recInfo.stonesSince / 6),
                  recInfo.lossStreak,
                ),
              );
              const on = i < level;
              return (
                <div
                  key={i}
                  className={`h-3 w-1.5 rounded-sm ${
                    on
                      ? recInfo.isRec
                        ? "bg-amber-300 shadow-[0_0_4px_rgba(251,191,36,0.8)]"
                        : "bg-slate-400"
                      : "bg-slate-700/70"
                  }`}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
