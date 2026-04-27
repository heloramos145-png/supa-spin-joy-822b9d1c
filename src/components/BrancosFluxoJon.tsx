import { useEffect, useMemo, useState } from "react";
import brancoIcon from "@/assets/branco-icon.png";

const STORAGE_KEY = "brancos-fluxo-jon:signals:v1";

export type BrancoStone = {
  id: string | number;
  roll: number;
  color: number; // 0=branco, 1=verde, 2=preto
  created_at: string;
};

type Tier = {
  key: "100" | "300" | "500" | "1000";
  label: string;
  color: string;
};

const TIERS: Tier[] = [
  { key: "100", label: "$ 100", color: "text-emerald-300 border-emerald-400/40" },
  { key: "300", label: "$ 300", color: "text-sky-300 border-sky-400/40" },
  { key: "500", label: "$ 500", color: "text-amber-300 border-amber-400/40" },
  { key: "1000", label: "$ 1000", color: "text-fuchsia-300 border-fuchsia-400/40" },
];

// ---------- helpers de tempo ----------
function brasiliaDate(ms: number): Date {
  return new Date(ms - 3 * 60 * 60 * 1000);
}
function brasiliaMinute(ms: number): number {
  return brasiliaDate(ms).getUTCMinutes();
}
function brasiliaHour(ms: number): number {
  return brasiliaDate(ms).getUTCHours();
}
function fmtHM(ms: number): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}
// converte um minuto-base (em Brasília, 0-59) para o próximo timestamp UTC ms
// alinhado a esse minuto, depois de "afterMs".
function nextOccurrenceAt(brMinute: number, afterMs: number): number {
  const after = brasiliaDate(afterMs);
  const cand = new Date(
    Date.UTC(
      after.getUTCFullYear(),
      after.getUTCMonth(),
      after.getUTCDate(),
      after.getUTCHours(),
      brMinute,
      0,
      0,
    ),
  );
  let candUtcMs = cand.getTime() + 3 * 60 * 60 * 1000;
  if (candUtcMs <= afterMs) candUtcMs += 60 * 60 * 1000; // próxima hora
  return candUtcMs;
}

// extrai os DÍGITOS do produto (minuto * 14)
function digitsOf(n: number): number[] {
  return String(n).split("").map((d) => Number(d));
}

// gera 3 minutos-alvo a partir dos dígitos do produto, a partir do minuto base.
// Regra: cada candidato tem que estar pelo menos GAP minutos depois do anterior.
// Se ficar muito perto, joga pro próximo ciclo (+10 no minuto).
const GAP_MIN = 5;
function pickThreeMinutes(baseBrMinute: number, digits: number[]): number[] {
  const uniq = Array.from(new Set(digits));
  const picked: number[] = [];
  let cursor = baseBrMinute;
  for (const d of uniq) {
    // próximo minuto > cursor cuja terminação é d
    let m = cursor + 1;
    while (m % 10 !== d) m++;
    // se ficou muito perto do anterior, pula 10 minutos
    while (picked.length > 0 && m - picked[picked.length - 1] < GAP_MIN) m += 10;
    picked.push(m);
    cursor = m;
    if (picked.length === 3) break;
  }
  // se faltou, completa repetindo último dígito
  while (picked.length < 3 && uniq.length > 0) {
    const d = uniq[uniq.length - 1];
    let m = cursor + 1;
    while (m % 10 !== d) m++;
    while (m - picked[picked.length - 1] < GAP_MIN) m += 10;
    picked.push(m);
    cursor = m;
  }
  return picked;
}

type Forecast = {
  tier: Tier["key"];
  baseInfo: string;
  signals: { timeMs: number; label: string }[];
};

type SignalStatus = "pending" | "waiting" | "win-latado" | "win-margem" | "loss";

function evaluateSignal(
  timeMs: number,
  stones: BrancoStone[],
  nowMs: number,
): SignalStatus {
  const minStart = timeMs;
  const minEnd = timeMs + 60000;
  const prevStart = timeMs - 60000;
  const nextEnd = timeMs + 120000;

  // Janela total fecha em +1min após o minuto alvo (margem +1)
  const windowEnd = nextEnd;

  const inMinute = stones.filter((s) => {
    const t = new Date(s.created_at).getTime();
    return t >= minStart && t < minEnd && s.color === 0;
  });
  if (inMinute.length > 0) return "win-latado";

  const inPrev = stones.filter((s) => {
    const t = new Date(s.created_at).getTime();
    return t >= prevStart && t < minStart && s.color === 0;
  });
  const inNext = stones.filter((s) => {
    const t = new Date(s.created_at).getTime();
    return t >= minEnd && t < nextEnd && s.color === 0;
  });
  if (inPrev.length > 0 || inNext.length > 0) return "win-margem";

  if (nowMs >= windowEnd) return "loss";
  if (nowMs < prevStart) return "pending";
  return "waiting";
}

