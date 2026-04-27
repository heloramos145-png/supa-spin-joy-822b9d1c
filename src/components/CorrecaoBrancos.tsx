import { useMemo } from "react";
import brancoIcon from "@/assets/branco-icon.png";
import { getBrancosDayState, startOfBrasiliaDayMs, type BaseStone } from "@/lib/fluxoJon";

export type CorrecaoStone = BaseStone;

function fmtHM(ms: number): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

export default function CorrecaoBrancos({
  stones,
  nowMs,
  dayState,
}: {
  stones: CorrecaoStone[];
  nowMs: number;
  dayState?: ReturnType<typeof getBrancosDayState>;
}) {
  const todayStartMs = useMemo(() => startOfBrasiliaDayMs(nowMs || Date.now()), [nowMs]);
  const brancosState = useMemo(
    () => dayState ?? getBrancosDayState(stones, nowMs),
    [dayState, stones, nowMs],
  );

  const whitesToday = useMemo(() => {
    if (!nowMs) return [];
    return stones
      .filter((s) => s.color === 0)
      .filter((s) => new Date(s.created_at).getTime() >= todayStartMs)
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
  }, [stones, nowMs, todayStartMs]);

  type Row = {
    stoneId: string | number;
    whiteMs: number;
    tier: "100" | "300" | "500" | "1000";
    type: "LATADO" | "MARGEM";
  };

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const allSignals = brancosState.allHistory;

    for (const w of whitesToday) {
      const wMs = new Date(w.created_at).getTime();
      let best:
        | { tier: "100" | "300" | "500" | "1000"; type: "LATADO" | "MARGEM" }
        | null = null;

      for (const sig of allSignals) {
        const minStart = sig.timeMs;
        const minEnd = sig.timeMs + 60000;
        const prevStart = sig.timeMs - 60000;
        const nextEnd = sig.timeMs + 120000;

        if (wMs >= prevStart && wMs < nextEnd) {
          const type: "LATADO" | "MARGEM" = wMs >= minStart && wMs < minEnd ? "LATADO" : "MARGEM";
          if (!best || (type === "LATADO" && best.type !== "LATADO")) {
            best = { tier: sig.tier, type };
          }
        }
      }

      if (best) {
        out.push({
          stoneId: w.id,
          whiteMs: wMs,
          tier: best.tier,
          type: best.type,
        });
      }
    }

    return out.sort((a, b) => b.whiteMs - a.whiteMs);
  }, [whitesToday, brancosState.allHistory]);

  return (
    <div className="rounded-md border border-emerald-500/30 bg-slate-900/60 p-2">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <div className="h-5 w-5 rounded-md bg-white ring-1 ring-emerald-600 flex items-center justify-center overflow-hidden">
            <img src={brancoIcon} alt="" className="h-4 w-4 object-contain" />
          </div>
          <div className="text-xs font-bold uppercase tracking-wider text-emerald-300">
            Correção Brancos do Fluxo Jon
          </div>
        </div>
        <div className="text-[10px] text-slate-400 tabular-nums">
          <span className="text-emerald-400">{rows.length}</span> acertos
        </div>
      </div>

      <div className="space-y-1 max-h-[260px] overflow-y-auto pr-1">
        {rows.length === 0 ? (
          <div className="text-[11px] text-slate-500 text-center py-3">
            Nenhum branco bateu hoje ainda.
          </div>
        ) : (
          rows.map((h) => {
            const bg =
              h.type === "LATADO"
                ? "bg-emerald-500/20 border-emerald-400/60"
                : "bg-emerald-500/10 border-emerald-500/40";
            const tagColor =
              h.type === "LATADO" ? "text-emerald-200" : "text-emerald-300";
            return (
              <div
                key={`${h.stoneId}-${h.tier}-${h.type}`}
                className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1 ${bg}`}
              >
                <div className="flex items-center gap-2">
                  <div className="h-5 w-5 rounded-md bg-white ring-1 ring-emerald-600 flex items-center justify-center overflow-hidden">
                    <img src={brancoIcon} alt="" className="h-4 w-4 object-contain" />
                  </div>
                  <span className="font-mono text-[12px] font-bold text-slate-100 tabular-nums">
                    {fmtHM(h.whiteMs)}
                  </span>
                  <span className="text-[9px] font-bold text-slate-400">${h.tier}</span>
                </div>
                <span className={`text-[10px] font-extrabold ${tagColor}`}>WIN {h.type}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
