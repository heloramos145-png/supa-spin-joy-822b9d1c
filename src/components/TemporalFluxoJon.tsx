import { useMemo } from "react";
import { Waves, Hourglass, Flame } from "lucide-react";

export type TemporalStone = {
  id: string | number;
  roll: number;
  color: number; // 0=branco, 1=verde, 2=preto
  created_at: string;
};

type Surf = {
  color: 1 | 2;
  count: number;
  startMs: number;
  endMs: number;
};

const MIN_SURF = 3; // sequência ≥ 3 pedras = surf

function buildSurfs(stones: TemporalStone[]): Surf[] {
  const sorted = [...stones].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const surfs: Surf[] = [];
  let i = 0;
  while (i < sorted.length) {
    const c = sorted[i].color;
    if (c === 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < sorted.length && sorted[j].color === c) j++;
    const len = j - i;
    if (len >= MIN_SURF) {
      surfs.push({
        color: c as 1 | 2,
        count: len,
        startMs: new Date(sorted[i].created_at).getTime(),
        endMs: new Date(sorted[j - 1].created_at).getTime(),
      });
    }
    i = j;
  }
  return surfs;
}

function fmtHM(ms: number): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

export default function TemporalFluxoJon({
  stones,
  nowMs,
}: {
  stones: TemporalStone[];
  nowMs: number;
}) {
  const surfs = useMemo(() => buildSurfs(stones), [stones]);

  const greenSurfs = surfs.filter((s) => s.color === 1);
  const blackSurfs = surfs.filter((s) => s.color === 2);
  const totalSurfedStones = surfs.reduce((acc, s) => acc + s.count, 0);

  // últimas 5 surfs (mais recentes primeiro)
  const lastSurfs = [...surfs].reverse().slice(0, 5);

  // REC de branco: gap atual desde o último branco vs gap médio
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
      return { isRec: false, gapsSince: 0, avgGap: 0, lastWhiteMs: 0 };
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

    // pedras desde o último branco
    const stonesSince = stones.filter(
      (s) => new Date(s.created_at).getTime() > lastWhiteMs,
    ).length;

    // está em REC se já passou ≥ 1.2× o gap médio sem branco
    const isRec = sinceMs >= avg * 1.2;

    return {
      isRec,
      gapsSince: stonesSince,
      avgGap: Math.round(avg / 60000), // em minutos
      lastWhiteMs,
      sinceMin: Math.floor(sinceMs / 60000),
    };
  }, [whites, stones, nowMs]);

  return (
    <div className="rounded-md border border-cyan-500/30 bg-slate-900/60 p-3">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5">
          <Waves className="h-4 w-4 text-cyan-300" />
          <div className="text-xs font-bold uppercase tracking-wider text-cyan-300">
            Temporal do Fluxo Jon
          </div>
        </div>
        <div className="text-[10px] text-slate-400">
          surf ≥ {MIN_SURF} pedras
        </div>
      </div>

      {/* Stats principais */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="rounded-md bg-emerald-500/10 border border-emerald-500/30 px-2 py-1.5 text-center">
          <div className="text-[9px] uppercase font-bold text-emerald-300">
            Surf Verde
          </div>
          <div className="font-mono text-lg font-extrabold text-emerald-200 tabular-nums leading-tight">
            {greenSurfs.length}
          </div>
          <div className="text-[9px] text-emerald-400/80">
            {greenSurfs.reduce((a, s) => a + s.count, 0)} pedras
          </div>
        </div>
        <div className="rounded-md bg-slate-800/60 border border-slate-700 px-2 py-1.5 text-center">
          <div className="text-[9px] uppercase font-bold text-slate-300">
            Surf Preto
          </div>
          <div className="font-mono text-lg font-extrabold text-slate-100 tabular-nums leading-tight">
            {blackSurfs.length}
          </div>
          <div className="text-[9px] text-slate-400">
            {blackSurfs.reduce((a, s) => a + s.count, 0)} pedras
          </div>
        </div>
        <div className="rounded-md bg-cyan-500/10 border border-cyan-500/30 px-2 py-1.5 text-center">
          <div className="text-[9px] uppercase font-bold text-cyan-300">
            Total
          </div>
          <div className="font-mono text-lg font-extrabold text-cyan-200 tabular-nums leading-tight">
            {surfs.length}
          </div>
          <div className="text-[9px] text-cyan-400/80">
            {totalSurfedStones} pedras
          </div>
        </div>
      </div>

      {/* Indicador REC de branco com bonequinho surfista */}
      <div
        className={`flex items-center gap-3 rounded-md border px-3 py-2 mb-3 ${
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
              {recInfo.isRec ? "REC DE BRANCO ATIVO" : "Sem REC de branco"}
            </span>
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {whites.length < 2
              ? "Aguardando histórico…"
              : `${recInfo.gapsSince} pedras sem branco • média ${recInfo.avgGap}min`}
          </div>
        </div>
      </div>

      {/* Últimas surfs */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
          Últimas surfs
        </div>
        {lastSurfs.length === 0 ? (
          <div className="text-[11px] text-slate-500 text-center py-2">
            Nenhuma surf registrada hoje.
          </div>
        ) : (
          <div className="space-y-1">
            {lastSurfs.map((s, idx) => {
              const bg =
                s.color === 1
                  ? "bg-emerald-500/15 border-emerald-500/40"
                  : "bg-slate-800/60 border-slate-700";
              const dot =
                s.color === 1
                  ? "bg-[#7cfa60] ring-[#3aa334]"
                  : "bg-[#1f1f1f] ring-[#3a3a3a]";
              const label = s.color === 1 ? "VERDE" : "PRETO";
              return (
                <div
                  key={`${s.startMs}-${idx}`}
                  className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1 ${bg}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-4 w-4 rounded-md ring-1 ${dot}`} />
                    <span className="font-mono text-[11px] font-bold text-slate-100 tabular-nums">
                      {fmtHM(s.startMs)}–{fmtHM(s.endMs)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-slate-300">
                      {label}
                    </span>
                    <span className="font-mono text-[12px] font-extrabold text-slate-100 tabular-nums">
                      ×{s.count}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
