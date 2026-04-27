import { useEffect, useMemo, useState } from "react";
import brancoIcon from "@/assets/branco-icon.png";

export type FluxoStone = {
  id: string | number;
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

  // Lista FIXA: gerada uma vez, persistida em localStorage. Só regenera
  // quando TODOS os 35 sinais terminaram. Sobrevive a refresh / fechar aba.
  const STORAGE_KEY = "fluxo-cores:signals:v1";
  // IMPORTANTE: começamos com [] e hidratamos do localStorage em useEffect
  // no cliente. Inicializar com leitura do localStorage no useState quebra
  // com SSR (servidor devolve [] e o cliente reusa esse [] do HTML).
  const [signals, setSignals] = useState<Signal[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Hidrata do localStorage uma única vez no cliente
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Signal[];
        if (Array.isArray(parsed) && parsed.length === SIGNALS_COUNT) {
          setSignals(parsed);
        }
      }
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!nowMs || !hydrated) return;
    setSignals((prev) => {
      // Primeira geração (só depois de hidratado, pra não sobrescrever storage)
      if (prev.length === 0) {
        const next = buildSignals(nowMs);
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      }
      // Só regenera se todos os 35 sinais já fecharam (janela máxima = +2min p/ G2)
      const allDone = prev.every((s) => nowMs >= s.timeMs + 120000);
      if (allDone) {
        const next = buildSignals(prev[prev.length - 1].timeMs);
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      }
      return prev;
    });
  }, [nowMs, hydrated]);

  const evaluated = useMemo(
    () =>
      signals.map((s) => ({
        ...s,
        status: evaluate(s, tab, stones, nowMs),
      })),
    [signals, tab, stones, nowMs],
  );

  // ===== Placar acumulado do DIA (por aba) =====
  // Cada vez que um sinal fica "green" ou "red", grava no storage do dia.
  // Placar = soma de todos os sinais resolvidos do dia, mesmo de listas
  // anteriores que já foram regeneradas.
  const SCORE_KEY = "fluxo-cores:score:v2";
  type ScoreEntry = { timeMs: number; tab: Tab; status: "green" | "red" };
  type ScoreStore = { dayKey: string; entries: ScoreEntry[] };

  function brasiliaDayKey(ms: number): string {
    const d = new Date(ms - 3 * 60 * 60 * 1000);
    return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
  }

  const [scoreStore, setScoreStore] = useState<ScoreStore>({ dayKey: "", entries: [] });

  useEffect(() => {
    if (!hydrated) return;
    try {
      const raw = window.localStorage.getItem(SCORE_KEY);
      if (raw) setScoreStore(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated || !nowMs) return;
    const today = brasiliaDayKey(nowMs);
    setScoreStore((prev) => {
      let next = prev;
      // virou o dia → zera
      if (prev.dayKey !== today) {
        next = { dayKey: today, entries: [] };
      }
      let changed = next !== prev;
      const entries = [...next.entries];
      for (const s of evaluated) {
        if (s.status !== "green" && s.status !== "red") continue;
        const existing = entries.find(
          (e) => e.timeMs === s.timeMs && e.tab === tab,
        );
        if (!existing) {
          entries.push({ timeMs: s.timeMs, tab, status: s.status });
          changed = true;
        } else if (existing.status !== s.status) {
          existing.status = s.status;
          changed = true;
        }
      }
      if (!changed) return prev;
      const updated = { dayKey: today, entries };
      try {
        window.localStorage.setItem(SCORE_KEY, JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
  }, [evaluated, hydrated, nowMs, tab]);

  const dayEntries = scoreStore.entries.filter((e) => e.tab === tab);
  const greens = dayEntries.filter((e) => e.status === "green").length;
  const reds = dayEntries.filter((e) => e.status === "red").length;
  const resolved = greens + reds;
  const accuracy = resolved ? Math.round((greens / resolved) * 100) : 0;

  const [copied, setCopied] = useState(false);

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

      {/* Placar do dia (acumulado em todas as listas) */}
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
              <span
                className={`h-2.5 w-2.5 rounded-full ${dotColor}`}
                aria-label={s.status}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
