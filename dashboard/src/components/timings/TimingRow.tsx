"use client";

import { fastestLapTyre } from "@/lib/fastestLap";
import { personalBestLapPosition } from "@/lib/ragged";
import { displayName } from "@/lib/selectors";
import { useDataStore } from "@/stores/useDataStore";
import type { Driver, Stint, TimingDataDriver } from "@/types";
import { DriverTag } from "./DriverTag";
import { BestLapCell, GapCell, LastLapCell, PitCell, TyreCell } from "./cells";
import { SectorsCell } from "./SectorsCell";

export const TIMING_GRID =
  "5.25rem 3.25rem 2.5rem 5rem 5.25rem minmax(min-content, 1fr) 7.5rem";

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
  const fastestTyre = fastestLapTyre(state, racingNumber);
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
        name={shortDriverName(displayName(driver, racingNumber))}
        teamColour={driver?.TeamColour}
      />
      <TyreCell stints={stints} />
      <PitCell stints={stints} timing={timing} />
      <GapCell timing={timing} sessionPart={state.TimingData?.SessionPart} />
      <LastLapCell timing={timing} />
      <SectorsCell sectors={timing.Sectors} />
      <BestLapCell timing={timing} hasFastest={hasFastest} fastestTyre={fastestTyre} />
    </div>
  );
}

function shortDriverName(name: string): string {
  return name.replace(/\s+/g, "").slice(0, 3).toUpperCase();
}

/** Stints in stint-number order. */
function orderedStints(stints: { [key: string]: Stint | undefined } | undefined): Stint[] {
  if (!stints) return [];
  return Object.keys(stints)
    .sort((a, b) => Number(a) - Number(b))
    .flatMap((key) => (stints[key] ? [stints[key]] : []));
}
