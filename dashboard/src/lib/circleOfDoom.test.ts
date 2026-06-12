import { describe, expect, it } from "vitest";

import {
  behindDeg,
  cumulativeGaps,
  isLappedGap,
  parseTimeMs,
  pointFor,
  rejoinRange,
} from "./circleOfDoom";

describe("parseTimeMs", () => {
  it("parses lap times, gaps, and bare seconds", () => {
    expect(parseTimeMs("1:31.375")).toBe(91_375);
    expect(parseTimeMs("31.375")).toBe(31_375);
    expect(parseTimeMs("+1.234")).toBe(1_234);
    expect(parseTimeMs("+1.2")).toBe(1_200);
    expect(parseTimeMs("8")).toBe(8_000);
  });

  it("rejects blanks and lap-count gaps", () => {
    expect(parseTimeMs("")).toBeNull();
    expect(parseTimeMs(undefined)).toBeNull();
    expect(parseTimeMs("1 L")).toBeNull();
    expect(parseTimeMs("LAP 12")).toBeNull();
  });
});

describe("isLappedGap", () => {
  it("detects lap-count gaps only", () => {
    expect(isLappedGap("1 L")).toBe(true);
    expect(isLappedGap("+2L")).toBe(true);
    expect(isLappedGap("+12.345")).toBe(false);
    expect(isLappedGap("")).toBe(false);
  });
});

describe("cumulativeGaps", () => {
  const line = (nr: string, gap: string, interval: string) => ({
    RacingNumber: nr,
    Position: "",
    GapToLeader: gap,
    IntervalToPositionAhead: { Value: interval, Catching: false },
    InPit: false,
  });

  it("uses direct gaps when parseable", () => {
    const gaps = cumulativeGaps([
      line("44", "", ""),
      line("16", "+1.234", "+1.234"),
      line("1", "+8.512", "+7.278"),
    ]);
    expect(gaps.get("44")).toEqual({ gapMs: 0, lapped: false });
    expect(gaps.get("16")).toEqual({ gapMs: 1_234, lapped: false });
    expect(gaps.get("1")).toEqual({ gapMs: 8_512, lapped: false });
  });

  it("chains intervals for lapped cars", () => {
    const gaps = cumulativeGaps([
      line("44", "", ""),
      line("1", "+80.000", "+80.000"),
      line("14", "1 L", "+18.404"),
    ]);
    expect(gaps.get("14")).toEqual({ gapMs: 98_404, lapped: true });
  });

  it("falls back when even the interval is unreadable", () => {
    const gaps = cumulativeGaps([
      line("44", "", ""),
      line("14", "1 L", "1 L"),
    ]);
    expect(gaps.get("14")?.gapMs).toBe(120_000);
  });
});

describe("ring geometry", () => {
  it("wraps lapped gaps around the ring", () => {
    // 100s behind on a 90s lap = 10s into the next lap = 40 degrees behind.
    expect(behindDeg(100_000, 90_000)).toBeCloseTo(40);
  });

  it("puts a quarter-lap-behind car at 9 o'clock", () => {
    const { x, y } = pointFor(90, 50, 50, 40);
    expect(x).toBeCloseTo(10);
    expect(y).toBeCloseTo(50);
  });

  it("keeps the leader at 12 o'clock", () => {
    const { x, y } = pointFor(0, 50, 50, 40);
    expect(x).toBeCloseTo(50);
    expect(y).toBeCloseTo(10);
  });
});

describe("rejoinRange", () => {
  it("predicts where the car comes out after the stop", () => {
    const gaps = new Map([
      ["44", { gapMs: 0, lapped: false }],
      ["16", { gapMs: 1_200, lapped: false }],
      ["1", { gapMs: 8_500, lapped: false }],
      ["4", { gapMs: 15_900, lapped: false }],
      ["14", { gapMs: 98_400, lapped: true }],
    ]);
    // Leader pits, 20s loss: window 19–22s — behind 1/16/4, ahead of 14.
    expect(rejoinRange(gaps, "44", 20_000)).toEqual({ best: 4, worst: 4 });
    // A 21s loss with cars at 19.5 and 22.5 spans two outcomes.
    const tight = new Map([
      ["44", { gapMs: 0, lapped: false }],
      ["16", { gapMs: 19_500, lapped: false }],
      ["1", { gapMs: 22_500, lapped: false }],
    ]);
    expect(rejoinRange(tight, "44", 21_000)).toEqual({ best: 2, worst: 3 });
  });

  it("is null for unknown cars", () => {
    expect(rejoinRange(new Map(), "44", 20_000)).toBeNull();
  });
});
