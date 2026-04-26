import { forwardRef } from "react";

interface SlotProps {
  number: number;
  /** "white" | "green" | "black" — qualquer outra coisa cai em black */
  color: string;
  size?: "sm" | "md";
  timeLabel?: string;
  onClick?: () => void;
}

const Slot = forwardRef<HTMLDivElement, SlotProps>(
  ({ number, color, size = "sm", timeLabel, onClick }, ref) => {
    const isGreen = color === "green";
    const isWhite = color === "white";

    const outerSize = size === "sm" ? "w-9 h-9" : "w-11 h-11";
    const innerSize = size === "sm" ? "w-6 h-6" : "w-8 h-8";
    const numberStyle = size === "sm" ? "text-[16px]" : "text-[18px]";
    const borderW = size === "sm" ? "border-[1.5px]" : "border-[2.5px]";
    const roundedOuter = size === "sm" ? "rounded-lg" : "rounded-xl";

    const slotContent = (() => {
      if (isWhite) {
        return (
          <div
            className={`${outerSize} ${roundedOuter} flex items-center justify-center shadow-sm`}
            style={{ backgroundColor: "#ffffff", border: "2.5px solid #1B7F3A" }}
          >
            <span style={{ fontSize: "18px", fontWeight: 800, color: "#1B7F3A" }}>0</span>
          </div>
        );
      }
      if (isGreen) {
        return (
          <div
            className={`${outerSize} ${roundedOuter} flex items-center justify-center shadow-sm`}
            style={{ backgroundColor: "#1B7F3A" }}
          >
            <div
              className={`${innerSize} rounded-full ${borderW} flex items-center justify-center font-bold ${numberStyle}`}
              style={{ borderColor: "rgba(255,255,255,0.85)", color: "#fff" }}
            >
              {number}
            </div>
          </div>
        );
      }
      return (
        <div
          className={`${outerSize} ${roundedOuter} flex items-center justify-center shadow-sm`}
          style={{ backgroundColor: "#373737" }}
        >
          <div
            className={`${innerSize} rounded-full ${borderW} flex items-center justify-center font-bold ${numberStyle}`}
            style={{ borderColor: "rgba(255,255,255,0.7)", color: "#fff" }}
          >
            {number}
          </div>
        </div>
      );
    })();

    return (
      <div
        ref={ref}
        className={`flex flex-col items-center gap-0.5 ${onClick ? "cursor-pointer" : ""}`}
        onClick={onClick}
      >
        {slotContent}
        {timeLabel && (
          <span className="text-[11px] font-bold text-white leading-none tracking-wider bg-white/10 px-1.5 py-0.5 rounded-sm">
            {timeLabel}
          </span>
        )}
      </div>
    );
  },
);

Slot.displayName = "Slot";

export default Slot;
