// Derive view-model rows from the typed state. Keeps PascalCase field access in
// one place so components stay tidy.

import type { Driver, State, TimingDataDriver } from "@/types";

export type DriverRow = {
  racingNumber: string;
  driver?: Driver;
  timing?: TimingDataDriver;
  position: number;
};

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
