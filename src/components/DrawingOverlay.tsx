import { useEffect, useRef, useState } from "react";

type Tool = "circle" | "square" | "arrow" | "win" | "loss" | "free";

type Shape =
  | {
      kind: "circle" | "square" | "arrow";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      color: string;
    }
  | {
      kind: "label";
      text: "WIN" | "LOSS";
      x: number;
      y: number;
      color: string;
    }
  | {
      kind: "free";
      points: { x: number; y: number }[];
      color: string;
    };

const COLORS = ["#10b981", "#ef4444", "#facc15", "#3b82f6", "#ffffff"];

export default function DrawingOverlay() {
  const [open, setOpen] = useState(false);
  const [tool, setTool] = useState<Tool>("circle");
  const [color, setColor] = useState<string>(COLORS[0]);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [draft, setDraft] = useState<Shape | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Trava scroll quando aberto
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  function getPoint(e: React.PointerEvent) {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = getPoint(e);
    if (tool === "win" || tool === "loss") {
      setShapes((s) => [
        ...s,
        {
          kind: "label",
          text: tool === "win" ? "WIN" : "LOSS",
          x: p.x,
          y: p.y,
          color: tool === "win" ? "#10b981" : "#ef4444",
        },
      ]);
      return;
    }
    if (tool === "free") {
      setDraft({ kind: "free", points: [p], color });
      return;
    }
    setDraft({
      kind: tool,
      x1: p.x,
      y1: p.y,
      x2: p.x,
      y2: p.y,
      color,
    });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!draft) return;
    const p = getPoint(e);
    if (draft.kind === "free") {
      setDraft({ ...draft, points: [...draft.points, p] });
    } else if (draft.kind === "label") {
      // labels não arrastam
    } else {
      setDraft({ ...draft, x2: p.x, y2: p.y });
    }
  }

  function onPointerUp() {
    if (!draft) return;
    setShapes((s) => [...s, draft]);
    setDraft(null);
  }

  function clearAll() {
    setShapes([]);
    setDraft(null);
  }

  function undo() {
    setShapes((s) => s.slice(0, -1));
  }

  function renderShape(sh: Shape, key: string) {
    if (sh.kind === "circle") {
      const cx = (sh.x1 + sh.x2) / 2;
      const cy = (sh.y1 + sh.y2) / 2;
      const rx = Math.abs(sh.x2 - sh.x1) / 2;
      const ry = Math.abs(sh.y2 - sh.y1) / 2;
      return (
        <ellipse
          key={key}
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          fill="none"
          stroke={sh.color}
          strokeWidth={3}
        />
      );
    }
    if (sh.kind === "square") {
      const x = Math.min(sh.x1, sh.x2);
      const y = Math.min(sh.y1, sh.y2);
      const w = Math.abs(sh.x2 - sh.x1);
      const h = Math.abs(sh.y2 - sh.y1);
      return (
        <rect
          key={key}
          x={x}
          y={y}
          width={w}
          height={h}
          fill="none"
          stroke={sh.color}
          strokeWidth={3}
        />
      );
    }
    if (sh.kind === "arrow") {
      const dx = sh.x2 - sh.x1;
      const dy = sh.y2 - sh.y1;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const head = 14;
      const ax = sh.x2 - ux * head;
      const ay = sh.y2 - uy * head;
      const px = -uy;
      const py = ux;
      const h1x = ax + px * (head / 2);
      const h1y = ay + py * (head / 2);
      const h2x = ax - px * (head / 2);
      const h2y = ay - py * (head / 2);
      return (
        <g key={key} stroke={sh.color} strokeWidth={3} fill={sh.color}>
          <line x1={sh.x1} y1={sh.y1} x2={sh.x2} y2={sh.y2} />
          <polygon points={`${sh.x2},${sh.y2} ${h1x},${h1y} ${h2x},${h2y}`} />
        </g>
      );
    }
    if (sh.kind === "free") {
      if (sh.points.length === 0) return null;
      const d = sh.points
        .map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`)
        .join(" ");
      return (
        <path
          key={key}
          d={d}
          fill="none"
          stroke={sh.color}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    }
    // label WIN / LOSS
    const isWin = sh.text === "WIN";
    return (
      <g key={key}>
        <rect
          x={sh.x - 38}
          y={sh.y - 18}
          width={76}
          height={36}
          rx={8}
          fill={isWin ? "#10b981" : "#ef4444"}
          stroke="#0f172a"
          strokeWidth={2}
        />
        <text
          x={sh.x}
          y={sh.y + 6}
          textAnchor="middle"
          fontSize={20}
          fontWeight={900}
          fontFamily="system-ui, sans-serif"
          fill="#0f172a"
        >
          {sh.text}
        </text>
      </g>
    );
  }

  return (
    <>
      {/* Botão flutuante para abrir */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-40 rounded-full bg-emerald-500 px-4 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/30 hover:bg-emerald-400 transition"
          aria-label="Abrir desenho"
        >
          ✎ Desenhar
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50">
          {/* Camada SVG */}
          <svg
            ref={svgRef}
            className="absolute inset-0 h-full w-full bg-slate-950/40 backdrop-blur-[1px] touch-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {shapes.map((s, i) => renderShape(s, `s-${i}`))}
            {draft && renderShape(draft, "draft")}
          </svg>

          {/* Toolbar */}
          <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-xl border border-slate-700 bg-slate-900/95 p-2 shadow-xl backdrop-blur">
            <div className="flex flex-wrap items-center justify-center gap-1">
              <ToolBtn
                active={tool === "circle"}
                onClick={() => setTool("circle")}
                label="Círculo"
              >
                <svg width="18" height="18" viewBox="0 0 20 20">
                  <circle
                    cx="10"
                    cy="10"
                    r="7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                </svg>
              </ToolBtn>
              <ToolBtn
                active={tool === "square"}
                onClick={() => setTool("square")}
                label="Quadrado"
              >
                <svg width="18" height="18" viewBox="0 0 20 20">
                  <rect
                    x="3"
                    y="3"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                </svg>
              </ToolBtn>
              <ToolBtn
                active={tool === "arrow"}
                onClick={() => setTool("arrow")}
                label="Seta"
              >
                <svg width="18" height="18" viewBox="0 0 20 20">
                  <line
                    x1="3"
                    y1="17"
                    x2="15"
                    y2="5"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <polygon points="15,5 10,5 15,10" fill="currentColor" />
                </svg>
              </ToolBtn>
              <ToolBtn
                active={tool === "free"}
                onClick={() => setTool("free")}
                label="Livre"
              >
                <svg width="18" height="18" viewBox="0 0 20 20">
                  <path
                    d="M3 15 Q 7 5, 11 12 T 17 8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </ToolBtn>
              <ToolBtn
                active={tool === "win"}
                onClick={() => setTool("win")}
                label="WIN"
              >
                <span className="text-[11px] font-black text-emerald-400">
                  WIN
                </span>
              </ToolBtn>
              <ToolBtn
                active={tool === "loss"}
                onClick={() => setTool("loss")}
                label="LOSS"
              >
                <span className="text-[11px] font-black text-rose-400">
                  LOSS
                </span>
              </ToolBtn>

              <div className="mx-1 h-6 w-px bg-slate-700" />

              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-md border-2 transition ${
                    color === c ? "border-white scale-110" : "border-slate-700"
                  }`}
                  style={{ background: c }}
                  aria-label={`cor ${c}`}
                />
              ))}

              <div className="mx-1 h-6 w-px bg-slate-700" />

              <button
                onClick={undo}
                className="rounded-md bg-slate-800 px-2 py-1 text-[11px] font-bold text-slate-200 hover:bg-slate-700"
              >
                Desfazer
              </button>
              <button
                onClick={clearAll}
                className="rounded-md bg-slate-800 px-2 py-1 text-[11px] font-bold text-slate-200 hover:bg-slate-700"
              >
                Limpar
              </button>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md bg-rose-500 px-2 py-1 text-[11px] font-bold text-white hover:bg-rose-400"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ToolBtn({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex h-9 w-9 items-center justify-center rounded-md border transition ${
        active
          ? "border-emerald-400 bg-emerald-500/20 text-emerald-300"
          : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
      }`}
    >
      {children}
    </button>
  );
}
