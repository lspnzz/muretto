// `TrackStatus.Status` display map (codes per docs/references/strategy-screens.md).

export type TrackStatusStyle = {
  label: string;
  /** Tailwind background class for pills/dots. */
  bg: string;
  /** Raw colour for glows and SVG strokes. */
  hex: string;
};

export const TRACK_STATUS: Record<string, TrackStatusStyle> = {
  "1": { label: "Track clear", bg: "bg-emerald-500", hex: "#10b981" },
  "2": { label: "Yellow flag", bg: "bg-amber-400", hex: "#fbbf24" },
  "3": { label: "Flag", bg: "bg-amber-400", hex: "#fbbf24" },
  "4": { label: "Safety car", bg: "bg-amber-400", hex: "#fbbf24" },
  "5": { label: "Red flag", bg: "bg-red-500", hex: "#ef4444" },
  "6": { label: "VSC deployed", bg: "bg-amber-400", hex: "#fbbf24" },
  "7": { label: "VSC ending", bg: "bg-amber-400", hex: "#fbbf24" },
};

export function trackStatusStyle(status: string | null | undefined): TrackStatusStyle | null {
  if (!status) return null;
  return TRACK_STATUS[status] ?? null;
}

/** True while a (virtual) safety car makes the cheaper pit window apply. */
export function isVscOrSc(status: string | null | undefined): boolean {
  return status === "4" || status === "6" || status === "7";
}
