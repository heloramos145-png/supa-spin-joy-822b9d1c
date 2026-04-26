type StoneIconProps = {
  roll: number;
  size: number;
  className?: string;
  alt?: string;
};

type Palette = {
  bg: string;
  border: string;
  ring: string;
  text: string;
};

function getPalette(roll: number): Palette {
  if (roll === 0) {
    // Branco — fundo claro, anel e logo verde (estilo Jonbet)
    return {
      bg: "#ffffff",
      border: "#1f8a3a",
      ring: "#1f8a3a",
      text: "#1f8a3a",
    };
  }
  if (roll <= 7) {
    // Verde
    return {
      bg: "#7CF06A",
      border: "#3FA22A",
      ring: "#0b1f0b",
      text: "#0b1f0b",
    };
  }
  // Preto
  return {
    bg: "#2a2a2a",
    border: "#4a4a4a",
    ring: "#ffffff",
    text: "#ffffff",
  };
}

export default function StoneIcon({
  roll,
  size,
  className,
  alt,
}: StoneIconProps) {
  const p = getPalette(roll);
  const radius = Math.max(6, size * 0.22);
  const borderW = Math.max(1, Math.round(size * 0.05));
  const ringSize = size * 0.62;
  const ringStroke = Math.max(2, Math.round(size * 0.09));
  const fontSize = roll >= 10 ? size * 0.36 : size * 0.42;

  return (
    <div
      role="img"
      aria-label={alt ?? `pedra ${roll}`}
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: p.bg,
        border: `${borderW}px solid ${p.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        boxSizing: "border-box",
        flexShrink: 0,
      }}
    >
      {roll === 0 ? (
        // Branco mostra a letra "e" estilizada (logo Jonbet) em verde
        <span
          style={{
            fontFamily:
              "ui-rounded, 'SF Pro Rounded', system-ui, -apple-system, sans-serif",
            fontWeight: 900,
            fontStyle: "italic",
            fontSize: size * 0.62,
            color: p.text,
            lineHeight: 1,
            transform: "translateY(-2%)",
          }}
        >
          e
        </span>
      ) : (
        <>
          <div
            style={{
              width: ringSize,
              height: ringSize,
              borderRadius: "50%",
              border: `${ringStroke}px solid ${p.ring}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxSizing: "border-box",
            }}
          >
            <span
              style={{
                fontFamily:
                  "ui-rounded, 'SF Pro Rounded', system-ui, -apple-system, sans-serif",
                fontWeight: 800,
                fontSize,
                color: p.text,
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {roll}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
