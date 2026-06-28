// Derive view-model rows from the typed state. Keeps PascalCase field access in
// one place so components stay tidy.

import { bestSectorPosition, bestSectorValue } from "@/lib/ragged";
import type { Driver, LapVal, State, Stint, TimingDataDriver } from "@/types";

export type DriverLap = { lap: number; val: LapVal };

type DriverRow = {
  racingNumber: string;
  driver?: Driver;
  timing?: TimingDataDriver;
  position: number;
};

export type FastestSectorLeader = {
  sector: number;
  racingNumber: string;
  label: string;
  color: string;
  value: string | null;
};

const TIMING_SECTOR_COUNT = 3;
const FALLBACK_TEAM_COLOR = "#a1a1aa";

/**
 * Broadcast-style surname for the timing tower (casing styled in CSS).
 * Falls back through the name fields a sparse feed may omit.
 */
export function displayName(driver: Driver | undefined, racingNumber: string): string {
  if (!driver) return racingNumber;
  return (
    driver.LastName ||
    driver.FullName?.split(" ").slice(1).join(" ") ||
    driver.BroadcastName?.replace(/^[A-Z]\.?\s+/, "") ||
    driver.Tla ||
    racingNumber
  );
}

/** Three-letter timing-tower label: the driver's surname squashed to 3 caps. */
export function shortDriverName(name: string): string {
  return name.replace(/\s+/g, "").slice(0, 3).toUpperCase();
}

/** Drivers ordered by current timing position (falling back to grid line). */
export function orderedDrivers(state: State): DriverRow[] {
  const drivers = state.DriverList ?? {};
  const lines = state.TimingData?.Lines ?? {};

  const rows = Object.keys(drivers).map((num) => {
    const timing = lines[num];
    const position = timing
      ? Number(timing.Position) || timing.Line || 999
      : (drivers[num]?.Line ?? 999);
    return { racingNumber: num, driver: drivers[num], timing, position };
  });

  rows.sort((a, b) => a.position - b.position);
  return rows;
}

/** Current stint for a car (last stint), if known. */
export function currentStint(state: State, racingNumber: string): Stint | undefined {
  return stintsForDriver(state, racingNumber).at(-1);
}

/** Stint history for a car, sorted by stint index. */
export function stintsForDriver(state: State, racingNumber: string): Stint[] {
  const stints = state.TimingAppData?.Lines?.[racingNumber]?.Stints;
  if (!stints) return [];

  return Object.entries(stints)
    .sort(([left], [right]) => Number(left) - Number(right))
    .flatMap(([, stint]) => (stint ? [stint] : []));
}

/** Best-effort stop count derived from stint count; the feed does not expose it directly. */
export function pitCount(state: State, racingNumber: string): number {
  return Math.max(0, stintsForDriver(state, racingNumber).length - 1);
}

/** A driver's accumulated lap times (lib/stints maps them to stints), oldest first. */
export function driverLaps(state: State, racingNumber: string): DriverLap[] {
  const laps = state.LapHistory?.[racingNumber];
  if (!laps) return [];
  return Object.keys(laps)
    .map(Number)
    .filter((lap) => Number.isFinite(lap))
    .sort((a, b) => a - b)
    .flatMap((lap) => {
      const val = laps[String(lap)];
      return val ? [{ lap, val }] : [];
    });
}

/** Session-best timing-sector holders, coloured by their team/car colour. */
export function fastestSectorLeaders(state: State): FastestSectorLeader[] {
  const rows = orderedDrivers(state);

  return Array.from({ length: TIMING_SECTOR_COUNT }, (_, sector) => {
    const row = rows.find(
      (candidate) => bestSectorPosition(state.TimingStats, candidate.racingNumber, sector) === 1,
    );
    if (!row) return null;

    return {
      sector,
      racingNumber: row.racingNumber,
      label: row.driver?.Tla || row.racingNumber,
      color: row.driver?.TeamColour ? `#${row.driver.TeamColour}` : FALLBACK_TEAM_COLOR,
      value: bestSectorValue(state.TimingStats, row.racingNumber, sector),
    };
  }).filter((leader): leader is FastestSectorLeader => Boolean(leader));
}
