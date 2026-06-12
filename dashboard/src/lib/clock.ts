// Session-clock helpers around `ExtrapolatedClock`.

import type { ExtrapolatedClock } from "@/types";

/**
 * Past this age the clock's UTC anchor is from a recording, not a live
 * session — extrapolating against it would just pin the clock to 00:00:00.
 */
const MAX_EXTRAPOLATION_AGE_MS = 6 * 60 * 60 * 1000;

export function parseHms(value: string): number | null {
  const m = value.trim().match(/^(\d+):(\d{2}):(\d{2})$/);
  if (!m) return null;
  return (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000;
}

export function formatHms(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Remaining session time, extrapolated to `now` while the clock runs. */
export function remainingClock(
  clock: ExtrapolatedClock | null | undefined,
  now: number,
): string | null {
  if (!clock?.Remaining) return null;
  const remaining = parseHms(clock.Remaining);
  if (remaining === null) return clock.Remaining;

  const anchor = Date.parse(clock.Utc);
  const elapsed = Number.isFinite(anchor) ? now - anchor : Number.POSITIVE_INFINITY;
  if (!clock.Extrapolating || elapsed < 0 || elapsed > MAX_EXTRAPOLATION_AGE_MS) {
    return formatHms(remaining);
  }
  return formatHms(remaining - elapsed);
}
