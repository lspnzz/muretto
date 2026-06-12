"use client";

import { useDataStore } from "@/stores/useDataStore";
import type { TimingDataDriver } from "@/types";
import { TIMING_GRID, TimingRow } from "./TimingRow";

const HEADERS = ["Position", "DRS", "Tyre", "Info", "Gap", "Lap time", "Sectors"];

export function TimingTower() {
  const state = useDataStore((s) => s.state);
  const drivers = state.DriverList ?? {};
  const lines = Object.values(state.TimingData?.Lines ?? {}).filter(
    (line): line is TimingDataDriver => Boolean(line),
  );
  lines.sort((a, b) => Number(a.Position) - Number(b.Position));

  if (lines.length === 0) {
    return <div className="p-4 text-sm text-zinc-600">Waiting for timing data…</div>;
  }

  return (
    <div className="flex w-fit flex-col gap-0.5">
      <div
        className="grid items-center gap-2 p-1 px-2 text-sm font-medium text-zinc-500"
        style={{ gridTemplateColumns: TIMING_GRID }}
      >
        {HEADERS.map((header) => (
          <p key={header}>{header}</p>
        ))}
      </div>
      {lines.map((timing, index) => (
        <TimingRow
          key={timing.RacingNumber}
          racingNumber={timing.RacingNumber}
          timing={timing}
          driver={drivers[timing.RacingNumber]}
          position={index + 1}
        />
      ))}
    </div>
  );
}
