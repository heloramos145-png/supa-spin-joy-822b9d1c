import { useMemo } from "react";
import brancoIcon from "@/assets/branco-icon.png";
import {
  getBrancosDayState,
  type BaseStone,
  type WhiteTierKey,
  type WhiteSignalStatus,
} from "@/lib/fluxoJon";

export type BrancoStone = BaseStone;

const TIER_ORDER: WhiteTierKey[] = ["100", "300", "500", "1000"];
const TIER_BADGE: Record<WhiteTierKey, string> = {
  "100": "text-emerald-300 border-emerald-400/40 bg-emerald-500/10",
  "300": "text-sky-300 border-sky-400/40 bg-sky-500/10",
  "500": "text-amber-300 border-amber-400/40 bg-amber-500/10",
  "1000": "text-fuchsia-300 border-fuchsia-400/40 bg-fuchsia-500/10",
};

type Row = {
  key: string;
  timeMs: number;
  label: string;
  tier: WhiteTierKey;
  status: WhiteSignalStatus;
};

export default function BrancosFluxoJon({
  stones,
  nowMs,
  dayState,
}: {
  stones: BrancoStone[];
  nowMs: number;
  dayState?: ReturnType<typeof getBrancosDayState>;
}) {
  const state = useMemo(
    () => dayState ?? getBrancosDayState(stones, nowMs),
    [dayState, stones, nowMs],
  );

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const tier of TIER_ORDER) {
      for (const sig of state.byTier[tier].currentEvaluated) {
        out.push({
          key: `${tier}-${sig.timeMs}`,
          timeMs: sig.timeMs,
          label: sig.label,
          tier,
          status: sig.status,
        });
      }
    }
    // mais recente primeiro
    return out.sort((a, b) => b.timeMs - a.timeMs);
  }, [state]);

  const wins = useMemo(
    () =>
      TIER_ORDER.reduce((acc, t) => acc + state.byTier[t].wins, 0),
    [state],
  );
  const losses = useMemo(
    () =>
      TIER_ORDER.reduce((acc, t) => acc + state.byTier[t].losses, 0),
    [state],
  );

  return (
    <div className="rounded-md border border-white/30 bg-slate-900/60 p-2">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <div className="h-5 w-5 rounded-md bg-white ring-1 ring-emerald-600 flex items-center justify-center overflow-hidden">
            <img src={brancoIcon} alt="" className="h-4 w-4 object-contain" />
          </div>
          <div className="text-xs font-bold uppercase tracking-wider text-white">
            Brancos do Fluxo Jon
          </div>
        </div>
        <div className="text-[10px] text-slate-400 tabular-nums">
          <span className="text-emerald-400">{wins}</span>
          {" / "}
          <span className="text-rose-400">{losses}</span>
        </div>
      </div>

      <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
        {rows.length === 0 && (
          <div className="text-[11px] text-slate-500 text-center py-3">Sem sinais ainda.</div>
        )}
        {rows.map((s) => {
          const bg =
            s.status === "win-latado"
              ? "bg-emerald-500/20 border-emerald-400/60"
              : s.status === "win-margem"
                ? "bg-emerald-500/10 border-emerald-500/40"
                : s.status === "loss"
                  ? "bg-rose-500/15 border-rose-500/40"
                  : s.status === "waiting"
                    ? "bg-amber-400/15 border-amber-400/40 animate-pulse"
                    : "bg-slate-800/40 border-slate-700/40";
          const tag =
            s.status === "win-latado"
              ? "WIN LATADO"
              : s.status === "win-margem"
                ? "WIN MARGEM"
                : s.status === "loss"
                  ? "LOSS"
                  : s.status === "waiting"
                    ? "•••"
                    : "";
          const tagColor =
            s.status === "win-latado"
              ? "text-emerald-200"
              : s.status === "win-margem"
                ? "text-emerald-300"
                : s.status === "loss"
                  ? "text-rose-300"
                  : "text-amber-300";
          return (
            <div
              key={s.key}
              className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1 ${bg}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-5 w-5 rounded-md bg-white ring-1 ring-emerald-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                  <img src={brancoIcon} alt="" className="h-4 w-4 object-contain" />
                </div>
                <span className="font-mono text-[12px] font-bold text-slate-100 tabular-nums">
                  {s.label}
                </span>
                <span
                  className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded border ${TIER_BADGE[s.tier]}`}
                >
                  ${s.tier}
                </span>
              </div>
              <span className={`text-[10px] font-extrabold ${tagColor}`}>{tag}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
