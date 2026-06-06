// Derive view-model rows from the typed state. Keeps PascalCase field access in
// one place so components stay tidy.

import type { CarChannels, Driver, State, Stint, TimingDataDriver } from "@/types";

export type DriverRow = {
  racingNumber: string;
  driver?: Driver;
  timing?: TimingDataDriver;
  position: number;
};

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

/** Latest telemetry channels for a car, if any. */
export function telemetry(state: State, racingNumber: string): CarChannels | undefined {
  const entries = state.CarData?.Entries;
  if (!entries || entries.length === 0) return undefined;
  return entries[entries.length - 1]?.Cars?.[racingNumber]?.Channels;
}

/** Current tyre compound for a car (last stint), if known. */
export function currentTyre(state: State, racingNumber: string): string | undefined {
  return currentStint(state, racingNumber)?.Compound || undefined;
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

/** Current stint lap count for a car, if known. */
export function stintLaps(state: State, racingNumber: string): number | undefined {
  return currentStint(state, racingNumber)?.TotalLaps ?? undefined;
}

/** Best-effort stop count derived from stint count; the feed does not expose it directly. */
export function pitCount(state: State, racingNumber: string): number {
  return Math.max(0, stintsForDriver(state, racingNumber).length - 1);
}
