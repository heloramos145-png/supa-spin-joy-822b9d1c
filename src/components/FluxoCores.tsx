import { useEffect, useMemo, useState } from "react";
import brancoIcon from "@/assets/branco-icon.png";

export type FluxoStone = {
  id: number;
  roll: number;
  color: number; // 0=branco, 1=verde, 2=preto
  created_at: string;
};

type Tab = "SG" | "G1" | "G2";

// Intervalos cíclicos (em minutos) que somam pra formar a lista
const INTERVALS = [2, 4, 6, 8, 10, 12, 7, 9];
const SIGNALS_COUNT = 35;

// Cor prevista pelo dígito do minuto:
// 1-7 → verde, 8-14 → preto, resto (0, 15-59) → também segue o ciclo via mod 14
function predictColor(minute: number): 1 | 2 {
  // Mapeia minuto absoluto pra ciclo 1-14: usamos minute % 14, com 0 → 14
  const m = minute % 14 === 0 ? 14 : minute % 14;
  return m <= 7 ? 1 : 2;
}

type Signal = {
  timeMs: number; // início do minuto alvo (UTC ms)
  label: string; // HH:MM Brasília
  predicted: 1 | 2; // verde ou preto
};

function fmtHM(ms: number): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

function brasiliaMinute(ms: number): number {
  // Minuto Brasília (UTC-3)
  const b = new Date(ms - 3 * 60 * 60 * 1000);
  return b.getUTCMinutes();
}

function buildSignals(startMs: number): Signal[] {
  const signals: Signal[] = [];
  // alinha startMs no início do minuto
  let cursor = Math.floor(startMs / 60000) * 60000;
  for (let i = 0; i < SIGNALS_COUNT; i++) {
    const step = INTERVALS[i % INTERVALS.length];
    cursor = cursor + step * 60000;
    const min = brasiliaMinute(cursor);
    signals.push({
      timeMs: cursor,
      label: fmtHM(cursor),
      predicted: predictColor(min),
    });
  }
  return signals;
}

type SignalResult = "pending" | "green" | "red" | "waiting";

function evaluate(
  sig: Signal,
  tab: Tab,
  stones: FluxoStone[],
  nowMs: number,
): SignalResult {
  // Pedras alvo conforme aba
  const minStart = sig.timeMs;
  const minEnd = sig.timeMs + 60000;
  const nextEnd = sig.timeMs + 120000;

  const inMinute = stones
    .filter((s) => {
      const t = new Date(s.created_at).getTime();
      return t >= minStart && t < minEnd;
    })
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  const inNext = stones
    .filter((s) => {
      const t = new Date(s.created_at).getTime();
      return t >= minEnd && t < nextEnd;
    })
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

  // Acerto = veio verde (1) OU branco (0). Erro = preto (2).
  const isHit = (c: number) => c === 0 || c === sig.predicted;

  const targets: FluxoStone[] = [];
  if (tab === "SG") {
    if (inMinute[0]) targets.push(inMinute[0]);
  } else if (tab === "G1") {
    if (inMinute[0]) targets.push(inMinute[0]);
    if (inMinute[1]) targets.push(inMinute[1]);
  } else {
    if (inMinute[0]) targets.push(inMinute[0]);
    if (inMinute[1]) targets.push(inMinute[1]);
    if (inNext[0]) targets.push(inNext[0]);
  }

  // Quantas pedras precisamos pra fechar o sinal?
  const needed = tab === "SG" ? 1 : tab === "G1" ? 2 : 3;
  const windowEnd = tab === "G2" ? nextEnd : minEnd;

  // Se já tem alguma pedra de acerto, é GREEN
  if (targets.some((s) => isHit(s.color))) return "green";

  // Janela já fechou e ninguém acertou → RED
  if (nowMs >= windowEnd && targets.length >= needed) return "red";
  if (nowMs >= windowEnd) {
    // janela fechou, talvez sem pedras suficientes (pulou rodada) → considera red
    return "red";
  }

  // Sinal ainda no futuro
  if (nowMs < minStart) return "pending";
  // Sinal acontecendo agora
  return "waiting";
}

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
  const [tab, setTab] = useState<Tab>("SG");

  // Lista começa a partir do "agora" (Brasília). Quando completa 35 (todos
  // resolvidos green/red), gera a próxima lista a partir do último sinal.
  const signals = useMemo(() => {
    if (!nowMs) return [];
    let baseList = buildSignals(nowMs);
    // Se todos os sinais já passaram, regenera começando do último
    const allResolved = baseList.every((s) => nowMs >= s.timeMs + 120000);
    if (allResolved && baseList.length) {
      baseList = buildSignals(baseList[baseList.length - 1].timeMs);
    }
    return baseList;
  }, [nowMs]);

  const evaluated = useMemo(
    () =>
      signals.map((s) => ({
        ...s,
        status: evaluate(s, tab, stones, nowMs),
      })),
    [signals, tab, stones, nowMs],
  );

  const greens = evaluated.filter((s) => s.status === "green").length;
  const reds = evaluated.filter((s) => s.status === "red").length;
  const resolved = greens + reds;
  const accuracy = resolved ? Math.round((greens / resolved) * 100) : 0;

  return (
    <div className="rounded-md border border-emerald-500/30 bg-slate-900/60 p-2">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-xs font-bold uppercase tracking-wider text-emerald-300">
          Fluxo Jon Cores
        </div>
        <div className="text-[10px] text-slate-400 tabular-nums">
          ✅ {greens} ❌ {reds} • {accuracy}%
        </div>
      </div>

      <div className="flex gap-1 mb-2">
        {(["SG", "G1", "G2"] as Tab[]).map((t) => (
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
          const mark =
            s.status === "green"
              ? "✅"
              : s.status === "red"
                ? "❌"
                : s.status === "waiting"
                  ? "⏳"
                  : "";
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
              <span className="text-xs w-5 text-right">{mark}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
