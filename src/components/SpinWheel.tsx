import { useEffect, useMemo, useRef, useState } from "react";
import Slot from "@/components/Slot";

// Ordem oficial das pedras na roleta da Jonbet Double (verde / preta / branca)
const SLOT_NUMBERS = [1, 14, 2, 13, 3, 12, 4, 0, 11, 5, 10, 6, 9, 7, 8];

const getColor = (n: number): "green" | "black" | "white" => {
  if (n === 0) return "white";
  if (n >= 1 && n <= 7) return "green";
  return "black";
};

const SLOT_COLORS = SLOT_NUMBERS.map(getColor);

// Dimensões
const STONE_SIZE = 64;
const GAP = 8;
const STEP = STONE_SIZE + GAP;
const VISIBLE = 5;
const TOTAL = SLOT_NUMBERS.length;
const CONTAINER_W = VISIBLE * STONE_SIZE + (VISIBLE - 1) * GAP;

// Tempos da Jonbet Double
// 16 segundos por rodada total: 5s aceitando aposta + 11s girando
const SPIN_MS = 11000;

interface SpinWheelProps {
  roll?: number | null;
  status?: "waiting" | "rolling" | "complete";
  countdown?: number;
  resultId?: string | null;
}

export default function SpinWheel({
  roll = null,
  status = "waiting",
  countdown = 0,
  resultId = null,
}: SpinWheelProps) {
  const centerOffset = CONTAINER_W / 2 - STONE_SIZE / 2;

  const strip = useMemo(
    () =>
      Array.from({ length: TOTAL * 12 }, (_, i) => ({
        number: SLOT_NUMBERS[i % TOTAL],
        color: SLOT_COLORS[i % TOTAL],
      })),
    [],
  );

  const [translateX, setTranslateX] = useState(centerOffset - TOTAL * 2 * STEP);
  const [transition, setTransition] = useState("none");
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<{ number: number; color: string } | null>(
    null,
  );
  const lastResultKeyRef = useRef<string | null>(null);
  const settleTimeoutRef = useRef<number | null>(null);

  const trackXForIndex = (trackIndex: number) =>
    centerOffset - trackIndex * STEP;

  const setSettledResult = (number: number, color: string) => {
    const idx = SLOT_NUMBERS.findIndex((v) => v === number);
    if (idx < 0) return;
    if (settleTimeoutRef.current !== null) {
      window.clearTimeout(settleTimeoutRef.current);
      settleTimeoutRef.current = null;
    }
    setSpinning(false);
    setTransition("none");
    setTranslateX(trackXForIndex(TOTAL * 2 + idx));
    setResult({ number, color });
  };

  useEffect(() => {
    return () => {
      if (settleTimeoutRef.current !== null)
        window.clearTimeout(settleTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (roll === null || roll === undefined) return;
    const color = getColor(roll);
    const idx = SLOT_NUMBERS.findIndex((v) => v === roll);
    if (idx < 0) return;

    const key = `${resultId ?? "live"}-${roll}`;
    if (lastResultKeyRef.current === key) return;

    if (!lastResultKeyRef.current) {
      lastResultKeyRef.current = key;
      setSettledResult(roll, color);
      return;
    }

    lastResultKeyRef.current = key;
    setSpinning(true);
    setResult(null);
    setTransition("none");
    setTranslateX(trackXForIndex(TOTAL * 2 + idx));

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTransition(
          `transform ${SPIN_MS}ms cubic-bezier(0.16, 0.84, 0.18, 1)`,
        );
        // 6 voltas inteiras antes de parar no índice alvo — sensação Jonbet
        setTranslateX(trackXForIndex(TOTAL * 8 + idx));
      });
    });

    if (settleTimeoutRef.current !== null)
      window.clearTimeout(settleTimeoutRef.current);
    settleTimeoutRef.current = window.setTimeout(() => {
      setSettledResult(roll, color);
    }, SPIN_MS + 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roll, resultId]);

  const renderStone = (num: number, size: "sm" | "md" = "md") => (
    <Slot number={num} color={getColor(num)} size={size} />
  );

  const isWaiting = status === "waiting";
  const showRollingLabel = spinning || status === "rolling";

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div className="flex w-full flex-col items-center gap-3">
      {/* Status */}
      <div className="w-full max-w-md rounded-full bg-blue-600 px-4 py-2 text-center text-sm font-bold text-white shadow-lg">
        {isWaiting && countdown > 0
          ? `Girando Em ${formatCountdown(countdown)}`
          : showRollingLabel
            ? "Girando..."
            : "Aguardando rodada"}
      </div>

      {/* Track */}
      <div
        className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60"
        style={{ width: CONTAINER_W, height: STONE_SIZE + 24, padding: 12 }}
      >
        {/* Indicador central */}
        <div
          className="pointer-events-none absolute top-0 z-20 h-full w-[2px] bg-emerald-400"
          style={{ left: "50%", transform: "translateX(-1px)" }}
        />
        {/* Fades laterais */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12"
          style={{
            background:
              "linear-gradient(to right, rgb(2,6,23) 0%, rgba(2,6,23,0) 100%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12"
          style={{
            background:
              "linear-gradient(to left, rgb(2,6,23) 0%, rgba(2,6,23,0) 100%)",
          }}
        />

        {/* Faixa */}
        <div
          className="flex items-center"
          style={{
            gap: GAP,
            transform: `translateX(${translateX}px)`,
            transition,
            willChange: "transform",
          }}
        >
          {strip.map((stone, index) => (
            <div
              key={index}
              className="flex items-center justify-center"
              style={{ width: STONE_SIZE, height: STONE_SIZE, flexShrink: 0 }}
            >
              <div style={{ transform: `scale(${STONE_SIZE / 36})`, transformOrigin: "center" }}>
                {renderStone(stone.number, "sm")}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Resultado */}
      {result && !spinning ? (
        <div className="flex items-center gap-2 text-sm text-slate-300">
          {renderStone(result.number, "sm")}
          <span className="font-bold">{result.number}</span>
          <span className="text-slate-400">Jonbet Girou</span>
        </div>
      ) : null}
    </div>
  );
}
