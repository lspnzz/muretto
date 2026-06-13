import type { PositionEntry } from "@/types/PositionEntry";

export type OpenF1Location = {
  date: string;
  driver_number: number;
  x: number;
  y: number;
  z: number;
};

type ParsedLocation = OpenF1Location & {
  utcMs: number;
};

/** Latest OpenF1 location sample per driver, normalized to the F1 Position shape. */
export function positionEntryFromOpenF1(rows: readonly unknown[]): PositionEntry | null {
  const latestByDriver = new Map<string, ParsedLocation>();

  for (const row of rows) {
    const parsed = parseLocation(row);
    if (!parsed) continue;

    const racingNumber = String(parsed.driver_number);
    const previous = latestByDriver.get(racingNumber);
    if (!previous || parsed.utcMs > previous.utcMs) {
      latestByDriver.set(racingNumber, parsed);
    }
  }

  if (latestByDriver.size === 0) return null;

  const entries: PositionEntry["Entries"] = {};
  let timestampMs = 0;
  for (const [racingNumber, row] of latestByDriver) {
    timestampMs = Math.max(timestampMs, row.utcMs);
    entries[racingNumber] = {
      Status: "OnTrack",
      X: row.x,
      Y: row.y,
      Z: row.z,
    };
  }

  return {
    Timestamp: new Date(timestampMs).toISOString(),
    Entries: entries,
  };
}

function parseLocation(row: unknown): ParsedLocation | null {
  if (!row || typeof row !== "object") return null;

  const candidate = row as Partial<OpenF1Location>;
  const { date, driver_number, x, y, z } = candidate;
  const utcMs = typeof date === "string" ? Date.parse(date) : NaN;
  if (
    typeof date !== "string" ||
    !Number.isFinite(utcMs) ||
    typeof driver_number !== "number" ||
    !Number.isInteger(driver_number) ||
    typeof x !== "number" ||
    !Number.isFinite(x) ||
    typeof y !== "number" ||
    !Number.isFinite(y) ||
    typeof z !== "number" ||
    !Number.isFinite(z)
  ) {
    return null;
  }

  return { date, driver_number, x, y, z, utcMs };
}
