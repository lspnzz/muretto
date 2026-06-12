// Broadcast-sync helpers: derive the replay delay from what the user sees on
// TV — "lights out just happened" or "the clock shows 12:34 left" — instead
// of dialing raw seconds. Pure functions; wall-clock time comes in as args.

import type { ExtrapolatedClock } from "@/types";
import { MAX_EXTRAPOLATION_AGE_MS, parseHms } from "./clock";

/**
 * The most recent *live* (undelayed) session clock. `receivedAt` is the wall
 * receipt time of the streamed update that carried it — the trustworthy
 * anchor, immune to local-clock skew and meaningful even for replayed
 * recordings. It is null when the clock only came from the subscribe
 * snapshot, where the feed-side `Utc` stamp is all there is to anchor on.
 */
export type ClockAnchor = {
  clock: ExtrapolatedClock;
  receivedAt: number | null;
};

/** Local-clock skew tolerance when anchoring on the feed's `Utc` stamp. */
const UTC_ANCHOR_SLACK_MS = 60_000;

/** "12:34" or "1:02:03" (what a TV session clock shows) → ms, else null. */
export function parseRemainingInput(text: string): number | null {
  const m = text.trim().match(/^(\d+):([0-5]\d)(?::([0-5]\d))?$/);
  if (!m) return null;
  const [h, min, s] =
    m[3] === undefined ? [0, Number(m[1]), Number(m[2])] : [Number(m[1]), Number(m[2]), Number(m[3])];
  return (h * 3600 + min * 60 + s) * 1000;
}

/**
 * "15:03:07" / "15:03" as local time of day → epoch ms, picking the
 * occurrence nearest `ref` so times typed around midnight don't jump a day.
 */
export function parseWallClockInput(text: string, ref: number): number | null {
  const m = text.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (!m) return null;
  const base = new Date(ref);
  return [-1, 0, 1]
    .map((day) =>
      new Date(
        base.getFullYear(),
        base.getMonth(),
        base.getDate() + day,
        Number(m[1]),
        Number(m[2]),
        Number(m[3] ?? 0),
      ).getTime(),
    )
    .reduce((best, t) => (Math.abs(t - ref) < Math.abs(best - ref) ? t : best));
}

/**
 * The live session time remaining at `now`, or null when there is nothing to
 * sync against: no clock yet, clock paused (red flag — remaining isn't
 * advancing, so no delay can be solved for), or an anchor too old to be from
 * this session.
 */
export function liveRemainingMs(anchor: ClockAnchor | null | undefined, now: number): number | null {
  if (!anchor?.clock.Extrapolating) return null;
  const remaining = parseHms(anchor.clock.Remaining);
  if (remaining === null) return null;
  const from = anchorInstant(anchor);
  const elapsed = now - from;
  if (!Number.isFinite(elapsed) || elapsed < -UTC_ANCHOR_SLACK_MS || elapsed > MAX_EXTRAPOLATION_AGE_MS) {
    return null;
  }
  return remaining - Math.max(0, elapsed);
}

/**
 * The instant `Remaining` was true. Receipt time normally wins (skew-free,
 * and the only meaningful stamp for replayed recordings, whose `Utc` is
 * ancient) — but a clock that rides a mid-stream full snapshot (upstream
 * reconnect) carries content minutes older than its arrival, which the
 * feed's own live-ish `Utc` stamp dates honestly.
 */
function anchorInstant({ clock, receivedAt }: ClockAnchor): number {
  const utc = Date.parse(clock.Utc);
  if (receivedAt === null) return utc;
  const staleness = receivedAt - utc;
  const snapshotBorne =
    Number.isFinite(staleness) && staleness > UTC_ANCHOR_SLACK_MS && staleness <= MAX_EXTRAPOLATION_AGE_MS;
  return snapshotBorne ? utc : receivedAt;
}

/**
 * The delay that makes the rendered session clock match the TV's: the TV
 * trails live, so its remaining is larger by exactly the broadcast delay.
 */
export function delayFromTvRemaining(
  anchor: ClockAnchor | null | undefined,
  tvRemainingMs: number,
  now: number,
): number | null {
  const live = liveRemainingMs(anchor, now);
  return live === null ? null : tvRemainingMs - live;
}

/** The delay that makes the rendered session start coincide with the TV's. */
export function delayFromSessionStart(startedAtMs: number, tvStartedAtMs: number): number {
  return tvStartedAtMs - startedAtMs;
}

/** Clamp a derived delay to what the snapshot buffer can actually serve. */
export function clampDelay(delayMs: number, maxDelayMs: number): number {
  return Math.min(Math.max(0, Math.round(delayMs)), maxDelayMs);
}
