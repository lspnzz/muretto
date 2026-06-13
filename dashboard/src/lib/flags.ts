// Flag state for the track map.
//
// The feed has no "current flags" topic: `TrackStatus` carries the whole-track
// mode (yellow / SC / VSC / red), and *where* a yellow lives only exists in
// `RaceControlMessages` — an append-only log of marshal-sector flag events
// ("YELLOW IN TRACK SECTOR 7", then "CLEAR IN TRACK SECTOR 7"). Replaying that
// log yields the set of currently-yellow marshal sectors; the snapshot carries
// the full session log, so a replay is correct from any join point.

import type { Message, RaceControlMessages } from "@/types";

export type SectorFlag = "yellow" | "double-yellow";

export type YellowState = {
  /** Marshal-sector number → strongest active flag in that sector. */
  sectors: Map<number, SectorFlag>;
  /** A track-scoped yellow with no sector — paint the whole outline. */
  trackWide: boolean;
};

export type TrackMapFlags =
  | { kind: "clear" }
  | ({ kind: "yellow" } & YellowState)
  | { kind: "sc" }
  | { kind: "vsc" }
  | { kind: "vsc-ending" }
  | { kind: "red" };

/**
 * Whole-track mode comes from `TrackStatus.Status`; sector detail only matters
 * in the yellow states. Gating on the status (not just the message log) means
 * a missed CLEAR message can't leave a stale yellow on screen once race
 * control declares the track clear.
 */
export function trackMapFlags(
  status: string | null | undefined,
  messages: RaceControlMessages | null | undefined,
): TrackMapFlags {
  switch (status) {
    case "5":
      return { kind: "red" };
    case "4":
      return { kind: "sc" };
    case "6":
      return { kind: "vsc" };
    case "7":
      return { kind: "vsc-ending" };
    case "2":
    case "3":
      return { kind: "yellow", ...deriveYellowSectors(messages) };
    default:
      return { kind: "clear" };
  }
}

/** Replay the race-control log into the currently-active yellow sectors. */
export function deriveYellowSectors(
  messages: RaceControlMessages | null | undefined,
): YellowState {
  const sectors = new Map<number, SectorFlag>();
  let trackWide = false;

  for (const msg of orderedMessages(messages)) {
    const flag = msg.Flag?.toUpperCase();
    if (!flag) continue;

    if (msg.Sector != null) {
      if (flag === "YELLOW") sectors.set(msg.Sector, "yellow");
      else if (flag === "DOUBLE YELLOW") sectors.set(msg.Sector, "double-yellow");
      else if (flag === "CLEAR") sectors.delete(msg.Sector);
    } else if (msg.Scope === "Track") {
      if (flag === "YELLOW" || flag === "DOUBLE YELLOW") {
        trackWide = true;
      } else if (flag === "GREEN" || flag === "CLEAR" || flag === "CHEQUERED") {
        sectors.clear();
        trackWide = false;
      }
    }
  }

  return { sectors, trackWide };
}

/**
 * Message keys are feed array indices ("0", "1", … "10"); sort numerically so
 * "10" replays after "9", not between "1" and "2".
 */
function orderedMessages(messages: RaceControlMessages | null | undefined): Message[] {
  return Object.entries(messages?.Messages ?? {})
    .filter((entry): entry is [string, Message] => Boolean(entry[1]))
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, msg]) => msg);
}

export type MarshalSector = {
  number: number;
  trackPosition: { x: number; y: number };
};

/** A marshal sector as a run of outline indices: `start`..`end`, inclusive. */
export type SectorSegment = {
  number: number;
  start: number;
  end: number;
};

/**
 * Split the circuit outline into marshal-sector segments. Each sector's
 * `trackPosition` snaps to its nearest outline point; the sector runs from
 * there to the next sector's point (the last wraps to the first). Index
 * ranges — not points — so callers can slice the outline *after* rotating
 * and projecting it.
 */
export function marshalSegments(
  outline: ReadonlyArray<{ x: number; y: number }>,
  sectors: ReadonlyArray<MarshalSector> | undefined,
): SectorSegment[] {
  if (!sectors || sectors.length < 2 || outline.length === 0) return [];

  const ordered = [...sectors].sort((a, b) => a.number - b.number);
  const starts = ordered.map((sector) => nearestIndex(outline, sector.trackPosition));

  return ordered.map((sector, i) => ({
    number: sector.number,
    start: starts[i],
    end: starts[(i + 1) % starts.length],
  }));
}

/** Slice a segment out of the outline, wrapping past the array end. */
export function sliceSegment<T>(points: T[], segment: SectorSegment): T[] {
  if (segment.start <= segment.end) return points.slice(segment.start, segment.end + 1);
  return [...points.slice(segment.start), ...points.slice(0, segment.end + 1)];
}

function nearestIndex(
  points: ReadonlyArray<{ x: number; y: number }>,
  target: { x: number; y: number },
): number {
  let best = 0;
  let bestDistance = Infinity;
  points.forEach((point, i) => {
    const distance = (point.x - target.x) ** 2 + (point.y - target.y) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  });
  return best;
}
