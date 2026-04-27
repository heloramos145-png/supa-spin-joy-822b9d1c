export type BaseStone = {
  id: string | number;
  roll: number;
  color: number;
  created_at: string;
};

export type FluxoTab = "SG" | "G1" | "G2";
export type WhiteTierKey = "100" | "300" | "500" | "1000";

export type TimedSignal = {
  timeMs: number;
  label: string;
};

export type FluxoSignal = TimedSignal & {
  predicted: 1 | 2;
};

export type FluxoSignalStatus = "pending" | "green" | "red" | "waiting";
export type WhiteSignalStatus =
  | "pending"
  | "waiting"
  | "win-latado"
  | "win-margem"
  | "loss";

export type WhiteHistorySignal = TimedSignal & {
  tier: WhiteTierKey;
};

type FluxoTabState = ReturnType<typeof getFluxoCoresTabState>;
type WhiteTierState = ReturnType<typeof simulateWhiteTierDay>;

const FLUXO_INTERVALS = [2, 4, 6, 8, 10, 12, 7, 9];
const FLUXO_SIGNALS_COUNT = 35;
const WHITE_SIGNAL_WINDOW_MS = 120000;
const BRASILIA_OFFSET_MS = 3 * 60 * 60 * 1000;

export function brasiliaDate(ms: number): Date {
  return new Date(ms - BRASILIA_OFFSET_MS);
}

export function brasiliaMinute(ms: number): number {
  return brasiliaDate(ms).getUTCMinutes();
}

export function brasiliaHour(ms: number): number {
  return brasiliaDate(ms).getUTCHours();
}

