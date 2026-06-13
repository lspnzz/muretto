"use client";

import { segmentClass, segmentList, sectorValueClass } from "@/components/timings/SectorsCell";
import { orderedStints } from "@/components/timings/TimingRow";
import { bestSectorPosition, bestSectorValue, personalBestLapPosition } from "@/lib/ragged";
import { timingGapDisplay } from "@/lib/timingGaps";
import { tyreHex } from "@/lib/tyre";
import { useDataStore } from "@/stores/useDataStore";
import type { LapVal, Sector } from "@/types";

/**
 * Sector-by-sector live timing for one driver: gaps, lap times, each
 * sector's value + mini-segments at detail size, speed traps, current stint.
 * Same colour semantics as the tower (docs/references/strategy-screens.md).
 */
export function SectorBreakdown({ racingNumber }: { racingNumber: string }) {
  const state = useDataStore((s) => s.state);
  const timing = state.TimingData?.Lines?.[racingNumber];
  const stints = orderedStints(state.TimingAppData?.Lines?.[racingNumber]?.Stints);
  const hasFastest = personalBestLapPosition(state.TimingStats, racingNumber) === 1;

  if (!timing) {
    return (
      <section className="rounded-lg border border-zinc-800 p-4 text-sm text-zinc-600">
        Waiting for timing data…
      </section>
    );
  }

  const sectors = Object.keys(timing.Sectors)
    .sort((a, b) => Number(a) - Number(b))
    .flatMap((key) => (timing.Sectors[key] ? [timing.Sectors[key]] : []));
  const statusWord = timing.InPit
    ? "IN PIT"
    : timing.PitOut
      ? "PIT OUT"
      : timing.Retired || timing.Stopped
        ? "RETIRED"
        : timing.KnockedOut
          ? "OUT"
          : null;
  const traps: Array<[string, LapVal]> = [
    ["I1", timing.Speeds.I1],
    ["I2", timing.Speeds.I2],
    ["FL", timing.Speeds.FL],
    ["ST", timing.Speeds.ST],
  ];
  const currentStint = stints.at(-1);
  const gaps = timingGapDisplay(timing, state.TimingData?.SessionPart);

  return (
    <section className="rounded-lg border border-zinc-800">
      <div className="flex items-center justify-between gap-4 border-b border-zinc-800 px-3 py-2.5">
        <h2 className="text-xs uppercase tracking-wide text-zinc-500">Live timing</h2>
        <div className="flex items-center gap-3 font-mono text-xs text-zinc-400">
          {statusWord && <span className="text-cyan-400">{statusWord}</span>}
          <span>P{timing.Position || "—"}</span>
          {timing.NumberOfLaps != null && <span>{timing.NumberOfLaps} laps</span>}
        </div>
      </div>

      <div className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Gap to leader" value={gaps.gap || "—"} />
          <Stat label="Interval" value={gaps.interval || "—"} />
          <Stat
            label="Last lap"
            value={timing.LastLapTime.Value || "—"}
            valueClass={lapValClass(timing.LastLapTime)}
          />
          <Stat
            label="Best lap"
            value={timing.BestLapTime.Value || "—"}
            valueClass={hasFastest ? "text-violet-500" : ""}
          />
        </div>

        <div className="flex flex-col gap-3">
          {sectors.map((sector, index) => (
            <SectorRow
              key={index}
              index={index}
              sector={sector}
              best={bestSectorValue(state.TimingStats, racingNumber, index)}
              bestIsOverall={bestSectorPosition(state.TimingStats, racingNumber, index) === 1}
            />
          ))}
          {sectors.length === 0 && (
            <p className="text-sm text-zinc-600">No sector times yet.</p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-900 pt-3">
          <div className="flex gap-4 font-mono text-xs">
            {traps.map(([label, trap]) => (
              <span key={label} className="text-zinc-500">
                {label}{" "}
                <span className={`text-zinc-300 ${lapValClass(trap)}`}>{trap.Value || "—"}</span>
              </span>
            ))}
          </div>
          {currentStint && (
            <div className="flex items-center gap-1.5 text-xs text-zinc-400">
              <span
                className="font-semibold"
                style={{ color: tyreHex(currentStint.Compound?.toUpperCase() ?? "") }}
              >
                {currentStint.Compound?.[0] ?? "?"}
              </span>
              <span>L {currentStint.TotalLaps ?? 0}</span>
              <span className="text-zinc-600">·</span>
              <span>PIT {Math.max(0, stints.length - 1)}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  valueClass = "",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 font-mono text-base leading-none font-medium tabular-nums ${valueClass}`}>
        {value}
      </p>
    </div>
  );
}

function SectorRow({
  index,
  sector,
  best,
  bestIsOverall,
}: {
  index: number;
  sector: Sector;
  best: string | null;
  bestIsOverall: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-7 shrink-0 font-mono text-xs text-zinc-500">S{index + 1}</span>
      <div className="flex grow flex-row flex-wrap gap-1">
        {segmentList(sector.Segments).map((segment, i) => (
          <div
            key={i}
            className={`h-1.5 w-4 rounded-sm ${segmentClass(segment.Status)}`}
          />
        ))}
      </div>
      <div className="flex shrink-0 items-baseline gap-2 font-mono">
        <span className={`text-base font-medium tabular-nums ${sectorValueClass(sector)}`}>
          {sector.Value || sector.PreviousValue || "-- ---"}
        </span>
        {best && (
          <span
            className={`text-xs tabular-nums ${bestIsOverall ? "text-violet-500" : "text-zinc-500"}`}
          >
            {best}
          </span>
        )}
      </div>
    </div>
  );
}

/** Lap/trap value colour per the personal/overall-fastest convention. */
function lapValClass(value: LapVal): string {
  return value.OverallFastest
    ? "text-violet-500"
    : value.PersonalFastest
      ? "text-emerald-500"
      : "";
}
