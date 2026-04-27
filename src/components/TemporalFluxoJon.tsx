import { useMemo } from "react";
import { Activity, Target, AlertTriangle, CheckCircle2 } from "lucide-react";
import Slot from "@/components/Slot";
import { evaluateWhiteSignal, getBrancosDayState, type BaseStone } from "@/lib/fluxoJon";

export type TemporalStone = BaseStone;

export default function TemporalFluxoJon({
  stones,
  nowMs,
  brancosDayState,
}: {
  stones: TemporalStone[];
  nowMs: number;
  brancosDayState?: ReturnType<typeof getBrancosDayState>;
}) {
  const whites = useMemo(
    () =>
      stones
        .filter((s) => s.color === 0)
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        ),
    [stones],
  );

  const brancosState = useMemo(
    () => brancosDayState ?? getBrancosDayState(stones, nowMs),
    [brancosDayState, stones, nowMs],
  );
  const storedSignals = brancosState.allHistory;

  const recInfo = useMemo(() => {
    const whitesMs = whites.map((w) => new Date(w.created_at).getTime());
    const lastWhiteMs = whitesMs.length ? whitesMs[whitesMs.length - 1] : 0;
    const stonesSince = lastWhiteMs
      ? stones.filter((s) => new Date(s.created_at).getTime() > lastWhiteMs).length
      : stones.length;
    const sinceMin = lastWhiteMs && nowMs ? Math.floor((nowMs - lastWhiteMs) / 60000) : 0;

    const evaluated = storedSignals
      .map((s) => ({ ...s, status: evaluateWhiteSignal(s.timeMs, stones, nowMs) }))
      .filter((s) => s.status === "loss" || s.status === "win-latado" || s.status === "win-margem");

    let lossStreak = 0;
    for (let i = evaluated.length - 1; i >= 0; i--) {
      if (evaluated[i].status === "loss") lossStreak++;
      else break;
    }

    const recBy25 = stonesSince >= 25;
    const recByLoss = lossStreak >= 3;
    const isRec = recBy25 || recByLoss;

    return { isRec, recBy25, recByLoss, stonesSince, sinceMin, lossStreak };
  }, [whites, stones, nowMs, storedSignals]);

  const reasonText = recInfo.recByLoss
    ? `${recInfo.lossStreak} sinais seguidos perdidos`
    : `${recInfo.stonesSince} pedras sem branco`;

  const pullers = useMemo(() => {
    const ordered = [...stones].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    type Agg = { total: number; counts: [number, number, number] };
    const map = new Map<number, Agg>();
    for (let i = 0; i < ordered.length - 1; i++) {
      const cur = ordered[i];
      const next = ordered[i + 1];
      if (cur.roll == null || cur.roll < 0 || cur.roll > 14) continue;
      const agg = map.get(cur.roll) ?? { total: 0, counts: [0, 0, 0] };
      agg.total += 1;
      const c = next.color === 0 ? 0 : next.color === 1 ? 1 : 2;
      agg.counts[c] += 1;
      map.set(cur.roll, agg);
    }
    const out: { roll: number; topColor: 0 | 1 | 2 | null; pct: number; total: number }[] = [];
    for (let n = 0; n <= 14; n++) {
      const agg = map.get(n);
      if (!agg || agg.total === 0) {
        out.push({ roll: n, topColor: null, pct: 0, total: 0 });
        continue;
      }
      let topIdx: 0 | 1 | 2 = 0;
      let topVal = -1;
      (agg.counts as number[]).forEach((v, i) => {
        if (v > topVal) {
          topVal = v;
          topIdx = i as 0 | 1 | 2;
        }
      });
      out.push({ roll: n, topColor: topIdx, pct: Math.round((topVal / agg.total) * 100), total: agg.total });
    }
    return out;
  }, [stones]);

  const colorDot = (c: 0 | 1 | 2 | null) => {
    if (c === null) return <div className="h-3 w-3 rounded-full bg-slate-700/70" />;
    if (c === 0) return <div className="h-3 w-3 rounded-full bg-white ring-1 ring-emerald-500" />;
    if (c === 1) return <div className="h-3 w-3 rounded-full bg-emerald-400" />;
    return <div className="h-3 w-3 rounded-full bg-slate-900 ring-1 ring-slate-500" />;
  };

  return (
    <div className="space-y-2">
      <div
        className={`relative overflow-hidden rounded-xl border px-4 py-3 transition-all ${
          recInfo.isRec
            ? "border-rose-500/50 bg-gradient-to-r from-rose-950/60 via-slate-900/70 to-rose-950/60 shadow-[0_0_18px_-8px_rgba(244,63,94,0.55)]"
            : "border-emerald-700/40 bg-gradient-to-r from-slate-900/70 via-slate-800/60 to-slate-900/70"
        }`}
      >
        <div className="relative flex items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${
              recInfo.isRec
                ? "border-rose-400/60 bg-rose-500/15 text-rose-300"
                : "border-emerald-400/60 bg-emerald-500/15 text-emerald-300"
            }`}
          >
            <Activity className="h-5 w-5" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[11px] font-extrabold uppercase tracking-[0.18em] ${recInfo.isRec ? "text-rose-200" : "text-slate-200"}`}>
                Temporal do Fluxo Jon
              </span>
              {recInfo.isRec && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/60 bg-rose-500/20 px-2 py-[1px] text-[9px] font-black uppercase tracking-wider text-rose-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-300 animate-pulse" />
                  REC
                </span>
              )}
              {whites.length >= 1 && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[9px] font-black uppercase tracking-wider border ${
                    recInfo.isRec
                      ? "border-rose-400/60 bg-rose-500/20 text-rose-200 animate-pulse"
                      : "border-emerald-400/60 bg-emerald-500/20 text-emerald-200"
                  }`}
                >
                  {recInfo.isRec ? (
                    <>
                      <AlertTriangle className="h-2.5 w-2.5" /> NÃO ENTRAR
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-2.5 w-2.5" /> BOM PRA ENTRAR
                    </>
                  )}
                </span>
              )}
            </div>
            <div className={`mt-1 text-[11px] font-medium ${recInfo.isRec ? "text-rose-100/90" : "text-slate-400"}`}>
              {whites.length < 1 ? "Aguardando histórico…" : `${reasonText} • há ${recInfo.sinceMin}min`}
            </div>
          </div>

          <div className="hidden sm:flex flex-col items-end gap-0.5">
            <div className="text-[9px] uppercase tracking-wider text-slate-400">Intensidade</div>
            <div className="flex gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => {
                const level = Math.min(5, Math.max(Math.floor(recInfo.stonesSince / 6), recInfo.lossStreak));
                const on = i < level;
                return (
                  <div
                    key={i}
                    className={`h-3 w-1.5 rounded-sm ${
                      on ? (recInfo.isRec ? "bg-rose-400" : "bg-emerald-400") : "bg-slate-700/70"
                    }`}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700/70 bg-slate-900/60 px-3 py-2">
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <Target className="h-3.5 w-3.5 text-cyan-300" />
          <span className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-cyan-200">
            Pedras Puxadoras com 1 Tiro
          </span>
          <span className="text-[9px] text-slate-400 ml-auto">cor mais puxada após cada pedra • % do dia</span>
        </div>
        <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-[repeat(15,minmax(0,1fr))] gap-1.5">
          {pullers.map((p) => (
            <div
              key={p.roll}
              className="flex flex-col items-center gap-1 rounded-md border border-slate-700/60 bg-slate-800/50 p-1.5"
              title={`Pedra ${p.roll}: ${p.total} ocorrências`}
            >
              <Slot number={p.roll} color={p.roll === 0 ? "white" : p.roll <= 7 ? "green" : "black"} size="sm" />
              <div className="flex items-center gap-1">
                {colorDot(p.topColor)}
                <span
                  className={`text-[10px] font-bold ${
                    p.topColor === null
                      ? "text-slate-500"
                      : p.pct >= 60
                        ? "text-emerald-300"
                        : p.pct >= 45
                          ? "text-amber-300"
                          : "text-slate-300"
                  }`}
                >
                  {p.total === 0 ? "—" : `${p.pct}%`}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
