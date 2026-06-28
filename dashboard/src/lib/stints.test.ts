import { describe, expect, it } from "vitest";

import type { Stint } from "@/types";
import { stintIndexForLap, stintLapRanges } from "./stints";

function stint(totalLaps: number, startLaps = 0): Stint {
  return { Compound: "SOFT", TotalLaps: totalLaps, StartLaps: startLaps, New: "TRUE" };
}

describe("stintLapRanges", () => {
  it("spans back-to-back stints over consecutive laps", () => {
    // stint 0 = laps 1-10, stint 1 = laps 11-18.
    expect(stintLapRanges([stint(10), stint(8)])).toEqual([
      { start: 1, end: 10, driven: 10 },
      { start: 11, end: 18, driven: 8 },
    ]);
  });

  it("excludes carried-over age of a used set from the driven count", () => {
    // started 3 laps old, ran 5 laps (1-5).
    expect(stintLapRanges([stint(8, 3)])).toEqual([{ start: 1, end: 5, driven: 5 }]);
  });

  it("represents a stint with no laps run as an empty span", () => {
    const [first, second] = stintLapRanges([stint(10), stint(10, 10)]);
    expect(first).toEqual({ start: 1, end: 10, driven: 10 });
    expect(second.driven).toBe(0);
    expect(second.end).toBeLessThan(second.start);
  });
});

describe("stintIndexForLap", () => {
  const ranges = stintLapRanges([stint(10), stint(8)]);

  it("locates the stint a lap falls in", () => {
    expect(stintIndexForLap(ranges, 5)).toBe(0);
    expect(stintIndexForLap(ranges, 14)).toBe(1);
  });

  it("matches the stint boundaries", () => {
    expect(stintIndexForLap(ranges, 10)).toBe(0);
    expect(stintIndexForLap(ranges, 11)).toBe(1);
  });

  it("attributes a lap past all coverage to the latest run stint", () => {
    expect(stintIndexForLap(ranges, 20)).toBe(1);
  });

  it("skips empty stints when falling back", () => {
    const withEmptyTail = stintLapRanges([stint(10), stint(10, 10)]);
    expect(stintIndexForLap(withEmptyTail, 20)).toBe(0);
  });

  it("returns null without a lap number", () => {
    expect(stintIndexForLap(ranges, null)).toBeNull();
  });

  it("returns null with no stints", () => {
    expect(stintIndexForLap([], 5)).toBeNull();
  });
});
