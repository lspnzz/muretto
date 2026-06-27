// Safe readers for the deliberately-loose topics (`TimingStats`, `TeamRadio`
// — core belief 8). The feed sends positional collections as arrays in
// snapshots and as index-keyed objects in deltas, and the generic JSON merge
// can leave either shape behind, so every accessor accepts both.

import type { JsonValue } from "@/types/serde_json/JsonValue";

type Dict = { [key: string]: unknown };

function isDict(value: unknown): value is Dict {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Entries of an array-or-index-keyed-object collection, in index order. */
export function listEntries(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (isDict(value)) {
    return Object.keys(value)
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => value[key]);
  }
  return [];
}

/** Entry at a positional index, honouring sparse index-keyed objects. */
export function entryAt(value: unknown, index: number): unknown {
  if (Array.isArray(value)) return value[index];
  if (isDict(value)) return value[String(index)];
  return undefined;
}

/**
 * Feed UTC (epoch ms) when `SessionStatus` last flipped to "Started", from
 * `SessionData.StatusSeries`. Last wins so a red-flag restart re-anchors.
 */
export function sessionStartedUtcMs(sessionData: JsonValue | null | undefined): number | null {
  if (!isDict(sessionData)) return null;
  let started: number | null = null;
  for (const entry of listEntries(sessionData["StatusSeries"])) {
    if (!isDict(entry) || entry["SessionStatus"] !== "Started") continue;
    const utc = typeof entry["Utc"] === "string" ? Date.parse(entry["Utc"]) : Number.NaN;
    if (Number.isFinite(utc)) started = utc;
  }
  return started;
}

export type RadioCapture = { utc: string; racingNumber: string; path: string };

/** Team radio captures, oldest first. */
export function teamRadioCaptures(teamRadio: JsonValue | null | undefined): RadioCapture[] {
  if (!isDict(teamRadio)) return [];
  return listEntries(teamRadio["Captures"]).flatMap((entry) => {
    if (!isDict(entry)) return [];
    const utc = entry["Utc"];
    const racingNumber = entry["RacingNumber"];
    const path = entry["Path"];
    if (typeof utc !== "string" || typeof racingNumber !== "string" || typeof path !== "string") {
      return [];
    }
    return [{ utc, racingNumber, path }];
  });
}

function statsLine(timingStats: JsonValue | null | undefined, racingNumber: string): Dict | null {
  if (!isDict(timingStats)) return null;
  const lines = timingStats["Lines"];
  if (!isDict(lines)) return null;
  const line = lines[racingNumber];
  return isDict(line) ? line : null;
}

/** Rank of the driver's personal-best lap (1 = overall fastest), if known. */
export function personalBestLapPosition(
  timingStats: JsonValue | null | undefined,
  racingNumber: string,
): number | null {
  const best = statsLine(timingStats, racingNumber)?.["PersonalBestLapTime"];
  if (!isDict(best)) return null;
  return typeof best["Position"] === "number" ? best["Position"] : null;
}

/** Lap number on which the driver set their personal-best lap, if known. */
export function personalBestLapNumber(
  timingStats: JsonValue | null | undefined,
  racingNumber: string,
): number | null {
  const best = statsLine(timingStats, racingNumber)?.["PersonalBestLapTime"];
  if (!isDict(best)) return null;
  const lap = best["Lap"];
  return typeof lap === "number" && lap > 0 ? lap : null;
}

/** Rank of the driver's best time in a sector (0-based index), if known. */
export function bestSectorPosition(
  timingStats: JsonValue | null | undefined,
  racingNumber: string,
  sector: number,
): number | null {
  const entry = entryAt(statsLine(timingStats, racingNumber)?.["BestSectors"], sector);
  if (!isDict(entry)) return null;
  return typeof entry["Position"] === "number" ? entry["Position"] : null;
}

/** The driver's best time in a sector (0-based index), if known. */
export function bestSectorValue(
  timingStats: JsonValue | null | undefined,
  racingNumber: string,
  sector: number,
): string | null {
  const entry = entryAt(statsLine(timingStats, racingNumber)?.["BestSectors"], sector);
  if (!isDict(entry)) return null;
  return typeof entry["Value"] === "string" && entry["Value"] ? entry["Value"] : null;
}
