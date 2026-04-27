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

type StoredSignals = Record<
  "100" | "300" | "500" | "1000",
  { timeMs: number; label: string }[]
>;

const STORAGE_KEY = "brancos-fluxo-jon:signals:v1";
const HISTORY_KEY = "brancos-fluxo-jon:history:v1";

type HistoryEntry = {
  tier: "100" | "300" | "500" | "1000";
  timeMs: number;
};

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
  // início do dia em Brasília (00:00)
  const todayStartMs = useMemo(() => {
    const ref = nowMs || Date.now();
    const d = new Date(ref - 3 * 60 * 60 * 1000);
    const start = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 3, 0, 0),
    );
    return start.getTime();
  }, [nowMs]);

  // Sinais ativos + histórico, filtrados pro dia
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
    const filtered = merged.filter((h) => h.timeMs >= todayStartMs);
    writeHistory(filtered);
    return filtered;
  }, [nowMs, todayStartMs]);

  // TODOS os brancos do dia (a partir das 00:00 Brasília)
  const whitesToday = useMemo(() => {
    if (!nowMs) return [];
    return stones
      .filter((s) => s.color === 0)
      .filter((s) => new Date(s.created_at).getTime() >= todayStartMs)
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() -
          new Date(a.created_at).getTime(),
      );
  }, [stones, nowMs, todayStartMs]);

  type Row = {
    stoneId: string | number;
    whiteMs: number;
    tier: "100" | "300" | "500" | "1000";
    type: "LATADO" | "MARGEM";
  };

  // Só lista brancos do dia que BATERAM em algum sinal (LATADO ou MARGEM).
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const w of whitesToday) {
      const wMs = new Date(w.created_at).getTime();
      let best: { entry: HistoryEntry; type: "LATADO" | "MARGEM" } | null = null;
      for (const sig of allSignals) {
        const minStart = sig.timeMs;
        const minEnd = sig.timeMs + 60000;
        const prevStart = sig.timeMs - 60000;
        const nextEnd = sig.timeMs + 120000;
        if (wMs >= prevStart && wMs < nextEnd) {
          const inExact = wMs >= minStart && wMs < minEnd;
          const type: "LATADO" | "MARGEM" = inExact ? "LATADO" : "MARGEM";
          if (!best || (type === "LATADO" && best.type !== "LATADO")) {
            best = { entry: sig, type };
          }
        }
      }
      if (best) {
        out.push({
          stoneId: w.id,
          whiteMs: wMs,
          tier: best.entry.tier,
          type: best.type,
        });
      }
    }
    return out;
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
                key={`${h.stoneId}`}
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
