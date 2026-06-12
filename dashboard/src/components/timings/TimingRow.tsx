"use client";

import { telemetry } from "@/lib/selectors";
import { personalBestLapPosition } from "@/lib/ragged";
import { useDataStore } from "@/stores/useDataStore";
import type { Driver, Stint, TimingDataDriver } from "@/types";
import { DriverTag } from "./DriverTag";
import { DrsBox, GapCell, InfoCell, LapTimeCell, TyreCell } from "./cells";
import { SectorsCell } from "./SectorsCell";

export const TIMING_GRID = "5.5rem 3.5rem 5.5rem 4rem 5rem 5.5rem auto";

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
  const appLine = state.TimingAppData?.Lines?.[racingNumber];
  const stints = orderedStints(appLine?.Stints);
  const gridPos = appLine?.GridPos ? Number(appLine.GridPos) : null;
  const channels = telemetry(state, racingNumber);
  const hasFastest = personalBestLapPosition(state.TimingStats, racingNumber) === 1;
  const sidelined = Boolean(timing.KnockedOut || timing.Retired || timing.Stopped);

  return (
    <div
      className={[
        "grid items-center gap-2 rounded-lg p-1.5 select-none",
        sidelined ? "opacity-50" : "",
        hasFastest ? "bg-violet-800/30" : "",
      ].join(" ")}
      style={{ gridTemplateColumns: TIMING_GRID }}
    >
      <DriverTag
        position={timing.Position || String(position)}
        tla={driver?.Tla || racingNumber}
        teamColour={driver?.TeamColour}
      />
      <DrsBox
        drsValue={channels?.["45"]}
        inPit={Boolean(timing.InPit)}
        pitOut={Boolean(timing.PitOut)}
      />
      <TyreCell stints={stints} />
      <InfoCell timing={timing} gridPos={Number.isFinite(gridPos) ? gridPos : null} />
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
