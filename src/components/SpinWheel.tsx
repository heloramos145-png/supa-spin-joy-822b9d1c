import { useEffect, useMemo, useRef, useState } from "react";
import StoneIcon from "@/components/StoneIcon";

// Ordem oficial das pedras na roleta da Jonbet Double (verde / preta / branca)
const SLOT_NUMBERS = [1, 14, 2, 13, 3, 12, 4, 0, 11, 5, 10, 6, 9, 7, 8];

const getColor = (n: number): "green" | "black" | "white" => {
  if (n === 0) return "white";
  if (n >= 1 && n <= 7) return "green";
  return "black";
};

const SLOT_COLORS = SLOT_NUMBERS.map(getColor);

// Dimensões
const STONE_SIZE = 80;
const GAP = 10;
const STEP = STONE_SIZE + GAP;
const VISIBLE = 5;
const TOTAL = SLOT_NUMBERS.length;
const CONTAINER_W = VISIBLE * STONE_SIZE + (VISIBLE - 1) * GAP;

const getCardBg = (color: string) => {
  if (color === "green") return "rgba(34,197,94,0.15)";
  if (color === "white") return "rgba(200,200,200,0.18)";
  return "rgba(55,55,55,0.35)";
};

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
      Array.from({ length: TOTAL * 10 }, (_, i) => ({
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
        setTransition("transform 3s cubic-bezier(0.14, 0.82, 0.2, 1)");
        setTranslateX(trackXForIndex(TOTAL * 6 + idx));
      });
    });

    if (settleTimeoutRef.current !== null)
      window.clearTimeout(settleTimeoutRef.current);
    settleTimeoutRef.current = window.setTimeout(() => {
      setSettledResult(roll, color);
    }, 3050);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roll, resultId]);

  const renderStone = (
    num: number,
    _color: string,
    size: number,
    _withCard = false,
  ) => {
    // O PNG da pedra já contém fundo + borda arredondada — não envolver em card.
    return (
      <div
        className="flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <StoneIcon roll={num} size={size} />
      </div>
    );
  };

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
          className="flex"
          style={{
            gap: GAP,
            transform: `translateX(${translateX}px)`,
            transition,
            willChange: "transform",
          }}
        >
          {strip.map((stone, index) => (
            <div key={index} style={{ width: STONE_SIZE, flexShrink: 0 }}>
              {renderStone(stone.number, stone.color, STONE_SIZE, false)}
            </div>
          ))}
        </div>
      </div>

      {/* Resultado */}
      {result && !spinning ? (
        <div className="flex items-center gap-2 text-sm text-slate-300">
          {renderStone(result.number, result.color, 36)}
          <span className="font-bold">{result.number}</span>
          <span className="text-slate-400">Jonbet Girou</span>
        </div>
      ) : null}
    </div>
  );
}