// confluência: conta os dígitos mais frequentes dos produtos
function topDigits(products: number[], take: number): number[] {
  const counts = new Map<number, number>();
  for (const p of products) {
    for (const d of digitsOf(p)) {
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, take)
    .map(([d]) => d);
}

export default function BrancosFluxoJon({
  stones,
  nowMs,
}: {
  stones: BrancoStone[];
  nowMs: number;
}) {
  const [tab, setTab] = useState<Tier["key"]>("100");

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

  const forecast: Forecast | null = useMemo(() => {
    if (!nowMs) return null;

    if (tab === "100") {
      // último branco × 14 → dígitos → 3 minutos
      const last = whites[whites.length - 1];
      if (!last) return { tier: "100", baseInfo: "Aguardando 1º branco", signals: [] };
      const lastMs = new Date(last.created_at).getTime();
      const minute = brasiliaMinute(lastMs);
      const product = minute * 14;
      const minutes = pickThreeMinutes(minute, digitsOf(product));
      const signals = minutes.map((m) => {
        const ms = nextOccurrenceAt(m % 60, lastMs);
        return { timeMs: ms, label: fmtHM(ms) };
      });
      return {
        tier: "100",
        baseInfo: `Branco ${fmtHM(lastMs)} • ${minute}×14=${product}`,
        signals,
      };
    }

    if (tab === "300") {
      // 5 últimos brancos × 14 → confluência → 3 mais fortes
      const last5 = whites.slice(-5);
      if (last5.length < 1)
        return { tier: "300", baseInfo: "Aguardando brancos", signals: [] };
      const products = last5.map((w) => brasiliaMinute(new Date(w.created_at).getTime()) * 14);
      const top = topDigits(products, 3);
      const baseMinute = brasiliaMinute(nowMs);
      const minutes = pickThreeMinutes(baseMinute, top);
      const signals = minutes.map((m) => {
        const ms = nextOccurrenceAt(m % 60, nowMs);
        return { timeMs: ms, label: fmtHM(ms) };
      });
      return {
        tier: "300",
        baseInfo: `5 últimos × 14 → top dígitos ${top.join(", ")}`,
        signals,
      };
    }

    if (tab === "500") {
      // 3 primeiros brancos da hora passada × 14 → confluência → 3 mais fortes
      const prevHour = brasiliaHour(nowMs) - 1;
      const inPrev = whites.filter(
        (w) => brasiliaHour(new Date(w.created_at).getTime()) === ((prevHour + 24) % 24),
      );
      const first3 = inPrev.slice(0, 3);
      if (first3.length === 0)
        return { tier: "500", baseInfo: "Sem brancos na hora anterior", signals: [] };
      const products = first3.map((w) => brasiliaMinute(new Date(w.created_at).getTime()) * 14);
      const top = topDigits(products, 3);
      const baseMinute = brasiliaMinute(nowMs);
      const minutes = pickThreeMinutes(baseMinute, top);
      const signals = minutes.map((m) => {
        const ms = nextOccurrenceAt(m % 60, nowMs);
        return { timeMs: ms, label: fmtHM(ms) };
      });
      return {
        tier: "500",
        baseInfo: `3 primeiros hora passada × 14 → ${top.join(", ")}`,
        signals,
      };
    }

    // 1000
    const prevHour = brasiliaHour(nowMs) - 1;
    const inPrev = whites.filter(
      (w) => brasiliaHour(new Date(w.created_at).getTime()) === ((prevHour + 24) % 24),
    );
    if (inPrev.length === 0)
      return { tier: "1000", baseInfo: "Sem brancos na hora anterior", signals: [] };
    const products = inPrev.map((w) => brasiliaMinute(new Date(w.created_at).getTime()) * 14);
    const top = topDigits(products, 3);
    const baseMinute = brasiliaMinute(nowMs);
    const minutes = pickThreeMinutes(baseMinute, top);
    const signals = minutes.map((m) => {
      const ms = nextOccurrenceAt(m % 60, nowMs);
      return { timeMs: ms, label: fmtHM(ms) };
    });
    return {
      tier: "1000",
      baseInfo: `Todos da hora passada (${inPrev.length}) × 14 → ${top.join(", ")}`,
      signals,
    };
  }, [tab, whites, nowMs]);

  const evaluated = useMemo(
    () =>
      (forecast?.signals ?? []).map((s) => ({
        ...s,
        status: evaluateSignal(s.timeMs, stones, nowMs),
      })),
    [forecast, stones, nowMs],
  );

  const wins = evaluated.filter((s) => s.status === "win-latado" || s.status === "win-margem").length;
  const losses = evaluated.filter((s) => s.status === "loss").length;

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

      {/* baseInfo da estratégia oculto a pedido do usuário */}

      <div className="space-y-1">
        {evaluated.length === 0 && (
          <div className="text-[11px] text-slate-500 text-center py-3">
            Sem sinais ainda.
          </div>
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
              <span className={`text-[10px] font-extrabold ${tagColor}`}>
                {tag}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
