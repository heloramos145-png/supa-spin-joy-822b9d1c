import stoneBlack from "@/assets/stone-black.png";
import stoneGreen from "@/assets/stone-green.png";
import stoneWhite from "@/assets/stone-white.png";

type StoneIconProps = {
  roll: number;
  size: number;
  className?: string;
  alt?: string;
};

function getStoneAsset(roll: number) {
  if (roll === 0) return stoneWhite;
  if (roll <= 7) return stoneGreen;
  return stoneBlack;
}

function getNumberColor(roll: number) {
  // branca (0): sem número (logo "e" no centro)
  // verde (1-7) e preta (8-14): número branco
  return "#ffffff";
}

export default function StoneIcon({
  roll,
  size,
  className,
  alt = "",
}: StoneIconProps) {
  const showNumber = roll !== 0;
  // Tamanho da fonte proporcional, com peso forte pra ficar legível
  const fontSize = Math.round(size * 0.42);

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <img
        src={getStoneAsset(roll)}
        alt={alt}
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          display: "block",
        }}
      />
      {showNumber && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: getNumberColor(roll),
            fontWeight: 900,
            fontSize,
            lineHeight: 1,
            fontFamily:
              "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
            textShadow: "0 1px 2px rgba(0,0,0,0.55)",
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          {roll}
        </span>
      )}
    </div>
  );
}
