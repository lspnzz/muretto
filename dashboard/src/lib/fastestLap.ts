// Which tyre, and how old, the driver's fastest lap was set on. The best-lap
// lap number comes from the ragged TimingStats; the tyre comes from mapping
// that lap onto the stint history.

import { personalBestLapNumber } from "@/lib/ragged";
import { stintsForDriver } from "@/lib/selectors";
import { stintIndexForLap, stintLapRanges } from "@/lib/stints";
import type { State, Stint } from "@/types";

export type FastestLapTyre = { compound: string; age: number };

/**
 * Tyre compound and age (laps on the set) for the lap on which the driver set
 * their personal best. The lap-to-stint mapping lives in `lib/stints` so this
 * and the stint popup can never disagree. Returns null when the feed hasn't
 * given a best-lap lap number or any stint data.
 */
export function fastestLapTyre(state: State, racingNumber: string): FastestLapTyre | null {
  const lap = personalBestLapNumber(state.TimingStats, racingNumber);
  if (lap == null) return null;

  const stints = stintsForDriver(state, racingNumber);
  const ranges = stintLapRanges(stints);
  const index = stintIndexForLap(ranges, lap);
  if (index == null) return null;

  return tyreAt(stints[index], lap - ranges[index].start + 1);
}

function tyreAt(stint: Stint, lapsInto: number): FastestLapTyre | null {
  const compound = stint.Compound?.toUpperCase() ?? "";
  if (!compound) return null;
  return { compound, age: Math.max(1, (stint.StartLaps ?? 0) + lapsInto) };
}
