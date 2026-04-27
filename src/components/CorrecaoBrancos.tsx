import { useMemo } from "react";
import brancoIcon from "@/assets/branco-icon.png";

export type CorrecaoStone = {
  id: string | number;
  roll: number;
  color: number;
  created_at: string;
};

function fmtHM(ms: number): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

// Lê os sinais salvos pelo BrancosFluxoJon (todas as 4 abas) e cruza com os
// brancos do dia. Para cada branco que caiu dentro de uma janela [-1min, +1min]
// de algum sinal, mostra: ícone branco + minuto que bateu + LATADO / MARGEM.
type StoredSignals = Record<
  "100" | "300" | "500" | "1000",
  { timeMs: number; label: string }[]
>;

const STORAGE_KEY = "brancos-fluxo-jon:signals:v1";

function readSignals(): StoredSignals {
  if (typeof window === "undefined")
    return { "100": [], "300": [], "500": [], "1000": [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { "100": [], "300": [], "500": [], "1000": [] };
    const parsed = JSON.parse(raw) as StoredSignals;
    return {
      "100": parsed["100"] ?? [],
      "300": parsed["300"] ?? [],
      "500": parsed["500"] ?? [],
      "1000": parsed["1000"] ?? [],
    };
  } catch {
    return { "100": [], "300": [], "500": [], "1000": [] };
  }
}

// Histórico permanente de sinais já enviados, pra cruzar mesmo depois que
// a lista é regenerada.
const HISTORY_KEY = "brancos-fluxo-jon:history:v1";

type HistoryEntry = {
  tier: "100" | "300" | "500" | "1000";
  timeMs: number;
};

function readHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HistoryEntry[];
  } catch {
    return [];
  }
}

function writeHistory(entries: HistoryEntry[]) {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch {
    // ignore
  }
}

export default function CorrecaoBrancos({
  stones,
  nowMs,
}: {
  stones: CorrecaoStone[];
  nowMs: number;
}) {
  // Sinais ativos + histórico → unifica (dedup por tier+timeMs)
  const allSignals = useMemo(() => {
    const active = readSignals();
    const history = readHistory();
    const merged: HistoryEntry[] = [...history];
    (Object.keys(active) as (keyof StoredSignals)[]).forEach((tier) => {
      for (const s of active[tier]) {
        if (!merged.some((h) => h.tier === tier && h.timeMs === s.timeMs)) {
          merged.push({ tier, timeMs: s.timeMs });
        }
      }
    });
    // mantém só do dia atual em Brasília
    const todayStartMs = (() => {
      const d = new Date((nowMs || Date.now()) - 3 * 60 * 60 * 1000);
      const start = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 3, 0, 0),
      );
      return start.getTime();
    })();
    const filtered = merged.filter((h) => h.timeMs >= todayStartMs);
    writeHistory(filtered);
    return filtered;
  }, [nowMs]);

  // Brancos do dia
  const whitesToday = useMemo(() => {
    if (!nowMs) return [];
    const todayStartMs = (() => {
      const d = new Date(nowMs - 3 * 60 * 60 * 1000);
      const start = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 3, 0, 0),
      );
      return start.getTime();
    })();
    return stones
      .filter((s) => s.color === 0)
      .filter((s) => new Date(s.created_at).getTime() >= todayStartMs)
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() -
          new Date(b.created_at).getTime(),
      );
  }, [stones, nowMs]);

  // Pra cada branco do dia, ver se bateu em algum sinal (margem ±1min)
  type Hit = {
    stoneId: string | number;
    whiteMs: number;
    signalMs: number;
    tier: "100" | "300" | "500" | "1000";
    type: "LATADO" | "MARGEM";
  };

  const hits = useMemo<Hit[]>(() => {
    const out: Hit[] = [];
    for (const w of whitesToday) {
      const wMs = new Date(w.created_at).getTime();
      // procura o sinal mais próximo (±60s)
      let best: { entry: HistoryEntry; diff: number } | null = null;
      for (const sig of allSignals) {
        const minStart = sig.timeMs;
        const minEnd = sig.timeMs + 60000;
        const prevStart = sig.timeMs - 60000;
        const nextEnd = sig.timeMs + 120000;
        if (wMs >= prevStart && wMs < nextEnd) {
          const diff = Math.abs(wMs - (minStart + 30000));
          if (!best || diff < best.diff) {
            best = { entry: sig, diff };
          }
          // tipo será definido depois com o mais próximo
          void minEnd;
        }
      }
      if (best) {
        const inExact =
          wMs >= best.entry.timeMs && wMs < best.entry.timeMs + 60000;
        out.push({
          stoneId: w.id,
          whiteMs: wMs,
          signalMs: best.entry.timeMs,
          tier: best.entry.tier,
          type: inExact ? "LATADO" : "MARGEM",
        });
      }
    }
    // mais recentes primeiro
    return out.sort((a, b) => b.whiteMs - a.whiteMs);
  }, [whitesToday, allSignals]);

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
          {hits.length} {hits.length === 1 ? "acerto" : "acertos"}
        </div>
      </div>

      <div className="space-y-1 max-h-[260px] overflow-y-auto pr-1">
        {hits.length === 0 ? (
          <div className="text-[11px] text-slate-500 text-center py-3">
            Nenhum branco bateu hoje ainda.
          </div>
        ) : (
          hits.map((h) => {
            const bg =
              h.type === "LATADO"
                ? "bg-emerald-500/20 border-emerald-400/60"
                : "bg-emerald-500/10 border-emerald-500/40";
            const tagColor =
              h.type === "LATADO" ? "text-emerald-200" : "text-emerald-300";
            return (
              <div
                key={`${h.stoneId}-${h.signalMs}`}
                className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1 ${bg}`}
              >
                <div className="flex items-center gap-2">
                  <div className="h-5 w-5 rounded-md bg-white ring-1 ring-emerald-600 flex items-center justify-center overflow-hidden">
                    <img
                      src={brancoIcon}
                      alt=""
                      className="h-4 w-4 object-contain"
                    />
                  </div>
                  <span className="font-mono text-[12px] font-bold text-slate-100 tabular-nums">
                    {fmtHM(h.whiteMs)}
                  </span>
                  <span className="text-[9px] font-bold text-slate-400">
                    ${h.tier}
                  </span>
                </div>
                <span className={`text-[10px] font-extrabold ${tagColor}`}>
                  WIN {h.type}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
