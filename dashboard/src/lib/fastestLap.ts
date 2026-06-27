// Which tyre, and how old, the driver's fastest lap was set on. The best-lap
// lap number comes from the ragged TimingStats; the tyre comes from mapping
// that lap onto the stint history.

import { personalBestLapNumber } from "@/lib/ragged";
import { stintsForDriver } from "@/lib/selectors";
import type { State, Stint } from "@/types";

export type FastestLapTyre = { compound: string; age: number };

/**
 * Tyre compound and age (laps on the set) for the lap on which the driver set
 * their personal best. Stints run back-to-back, so stint k covers race laps
 * `[start, start + driven)` where `driven = TotalLaps - StartLaps` (the laps
 * actually run this stint, excluding age carried over from a used set). Returns
 * null when the feed hasn't given a best-lap lap number or any stint data.
 */
export function fastestLapTyre(state: State, racingNumber: string): FastestLapTyre | null {
  const lap = personalBestLapNumber(state.TimingStats, racingNumber);
  if (lap == null) return null;

  const stints = stintsForDriver(state, racingNumber);

  let start = 1;
  let last: { stint: Stint; start: number } | null = null;
  for (const stint of stints) {
    const carried = stint.StartLaps ?? 0;
    const driven = Math.max(0, (stint.TotalLaps ?? 0) - carried);
    if (driven === 0) continue;
    last = { stint, start };
    if (lap <= start + driven - 1) return tyreAt(stint, lap - start + 1);
    start += driven;
  }

  // Stint totals can lag the live best lap by a frame; attribute a still-newer
  // best lap to the most recent stint that has run laps.
  return last ? tyreAt(last.stint, lap - last.start + 1) : null;
}

function tyreAt(stint: Stint, lapsInto: number): FastestLapTyre | null {
  const compound = stint.Compound?.toUpperCase() ?? "";
  if (!compound) return null;
  return { compound, age: Math.max(1, (stint.StartLaps ?? 0) + lapsInto) };
}
