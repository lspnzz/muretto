// Math for the circle of doom (docs/references/strategy-screens.md): the ring
// is one reference lap in the time domain, leader pinned at 12 o'clock,
// direction of travel clockwise — a car g ms behind sits g/L of a turn
// counter-clockwise. All pure functions so the geometry is unit-testable.

import type { State, TimingDataDriver } from "@/types";

export type RingEntry = {
  racingNumber: string;
  tla: string;
  colour: string;
  position: number;
  /** Unwrapped cumulative gap to the leader, ms. */
  gapMs: number;
  lapped: boolean;
  inPit: boolean;
  /** Degrees behind the leader along the ring, normalized to [0, 360). */
  behindDeg: number;
};

/** Fallback when no lap time is known yet (a generic ~90s lap). */
export const FALLBACK_LAP_MS = 90_000;

/** Used when a lapped car's interval is unreadable (UF1 does the same). */
const UNKNOWN_INTERVAL_MS = 120_000;

/**
 * Parse a feed time string to ms: "1:31.375", "31.375", "+1.234", "8".
 * Returns null for blanks and non-times ("1 L", "LAP 12").
 */
export function parseTimeMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = value.trim().replace(/^\+/, "").match(/^(?:(\d+):)?(\d+)(?:\.(\d{1,3}))?$/);
  if (!m) return null;
  const minutes = m[1] ? Number(m[1]) : 0;
  const ms = m[3] ? Number(`${m[3]}000`.slice(0, 3)) : 0;
  return (minutes * 60 + Number(m[2])) * 1000 + ms;
}

/** "+1 L", "1L", "2 LAP" style gaps mean the car is lapped. */
export function isLappedGap(value: string | null | undefined): boolean {
  return Boolean(value && /\d+\s*L/i.test(value));
}

type Line = Pick<
  TimingDataDriver,
  "RacingNumber" | "Position" | "GapToLeader" | "IntervalToPositionAhead" | "InPit"
>;

export type GapInfo = { gapMs: number; lapped: boolean };

/**
 * Rebuild every car's unwrapped gap to the leader. Direct `GapToLeader`
 * values are used when parseable; lapped cars ("1 L") fall back to the
 * interval chain `gap_i = gap_{i-1} + interval_i`.
 */
export function cumulativeGaps(linesByPosition: Line[]): Map<string, GapInfo> {
  const gaps = new Map<string, GapInfo>();
  let previous = 0;

  linesByPosition.forEach((line, index) => {
    if (index === 0) {
      gaps.set(line.RacingNumber, { gapMs: 0, lapped: false });
      return;
    }
    const direct = parseTimeMs(line.GapToLeader);
    const lapped = isLappedGap(line.GapToLeader);
    const interval = parseTimeMs(line.IntervalToPositionAhead?.Value);
    const gapMs = direct ?? previous + (interval ?? UNKNOWN_INTERVAL_MS);
    gaps.set(line.RacingNumber, { gapMs, lapped });
    previous = gapMs;
  });

  return gaps;
}

/** Leader's last lap, else leader's best, else any best, else 90s. */
export function referenceLapMs(state: State): number {
  const lines = Object.values(state.TimingData?.Lines ?? {}).filter(
    (l): l is TimingDataDriver => Boolean(l),
  );
  const leader = lines.find((l) => l.Position === "1");
  const candidates = [
    leader?.LastLapTime?.Value,
    leader?.BestLapTime?.Value,
    ...lines.map((l) => l.BestLapTime?.Value),
  ];
  for (const value of candidates) {
    const ms = parseTimeMs(value);
    if (ms && ms > 30_000) return ms;
  }
  return FALLBACK_LAP_MS;
}

/** Degrees behind the leader for a gap, wrapped to one lap. */
export function behindDeg(gapMs: number, refLapMs: number): number {
  const frac = (gapMs % refLapMs) / refLapMs;
  return ((frac * 360) % 360 + 360) % 360;
}

/**
 * Screen coordinates for a point `behind` degrees behind 12 o'clock, with
 * travel clockwise (so "behind" extends counter-clockwise).
 */
export function pointFor(behind: number, cx: number, cy: number, r: number) {
  const rad = ((360 - behind) % 360) * (Math.PI / 180);
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

/** SVG arc path along radius `r` between two behind-degrees (small arcs only). */
export function arcPath(
  fromBehind: number,
  toBehind: number,
  cx: number,
  cy: number,
  r: number,
): string {
  const start = pointFor(fromBehind, cx, cy, r);
  const end = pointFor(toBehind, cx, cy, r);
  return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${r} ${r} 0 0 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
}

/**
 * Predicted rejoin positions if `racingNumber` pits now: the ghost gap is
 * inserted into the others' sorted gaps with the window's best/worst bounds
 * (−1s / +2s around the loss — see the reference doc).
 */
export function rejoinRange(
  gaps: Map<string, GapInfo>,
  racingNumber: string,
  pitLossMs: number,
): { best: number; worst: number } | null {
  const self = gaps.get(racingNumber);
  if (!self) return null;
  const others = [...gaps.entries()]
    .filter(([nr]) => nr !== racingNumber)
    .map(([, info]) => info.gapMs);

  const positionFor = (ghostGap: number) =>
    others.filter((gap) => gap < ghostGap).length + 1;

  return {
    best: positionFor(self.gapMs + pitLossMs - 1_000),
    worst: positionFor(self.gapMs + pitLossMs + 2_000),
  };
}
