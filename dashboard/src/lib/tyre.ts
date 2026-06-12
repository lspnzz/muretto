export const TYRE_COLOR: Record<string, string> = {
  SOFT: "text-red-500",
  MEDIUM: "text-yellow-400",
  HARD: "text-zinc-200",
  INTERMEDIATE: "text-green-500",
  WET: "text-blue-500",
};

/** Compound ring colours (Pirelli sidewall convention). */
export const TYRE_HEX: Record<string, string> = {
  SOFT: "#F12F32",
  MEDIUM: "#FBCC1C",
  HARD: "#E4E4E7",
  INTERMEDIATE: "#128330",
  WET: "#1F6DA1",
};

export const TYRE_HEX_FALLBACK = "#52525B";

export function tyreHex(compound: string | null | undefined): string {
  return (compound && TYRE_HEX[compound.toUpperCase()]) || TYRE_HEX_FALLBACK;
}
