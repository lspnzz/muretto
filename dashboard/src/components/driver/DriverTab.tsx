"use client";

import { useState } from "react";

import { NoLiveSession, SessionEndedBanner } from "@/components/NoLiveSession";
import { TrackMap } from "@/components/TrackMap";
import { useLiveness } from "@/hooks/useLiveness";
import { showsLiveData } from "@/lib/liveness";
import { orderedDrivers } from "@/lib/selectors";
import { useDataStore } from "@/stores/useDataStore";
import { DriverSelector } from "./DriverSelector";
import { SectorBreakdown } from "./SectorBreakdown";
import { TelemetryPanel } from "./TelemetryPanel";

/**
 * Per-driver drill-down: telemetry left; sector-by-sector timing and the
 * track map (selected car highlighted) right. Selection falls back to the
 * leader until made, or if the driver vanishes on a session change.
 */
export function DriverTab() {
  const liveness = useLiveness();
  const state = useDataStore((s) => s.state);
  const [selected, setSelected] = useState<string | null>(null);

  if (!showsLiveData(liveness)) return <NoLiveSession />;

  const rows = orderedDrivers(state);
  const current =
    selected && rows.some((row) => row.racingNumber === selected)
      ? selected
      : rows[0]?.racingNumber;

  return (
    <>
      {liveness === "ended" && <SessionEndedBanner />}
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4">
        {current ? (
          <>
            <DriverSelector rows={rows} selected={current} onSelect={setSelected} />
            {/* Default stretch alignment: the telemetry panel matches the
                right column's height, with the gauge centred inside it. */}
            <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <TelemetryPanel key={current} racingNumber={current} />
              <div className="flex flex-col gap-4">
                <SectorBreakdown racingNumber={current} />
                <TrackMap highlight={current} />
              </div>
            </div>
          </>
        ) : (
          <section className="rounded-lg border border-zinc-800 p-4 text-sm text-zinc-600">
            Waiting for driver data…
          </section>
        )}
      </div>
    </>
  );
}
