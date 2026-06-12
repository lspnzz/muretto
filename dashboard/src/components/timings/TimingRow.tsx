"use client";

import { personalBestLapPosition } from "@/lib/ragged";
import { displayName } from "@/lib/selectors";
import { useDataStore } from "@/stores/useDataStore";
import type { Driver, Stint, TimingDataDriver } from "@/types";
import { DriverTag } from "./DriverTag";
import { GapCell, LapTimeCell, TyreCell } from "./cells";
import { SectorsCell } from "./SectorsCell";

export const TIMING_GRID = "10rem 4.25rem 4.75rem 5.25rem auto";

export function TimingRow({
  racingNumber,
  timing,
  driver,
  position,
}: {
  racingNumber: string;
  timing: TimingDataDriver;
  driver: Driver | undefined;
  position: number;
}) {
  const state = useDataStore((s) => s.state);
  const stints = orderedStints(state.TimingAppData?.Lines?.[racingNumber]?.Stints);
  const hasFastest = personalBestLapPosition(state.TimingStats, racingNumber) === 1;
  const sidelined = Boolean(timing.KnockedOut || timing.Retired || timing.Stopped);

  return (
    <div
      className={[
        "grid items-center gap-x-2.5 px-3 py-1.5 select-none",
        sidelined ? "opacity-50" : "",
        hasFastest ? "bg-violet-800/30" : "",
      ].join(" ")}
      style={{ gridTemplateColumns: TIMING_GRID }}
    >
      <DriverTag
        position={timing.Position || String(position)}
        name={displayName(driver, racingNumber)}
        teamColour={driver?.TeamColour}
      />
      <TyreCell stints={stints} />
      <GapCell timing={timing} />
      <LapTimeCell timing={timing} hasFastest={hasFastest} />
      <SectorsCell
        racingNumber={racingNumber}
        sectors={timing.Sectors}
        timingStats={state.TimingStats}
      />
    </div>
  );
}

function orderedStints(stints: { [key: string]: Stint | undefined } | undefined): Stint[] {
  if (!stints) return [];
  return Object.keys(stints)
    .sort((a, b) => Number(a) - Number(b))
    .flatMap((key) => (stints[key] ? [stints[key]] : []));
}
