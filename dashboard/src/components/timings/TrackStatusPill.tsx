"use client";

import { trackStatusStyle } from "@/lib/trackStatus";
import { useDataStore } from "@/stores/useDataStore";

/** Track-status pill with the f1-dash-style glow, plus the lap counter. */
export function TrackStatusPill() {
  const trackStatus = useDataStore((s) => s.state.TrackStatus);
  const lap = useDataStore((s) => s.state.LapCount);
  const style = trackStatusStyle(trackStatus?.Status);

  return (
    <div className="flex flex-row items-center gap-4">
      {lap && lap.TotalLaps > 0 && (
        <p className="whitespace-nowrap text-3xl font-extrabold tabular-nums">
          {lap.CurrentLap} / {lap.TotalLaps}
        </p>
      )}
      {style && (
        <div
          className={`flex h-8 items-center truncate rounded-md px-2 ${style.bg}`}
          style={{ boxShadow: `0 0 60px 10px ${style.hex}` }}
        >
          <p className="text-lg font-medium text-zinc-950">
            {trackStatus?.Message || style.label}
          </p>
        </div>
      )}
    </div>
  );
}
