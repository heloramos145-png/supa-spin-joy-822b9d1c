import { useMemo } from "react";
import { Hourglass, Flame } from "lucide-react";

export type TemporalStone = {
  id: string | number;
  roll: number;
  color: number; // 0=branco, 1=verde, 2=preto
  created_at: string;
};

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

  const recInfo = useMemo(() => {
    if (whites.length < 2 || !nowMs) {
      return { isRec: false, stonesSince: 0, avgGap: 0, sinceMin: 0 };
    }
    const gaps: number[] = [];
    for (let i = 1; i < whites.length; i++) {
      gaps.push(
        new Date(whites[i].created_at).getTime() -
          new Date(whites[i - 1].created_at).getTime(),
      );
    }
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const lastWhite = whites[whites.length - 1];
    const lastWhiteMs = new Date(lastWhite.created_at).getTime();
    const sinceMs = nowMs - lastWhiteMs;
    const stonesSince = stones.filter(
      (s) => new Date(s.created_at).getTime() > lastWhiteMs,
    ).length;
    return {
      isRec: sinceMs >= avg * 1.2,
      stonesSince,
      avgGap: Math.round(avg / 60000),
      sinceMin: Math.floor(sinceMs / 60000),
    };
  }, [whites, stones, nowMs]);

  return (
    <div
      className={`flex items-center gap-3 rounded-md border px-3 py-2 ${
        recInfo.isRec
          ? "bg-amber-400/10 border-amber-400/40"
          : "bg-slate-800/40 border-slate-700"
      }`}
    >
      <div className="text-3xl leading-none" aria-hidden>
        {recInfo.isRec ? "🏄‍♂️" : "🧍‍♂️"}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-1.5">
          {recInfo.isRec ? (
            <Flame className="h-3.5 w-3.5 text-amber-300" />
          ) : (
            <Hourglass className="h-3.5 w-3.5 text-slate-400" />
          )}
          <span
            className={`text-[11px] font-extrabold uppercase tracking-wider ${
              recInfo.isRec ? "text-amber-300" : "text-slate-300"
            }`}
          >
            Temporal do Fluxo Jon —{" "}
            {recInfo.isRec ? "EM REC DE BRANCO" : "Sem REC de branco"}
          </span>
        </div>
        <div className="text-[10px] text-slate-400 mt-0.5">
          {whites.length < 2
            ? "Aguardando histórico…"
            : `${recInfo.stonesSince} pedras sem branco • ${recInfo.sinceMin}min`}
        </div>
      </div>
    </div>
  );
}
