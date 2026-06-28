// Map stints onto race-lap spans so a lap number can be traced back to the
// stint it was run in (e.g. which stint holds the driver's fastest lap). Shares
// its arithmetic with fastestLapTyre: stints run back-to-back, so stint k owns
// laps `[start, start + driven)` where `driven = TotalLaps - StartLaps` (laps
// actually run, excluding age carried over from a used set).

import type { Stint } from "@/types";

export type LapRange = { start: number; end: number; driven: number };

/** Race-lap span each stint covers, in stint order. */
export function stintLapRanges(stints: Stint[]): LapRange[] {
  let start = 1;
  return stints.map((stint) => {
    const carried = stint.StartLaps ?? 0;
    const driven = Math.max(0, (stint.TotalLaps ?? 0) - carried);
    const range = { start, end: start + driven - 1, driven };
    start += driven;
    return range;
  });
}

/**
 * Index of the stint a race-lap number falls in, or null if unknown. Stint
 * totals can lag the live best lap by a frame, so a lap past all coverage is
 * attributed to the most recent stint that has actually run laps.
 */
export function stintIndexForLap(ranges: LapRange[], lap: number | null): number | null {
  if (lap == null) return null;
  for (let i = 0; i < ranges.length; i++) {
    if (ranges[i].driven > 0 && lap >= ranges[i].start && lap <= ranges[i].end) return i;
  }
  for (let i = ranges.length - 1; i >= 0; i--) {
    if (ranges[i].driven > 0) return i;
  }
  return null;
}