export function brasiliaDayKey(ms: number): string {
  const d = brasiliaDate(ms);
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

export function startOfBrasiliaDayMs(refMs: number): number {
  const d = brasiliaDate(refMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 3, 0, 0);
}

export function fmtHM(ms: number): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

function predictColor(minute: number): 1 | 2 {
  const m = minute % 14 === 0 ? 14 : minute % 14;
  return m <= 7 ? 1 : 2;
}

function sortAsc<T extends BaseStone>(stones: T[]): T[] {
  return [...stones].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

export function stonesOfBrasiliaDay<T extends BaseStone>(stones: T[], nowMs: number): T[] {
  const dayStart = startOfBrasiliaDayMs(nowMs);
  return sortAsc(
    stones.filter((stone) => new Date(stone.created_at).getTime() >= dayStart),
  );
}

function buildFluxoSignals(startMs: number): FluxoSignal[] {
  const signals: FluxoSignal[] = [];
  let cursor = Math.floor(startMs / 60000) * 60000;

  for (let i = 0; i < FLUXO_SIGNALS_COUNT; i++) {
    const step = FLUXO_INTERVALS[i % FLUXO_INTERVALS.length];
    cursor += step * 60000;
    const minute = brasiliaMinute(cursor);
    signals.push({
      timeMs: cursor,
      label: fmtHM(cursor),
      predicted: predictColor(minute),
    });
  }

  return signals;
}

export function evaluateFluxoSignal(
  signal: FluxoSignal,
  tab: FluxoTab,
  stones: BaseStone[],
  nowMs: number,
): FluxoSignalStatus {
  const minStart = signal.timeMs;
  const minEnd = signal.timeMs + 60000;
  const nextEnd = signal.timeMs + 120000;

  const inMinute = stones
    .filter((stone) => {
      const time = new Date(stone.created_at).getTime();
      return time >= minStart && time < minEnd;
    })
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

  const inNext = stones
    .filter((stone) => {
      const time = new Date(stone.created_at).getTime();
      return time >= minEnd && time < nextEnd;
    })
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

  const targets: BaseStone[] = [];
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

  const needed = tab === "SG" ? 1 : tab === "G1" ? 2 : 3;
  const windowEnd = tab === "G2" ? nextEnd : minEnd;
  const isHit = (color: number) => color === 0 || color === signal.predicted;

  if (targets.some((stone) => isHit(stone.color))) return "green";
  // Só conta como red se realmente houve pedras na janela e nenhuma bateu.
  // Sem dados na janela = sinal não avaliável (não infla losses do dia).
  if (nowMs >= windowEnd && targets.length >= needed) return "red";
  if (nowMs < minStart) return "pending";
  if (nowMs >= windowEnd) return "pending";
  return "waiting";
}

function buildFluxoBatches(stones: BaseStone[], nowMs: number) {
  const dayStones = stonesOfBrasiliaDay(stones, nowMs);
  const batches: FluxoSignal[][] = [];
  let seed = startOfBrasiliaDayMs(nowMs);

  for (let i = 0; i < 64; i++) {
    const batch = buildFluxoSignals(seed);
    batches.push(batch);
    const lastSignal = batch[batch.length - 1];
    if (!lastSignal) break;
    if (nowMs < lastSignal.timeMs + 120000) break;
    seed = lastSignal.timeMs;
  }

  const currentSignals = batches[batches.length - 1] ?? [];
  const allSignals = batches.flat();
  return { dayStones, currentSignals, allSignals };
}

// Avalia apenas UMA aba (SG/G1/G2). Muito mais rápido que avaliar as 3
// quando o usuário só está olhando uma — evita travar ao trocar de aba.
export function getFluxoCoresTabState(
  stones: BaseStone[],
  nowMs: number,
  tab: FluxoTab,
) {
  if (!nowMs) {
    return { currentEvaluated: [], wins: 0, losses: 0, resolved: 0, accuracy: 0 };
  }

  const { dayStones, currentSignals, allSignals } = buildFluxoBatches(stones, nowMs);

  const currentEvaluated = currentSignals.map((signal) => ({
    ...signal,
    status: evaluateFluxoSignal(signal, tab, dayStones, nowMs),
  }));

  let wins = 0;
  let losses = 0;
  for (const signal of allSignals) {
    const status = evaluateFluxoSignal(signal, tab, dayStones, nowMs);
    if (status === "green") wins++;
    else if (status === "red") losses++;
  }
  const resolved = wins + losses;
  const accuracy = resolved ? Math.round((wins / resolved) * 100) : 0;

  return { currentEvaluated, wins, losses, resolved, accuracy };
}

export function getFluxoCoresDayState(stones: BaseStone[], nowMs: number) {
  return {
    byTab: {
      SG: getFluxoCoresTabState(stones, nowMs, "SG"),
      G1: getFluxoCoresTabState(stones, nowMs, "G1"),
      G2: getFluxoCoresTabState(stones, nowMs, "G2"),
    },
  };
}

export function getFluxoCoresTabStateFromPrepared(
  prepared: { dayStones: BaseStone[]; currentSignals: FluxoSignal[]; allSignals: FluxoSignal[] },
  nowMs: number,
  tab: FluxoTab,
): FluxoTabState {
  const { dayStones, currentSignals, allSignals } = prepared;

  const currentEvaluated = currentSignals.map((signal) => ({
    ...signal,
    status: evaluateFluxoSignal(signal, tab, dayStones, nowMs),
  }));

  let wins = 0;
  let losses = 0;
  for (const signal of allSignals) {
    const status = evaluateFluxoSignal(signal, tab, dayStones, nowMs);
    if (status === "green") wins++;
    else if (status === "red") losses++;
  }

  const resolved = wins + losses;
  const accuracy = resolved ? Math.round((wins / resolved) * 100) : 0;

  return { currentEvaluated, wins, losses, resolved, accuracy };
}

function nextOccurrenceAt(brMinute: number, afterMs: number): number {
  const after = brasiliaDate(afterMs);
  const candidate = new Date(
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

  let candidateUtcMs = candidate.getTime() + BRASILIA_OFFSET_MS;
  if (candidateUtcMs <= afterMs) candidateUtcMs += 60 * 60 * 1000;
  return candidateUtcMs;
}

function digitsOf(n: number): number[] {
  return String(n)
    .split("")
    .map((digit) => Number(digit));
}

const GAP_MIN = 5;
function pickThreeMinutes(baseBrMinute: number, digits: number[]): number[] {
  const uniqueDigits = Array.from(new Set(digits));
  const picked: number[] = [];
  let cursor = baseBrMinute;

  for (const digit of uniqueDigits) {
    let minute = cursor + 1;
    while (minute % 10 !== digit) minute++;
    while (picked.length > 0 && minute - picked[picked.length - 1] < GAP_MIN) {
      minute += 10;
    }
    picked.push(minute);
    cursor = minute;
    if (picked.length === 3) break;
  }

  while (picked.length < 3 && uniqueDigits.length > 0) {
    const digit = uniqueDigits[uniqueDigits.length - 1];
    let minute = cursor + 1;
    while (minute % 10 !== digit) minute++;
    while (minute - picked[picked.length - 1] < GAP_MIN) minute += 10;
    picked.push(minute);
    cursor = minute;
  }

  return picked;
}

function topDigits(products: number[], take: number): number[] {
  const counts = new Map<number, number>();
  for (const product of products) {
    for (const digit of digitsOf(product)) {
      counts.set(digit, (counts.get(digit) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, take)
    .map(([digit]) => digit);
}

export function evaluateWhiteSignal(
  timeMs: number,
  stones: BaseStone[],
  nowMs: number,
): WhiteSignalStatus {
  const whiteTimes = getWhiteTimesIndex(stones);
  return evaluateWhiteSignalFast(timeMs, whiteTimes, nowMs);
}

// Cache (por referência de array) de timestamps de brancos ordenados.
// Evita re-filtrar/re-mapear N vezes nos loops por tier.
const whiteTimesCache = new WeakMap<BaseStone[], number[]>();
function getWhiteTimesIndex(stones: BaseStone[]): number[] {
  const cached = whiteTimesCache.get(stones);
  if (cached) return cached;
  const out: number[] = [];
  for (const s of stones) {
    if (s.color === 0) out.push(new Date(s.created_at).getTime());
  }
  out.sort((a, b) => a - b);
  whiteTimesCache.set(stones, out);
  return out;
}

// Busca binária: primeiro índice com value >= target.
function lowerBound(arr: number[], target: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function hasWhiteIn(whiteTimes: number[], start: number, end: number): boolean {
  const i = lowerBound(whiteTimes, start);
  return i < whiteTimes.length && whiteTimes[i] < end;
}

function evaluateWhiteSignalFast(
  timeMs: number,
  whiteTimes: number[],
  nowMs: number,
): WhiteSignalStatus {
  const minStart = timeMs;
  const minEnd = timeMs + 60000;
  const prevStart = timeMs - 60000;
  const nextEnd = timeMs + WHITE_SIGNAL_WINDOW_MS;

  if (hasWhiteIn(whiteTimes, minStart, minEnd)) return "win-latado";
  if (hasWhiteIn(whiteTimes, prevStart, minStart)) return "win-margem";
  if (hasWhiteIn(whiteTimes, minEnd, nextEnd)) return "win-margem";

  if (nowMs >= nextEnd) return "loss";
  if (nowMs < prevStart) return "pending";
  return "waiting";
}

function sameSignals(a: TimedSignal[], b: TimedSignal[]): boolean {
  return (
    a.length === b.length &&
    a.every((signal, index) => signal.timeMs === b[index]?.timeMs)
  );
}

function uniqueSignals<T extends TimedSignal>(signals: T[]): T[] {
  const seen = new Set<number>();
  return signals.filter((signal) => {
    if (seen.has(signal.timeMs)) return false;
    seen.add(signal.timeMs);
    return true;
  });
}

function computeWhiteSignalsAt(
  tier: WhiteTierKey,
  stones: BaseStone[],
  atMs: number,
): TimedSignal[] {
  const whites = stones
    .filter((stone) => stone.color === 0)
    .filter((stone) => new Date(stone.created_at).getTime() <= atMs)
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

  const minutesToSignals = (minutes: number[], afterMs: number) =>
    minutes.map((minute) => {
      const timeMs = nextOccurrenceAt(minute % 60, afterMs);
      return { timeMs, label: fmtHM(timeMs) };
    });

  if (tier === "100") {
    const lastWhite = whites[whites.length - 1];
    if (!lastWhite) return [];
    const lastMs = new Date(lastWhite.created_at).getTime();
    const minute = brasiliaMinute(lastMs);
    return minutesToSignals(pickThreeMinutes(minute, digitsOf(minute * 14)), lastMs);
  }

  if (tier === "300") {
    const lastFive = whites.slice(-5);
    if (lastFive.length < 1) return [];
    const products = lastFive.map(
      (stone) => brasiliaMinute(new Date(stone.created_at).getTime()) * 14,
    );
    return minutesToSignals(pickThreeMinutes(brasiliaMinute(atMs), topDigits(products, 3)), atMs);
  }

  const previousHour = (brasiliaHour(atMs) - 1 + 24) % 24;
  const whitesInPreviousHour = whites.filter(
    (stone) => brasiliaHour(new Date(stone.created_at).getTime()) === previousHour,
  );

  if (tier === "500") {
    const firstThree = whitesInPreviousHour.slice(0, 3);
    if (firstThree.length === 0) return [];
    const products = firstThree.map(
      (stone) => brasiliaMinute(new Date(stone.created_at).getTime()) * 14,
    );
    return minutesToSignals(pickThreeMinutes(brasiliaMinute(atMs), topDigits(products, 3)), atMs);
  }

  if (whitesInPreviousHour.length === 0) return [];
  const products = whitesInPreviousHour.map(
    (stone) => brasiliaMinute(new Date(stone.created_at).getTime()) * 14,
  );
  return minutesToSignals(pickThreeMinutes(brasiliaMinute(atMs), topDigits(products, 3)), atMs);
}

function buildWhiteCandidateTimes(stones: BaseStone[], nowMs: number): number[] {
  const dayStart = startOfBrasiliaDayMs(nowMs);
  const minuteEnd = Math.floor(nowMs / 60000) * 60000;
  const times = new Set<number>([dayStart, nowMs]);

  for (let minute = dayStart; minute <= minuteEnd; minute += 60000) {
    times.add(minute);
  }

  for (const stone of stones) {
    if (stone.color !== 0) continue;
    const timeMs = new Date(stone.created_at).getTime();
    if (timeMs >= dayStart && timeMs <= nowMs) times.add(timeMs);
  }

  return Array.from(times).sort((a, b) => a - b);
}

function simulateWhiteTierDay(
  tier: WhiteTierKey,
  stones: BaseStone[],
  nowMs: number,
) {
  const dayStones = stonesOfBrasiliaDay(stones, nowMs);
  const candidateTimes = buildWhiteCandidateTimes(dayStones, nowMs);
  let latestSignals: TimedSignal[] = [];
  const history: TimedSignal[] = [];

  for (const candidateTime of candidateTimes) {
    const currentOpen = latestSignals.some(
      (signal) => candidateTime < signal.timeMs + WHITE_SIGNAL_WINDOW_MS,
    );
    if (currentOpen) continue;

    const freshSignals = computeWhiteSignalsAt(tier, dayStones, candidateTime);
    if (freshSignals.length === 0) {
      latestSignals = [];
      continue;
    }

    if (!sameSignals(latestSignals, freshSignals)) {
      latestSignals = freshSignals;
      history.push(...freshSignals);
    }
  }

  const uniqueHistory = uniqueSignals(history);
  const whiteTimes = getWhiteTimesIndex(dayStones);
  const currentEvaluated = latestSignals.map((signal) => ({
    ...signal,
    status: evaluateWhiteSignalFast(signal.timeMs, whiteTimes, nowMs),
  }));
  const historyEvaluated = uniqueHistory.map((signal) => ({
    ...signal,
    status: evaluateWhiteSignalFast(signal.timeMs, whiteTimes, nowMs),
  }));

  const wins = historyEvaluated.filter(
    (signal) => signal.status === "win-latado" || signal.status === "win-margem",
  ).length;
  const losses = historyEvaluated.filter((signal) => signal.status === "loss").length;

  return {
    latestSignals,
    currentEvaluated,
    historySignals: uniqueHistory,
    historyEvaluated,
    wins,
    losses,
  };
}

// Avalia apenas UM tier (100/300/500/1000) — evita travar ao trocar de aba.
export function getBrancosTierState(
  stones: BaseStone[],
  nowMs: number,
  tier: WhiteTierKey,
) {
  if (!nowMs) {
    return {
      latestSignals: [] as TimedSignal[],
      currentEvaluated: [] as Array<TimedSignal & { status: WhiteSignalStatus }>,
      historySignals: [] as TimedSignal[],
      historyEvaluated: [] as Array<TimedSignal & { status: WhiteSignalStatus }>,
      wins: 0,
      losses: 0,
    };
  }
  return simulateWhiteTierDay(tier, stones, nowMs);
}

export function getBrancosTierStateFromPrepared(
  prepared: Record<WhiteTierKey, WhiteTierState>,
  tier: WhiteTierKey,
) {
  return prepared[tier];
}

export function getBrancosDayState(stones: BaseStone[], nowMs: number) {
  if (!nowMs) {
    const emptyTier = {
      latestSignals: [],
      currentEvaluated: [],
      historySignals: [],
      historyEvaluated: [],
      wins: 0,
      losses: 0,
    };
    return {
      byTier: {
        "100": emptyTier,
        "300": emptyTier,
        "500": emptyTier,
        "1000": emptyTier,
      },
      allHistory: [] as WhiteHistorySignal[],
    };
  }

  const byTier = {
    "100": simulateWhiteTierDay("100", stones, nowMs),
    "300": simulateWhiteTierDay("300", stones, nowMs),
    "500": simulateWhiteTierDay("500", stones, nowMs),
    "1000": simulateWhiteTierDay("1000", stones, nowMs),
  };

  const allHistory = (["100", "300", "500", "1000"] as WhiteTierKey[])
    .flatMap((tier) =>
      byTier[tier].historySignals.map((signal) => ({
        ...signal,
        tier,
      })),
    )
    .sort((a, b) => a.timeMs - b.timeMs);

  return { byTier, allHistory };
}
