"use client";

import { orderedDrivers } from "@/lib/selectors";
import { useDataStore } from "@/stores/useDataStore";
import { DriverRow } from "./DriverRow";
import { UpcomingRaceTimings } from "./UpcomingRacePlaceholder";

export function LeaderBoard() {
  const state = useDataStore((s) => s.state);
  const rows = orderedDrivers(state);

  if (rows.length === 0) {
    return <UpcomingRaceTimings />;
  }

  return (
    <section className="flex-1">
      <div className="flex items-center gap-3 px-3 py-1.5 text-xs uppercase tracking-wide text-zinc-500">
        <span className="w-6 text-right">P</span>
        <span className="w-1" />
        <span className="w-10">Drv</span>
        <span className="w-20">Leader</span>
        <span className="w-20">Interval</span>
        <span className="w-24">Last lap</span>
        <span className="w-6 text-center">T</span>
        <span className="ml-auto">Telemetry</span>
      </div>
      <ul>
        {rows.map((row) => (
          <DriverRow key={row.racingNumber} row={row} state={state} />
        ))}
      </ul>
    </section>
  );
}
