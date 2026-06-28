"use client";

import { fastestLapTyre } from "@/lib/fastestLap";
import { personalBestLapPosition } from "@/lib/ragged";
import { displayName, shortDriverName, stintsForDriver } from "@/lib/selectors";
import { useDataStore } from "@/stores/useDataStore";
import type { Driver, TimingDataDriver } from "@/types";
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
  onSelect,
}: {
  racingNumber: string;
  timing: TimingDataDriver;
  driver: Driver | undefined;
  position: number;
  onSelect: (racingNumber: string) => void;
}) {
  const state = useDataStore((s) => s.state);
  const stints = stintsForDriver(state, racingNumber);
  const hasFastest = personalBestLapPosition(state.TimingStats, racingNumber) === 1;
  const fastestTyre = fastestLapTyre(state, racingNumber);
  const sidelined = Boolean(timing.KnockedOut || timing.Retired || timing.Stopped);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Show ${displayName(driver, racingNumber)} stints`}
      onClick={() => onSelect(racingNumber)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(racingNumber);
        }
      }}
      className={[
        "grid cursor-pointer items-center gap-x-2.5 px-3 py-1.5 select-none transition-colors",
        "hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-zinc-600",
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
