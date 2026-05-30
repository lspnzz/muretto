// Derive view-model rows from the typed state. Keeps PascalCase field access in
// one place so components stay tidy.

import type { CarChannels, Driver, State, TimingDataDriver } from "@/types";

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
  const stints = state.TimingAppData?.Lines?.[racingNumber]?.Stints;
  if (!stints) return undefined;
  const keys = Object.keys(stints);
  const last = keys[keys.length - 1];
  return (last && stints[last]?.Compound) || undefined;
}
