import { useMemo, useState } from "react";
import brancoIcon from "@/assets/branco-icon.png";
import {
  getBrancosTierState,
  type BaseStone,
  type WhiteTierKey,
} from "@/lib/fluxoJon";

export type BrancoStone = BaseStone;

type Tier = {
  key: WhiteTierKey;
  label: string;
  color: string;
};

const TIERS: Tier[] = [
  { key: "100", label: "$ 100", color: "text-emerald-300 border-emerald-400/40" },
  { key: "300", label: "$ 300", color: "text-sky-300 border-sky-400/40" },
  { key: "500", label: "$ 500", color: "text-amber-300 border-amber-400/40" },
  { key: "1000", label: "$ 1000", color: "text-fuchsia-300 border-fuchsia-400/40" },
];

export default function BrancosFluxoJon({
  stones,
  nowMs,
}: {
  stones: BrancoStone[];
  nowMs: number;
}) {
  const [tab, setTab] = useState<WhiteTierKey>("100");
  const tierState = useMemo(
    () => getBrancosTierState(stones, nowMs, tab),
    [stones, nowMs, tab],
  );
  const evaluated = tierState.currentEvaluated;
  const wins = tierState.wins;
  const losses = tierState.losses;

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

      <div className="grid grid-cols-4 gap-1 mb-2">
        {TIERS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md px-1 py-1 text-[10px] font-bold transition border ${
              tab === t.key
                ? "bg-white text-slate-950 border-white"
                : `bg-slate-800 text-slate-300 hover:bg-slate-700 ${t.color}`
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        {evaluated.length === 0 && (
          <div className="text-[11px] text-slate-500 text-center py-3">Sem sinais ainda.</div>
        )}
        {evaluated.map((s) => {
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
              key={s.timeMs}
              className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1 ${bg}`}
            >
              <div className="flex items-center gap-2">
                <div className="h-5 w-5 rounded-md bg-white ring-1 ring-emerald-600 flex items-center justify-center overflow-hidden">
                  <img src={brancoIcon} alt="" className="h-4 w-4 object-contain" />
                </div>
                <span className="font-mono text-[12px] font-bold text-slate-100 tabular-nums">
                  {s.label}
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
