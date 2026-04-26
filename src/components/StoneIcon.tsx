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

export default function StoneIcon({
  roll,
  size,
  className,
  alt = "",
}: StoneIconProps) {
  return (
    <img
      src={getStoneAsset(roll)}
      alt={alt}
      draggable={false}
      className={className}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}