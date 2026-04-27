import { useMemo, useState } from "react";
import brancoIcon from "@/assets/branco-icon.png";
import {
  getFluxoCoresTabState,
  type BaseStone,
  type FluxoTab,
} from "@/lib/fluxoJon";

export type FluxoStone = BaseStone;

function StoneIcon({ color }: { color: 0 | 1 | 2 }) {
  if (color === 0) {
    return (
      <div className="h-5 w-5 rounded-md bg-white ring-1 ring-emerald-600 flex items-center justify-center overflow-hidden">
        <img src={brancoIcon} alt="" className="h-4 w-4 object-contain" />
      </div>
    );
  }
  if (color === 1) {
    return <div className="h-5 w-5 rounded-md bg-[#7cfa60] ring-1 ring-[#3aa334]" />;
  }
  return <div className="h-5 w-5 rounded-md bg-[#1f1f1f] ring-1 ring-[#3a3a3a]" />;
}

export default function FluxoCores({
  stones,
  nowMs,
}: {
  stones: FluxoStone[];
  nowMs: number;
}) {
  const [tab, setTab] = useState<FluxoTab>("SG");
  const [copied, setCopied] = useState(false);

  const tabState = useMemo(
    () => getFluxoCoresTabState(stones, nowMs, tab),
    [stones, nowMs, tab],
  );
  const evaluated = tabState.currentEvaluated;
  const greens = useMemo(
    () => evaluated.filter((signal) => signal.status === "green").length,
    [evaluated],
  );
  const reds = useMemo(
    () => evaluated.filter((signal) => signal.status === "red").length,
    [evaluated],
  );
  const accuracy = useMemo(() => {
    const resolved = greens + reds;
    return resolved ? Math.round((greens / resolved) * 100) : 0;
  }, [greens, reds]);

  function handleCopy() {
    const header = `Fluxo Jon Cores — ${tab}`;
    const lines = evaluated.map((s) => {
      const cor = s.predicted === 1 ? "VERDE" : "PRETO";
      return `${s.label} → ${cor} ou BRANCO`;
    });
    const text = [header, ...lines].join("\n");
    try {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="rounded-md border border-emerald-500/30 bg-slate-900/60 p-2">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-xs font-bold uppercase tracking-wider text-emerald-300">
          Fluxo Jon Cores
        </div>
        <button
          onClick={handleCopy}
          className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-200 hover:bg-slate-700 transition"
        >
          {copied ? "Copiado!" : "Copiar lista"}
        </button>
      </div>

      <div className="mb-2 grid grid-cols-3 gap-1.5">
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2 py-1.5 text-center">
          <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-300">Wins</div>
          <div className="text-lg font-extrabold tabular-nums text-emerald-300 leading-none">{greens}</div>
        </div>
        <div className="rounded-md border border-rose-500/40 bg-rose-500/15 px-2 py-1.5 text-center">
          <div className="text-[9px] font-bold uppercase tracking-wider text-rose-300">Loss</div>
          <div className="text-lg font-extrabold tabular-nums text-rose-300 leading-none">{reds}</div>
        </div>
        <div className="rounded-md border border-sky-500/40 bg-sky-500/15 px-2 py-1.5 text-center">
          <div className="text-[9px] font-bold uppercase tracking-wider text-sky-300">Acerto</div>
          <div className="text-lg font-extrabold tabular-nums text-sky-300 leading-none">{accuracy}%</div>
        </div>
      </div>

      <div className="flex gap-1 mb-2">
        {(["SG", "G1", "G2"] as FluxoTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md px-2 py-1 text-[11px] font-bold transition ${
              tab === t
                ? "bg-emerald-500 text-slate-950"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="max-h-[420px] overflow-y-auto space-y-1 pr-1">
        {evaluated.map((s) => {
          const bg =
            s.status === "green"
              ? "bg-emerald-500/15 border-emerald-500/40"
              : s.status === "red"
                ? "bg-rose-500/15 border-rose-500/40"
                : s.status === "waiting"
                  ? "bg-amber-400/15 border-amber-400/40 animate-pulse"
                  : "bg-slate-800/40 border-slate-700/40";
          const dotColor =
            s.status === "green"
              ? "bg-emerald-400"
              : s.status === "red"
                ? "bg-rose-400"
                : s.status === "waiting"
                  ? "bg-amber-300"
                  : "bg-slate-600";
          return (
            <div
              key={s.timeMs}
              className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1 ${bg}`}
            >
              <span className="font-mono text-[12px] font-bold text-slate-100 tabular-nums">
                {s.label}
              </span>
              <div className="flex items-center gap-1">
                <StoneIcon color={s.predicted} />
                <StoneIcon color={0} />
              </div>
              <span className={`h-2.5 w-2.5 rounded-full ${dotColor}`} aria-label={s.status} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
