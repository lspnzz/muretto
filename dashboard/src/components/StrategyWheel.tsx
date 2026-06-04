"use client";

import { useMemo } from "react";

import { currentTyre, orderedDrivers, pitCount, stintLaps, type DriverRow } from "@/lib/selectors";
import { TRACK_STATUS_COLOR } from "@/lib/trackStatus";
import { TYRE_COLOR } from "@/lib/tyre";
import { useDataStore } from "@/stores/useDataStore";
import type { State } from "@/types";
import { UpcomingRacePanel } from "./UpcomingRacePlaceholder";

const CENTER = 50;
const DRIVER_RADIUS = 38;
const OUTER_RING_RADIUS = 43;
const INNER_RING_RADIUS = 21;

type StrategyWheelVariant = "full" | "compact";

type DriverPlacement = {
  row: DriverRow;
  x: number;
  y: number;
};

export function StrategyWheel({ variant = "full" }: { variant?: StrategyWheelVariant }) {
  const state = useDataStore((s) => s.state);
  const rows = useMemo(() => orderedDrivers(state), [state]);
  const placements = useMemo(() => layoutDrivers(rows), [rows]);
  const lap = state.LapCount;
  const trackStatus = state.TrackStatus?.Status ?? "";
  const statusColor = TRACK_STATUS_COLOR[trackStatus] ?? "bg-zinc-600";
  const statusLabel = state.TrackStatus?.Message || "Track";
  const compact = variant === "compact";

  if (rows.length === 0) {
    return <UpcomingRacePanel compact={compact} />;
  }

  return (
    <section
      className={
        compact
          ? "flex h-full min-h-[18rem] items-center justify-center overflow-auto p-2"
          : "flex min-h-full items-center justify-center overflow-auto p-4"
      }
    >
      <div
        className={
          compact
            ? "relative aspect-square w-[min(92vw,22rem)] min-w-[18rem] max-w-[22rem] shrink-0"
            : "relative aspect-square min-w-[42rem] max-w-[58rem] w-[min(92vw,calc(100vh-6rem))]"
        }
      >
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          role="img"
          aria-label="Radial timing order"
        >
          <circle
            cx={CENTER}
            cy={CENTER}
            r={OUTER_RING_RADIUS}
            className="fill-none stroke-zinc-800"
            strokeWidth="0.5"
          />
          <circle
            cx={CENTER}
            cy={CENTER}
            r={INNER_RING_RADIUS}
            className="fill-zinc-950/60 stroke-zinc-800"
            strokeWidth="0.5"
          />

          {placements.map(({ row, x, y }) => {
            const colour = row.driver?.TeamColour ? `#${row.driver.TeamColour}` : "#71717a";
            return (
              <line
                key={row.racingNumber}
                x1={CENTER}
                y1={CENTER}
                x2={x}
                y2={y}
                stroke={colour}
                strokeOpacity="0.55"
                strokeWidth="0.5"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>

        <div
          className={[
            "absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-zinc-700 bg-zinc-950/95 text-center shadow-2xl shadow-black/40",
            compact ? "h-20 w-20" : "h-36 w-36",
          ].join(" ")}
        >
          <span
            className={[
              "uppercase text-zinc-500",
              compact ? "text-[0.58rem]" : "text-xs tracking-wide",
            ].join(" ")}
          >
            Lap
          </span>
          <span
            className={[
              "font-mono font-semibold tabular-nums text-zinc-100",
              compact ? "text-base" : "text-2xl",
            ].join(" ")}
          >
            {lap && lap.TotalLaps > 0 ? `${lap.CurrentLap}/${lap.TotalLaps}` : "--/--"}
          </span>
          <span
            className={[
              "flex items-center gap-1 text-zinc-400",
              compact ? "mt-1 max-w-16 text-[0.6rem]" : "mt-2 max-w-28 text-xs",
            ].join(" ")}
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${statusColor}`} aria-hidden />
            <span className="truncate">{statusLabel}</span>
          </span>
        </div>

        {placements.map(({ row, x, y }) => (
          <DriverCard
            key={row.racingNumber}
            row={row}
            state={state}
            x={x}
            y={y}
            compact={compact}
          />
        ))}
      </div>
    </section>
  );
}

function DriverCard({
  row,
  state,
  x,
  y,
  compact,
}: {
  row: DriverRow;
  state: State;
  x: number;
  y: number;
  compact: boolean;
}) {
  const { driver, racingNumber, timing } = row;
  const position = timing?.Position || String(row.position);
  const tla = driver?.Tla || racingNumber;
  const colour = driver?.TeamColour ? `#${driver.TeamColour}` : "#71717a";
  const tyre = currentTyre(state, racingNumber);
  const tyreClass = tyre ? (TYRE_COLOR[tyre] ?? "text-zinc-400") : "text-zinc-600";
  const laps = stintLaps(state, racingNumber);
  const stops = pitCount(state, racingNumber);
  const gap = driverGap(row);
  const interval = timing?.IntervalToPositionAhead?.Value || "";
  const showInterval = Boolean(interval && interval !== gap && position !== "1");

  if (compact) {
    return (
      <article
        className="absolute z-10 flex h-10 w-11 -translate-x-1/2 -translate-y-1/2 flex-col justify-center rounded-sm border border-zinc-700/80 bg-zinc-950/90 px-1 py-0.5 font-mono text-[0.58rem] leading-tight tabular-nums text-zinc-300 shadow-lg shadow-black/30 backdrop-blur"
        style={{ left: `${x}%`, top: `${y}%` }}
        aria-label={`${tla} position ${position}`}
      >
        <div className="flex min-w-0 items-center gap-1">
          <span className="w-3 shrink-0 text-right font-semibold text-zinc-100">{position}</span>
          <span className="h-3 w-1 shrink-0 rounded-sm" style={{ backgroundColor: colour }} aria-hidden />
          <span className="min-w-0 flex-1 truncate text-[0.66rem] font-semibold text-zinc-100">
            {tla}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-1 text-[0.55rem] text-zinc-500">
          <span className={`font-bold ${tyreClass}`}>{tyre?.[0] ?? "-"}</span>
          <span>{laps === undefined ? "L--" : `L${laps}`}</span>
          {timing?.InPit ? <span className="font-sans font-semibold text-amber-400">PIT</span> : null}
        </div>
      </article>
    );
  }

  return (
    <article
      className="absolute z-10 flex min-h-[4.6rem] w-24 -translate-x-1/2 -translate-y-1/2 flex-col justify-between rounded-md border border-zinc-700/80 bg-zinc-950/90 px-2 py-1.5 font-mono text-xs tabular-nums text-zinc-300 shadow-xl shadow-black/30 backdrop-blur"
      style={{ left: `${x}%`, top: `${y}%` }}
      aria-label={`${tla} position ${position}`}
    >
      <div className="flex items-center gap-1.5">
        <span className="w-5 text-right font-semibold text-zinc-100">{position}</span>
        <span className="h-4 w-1 rounded-sm" style={{ backgroundColor: colour }} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-100">{tla}</span>
      </div>

      <div className="flex items-center justify-between gap-1 text-[0.68rem] text-zinc-500">
        <span className={`font-bold ${tyreClass}`}>{tyre?.[0] ?? "-"}</span>
        <span>{laps === undefined ? "L--" : `L${laps}`}</span>
        <span>{`P${stops}`}</span>
        {timing?.InPit && (
          <span className="rounded-sm bg-amber-400/10 px-1 font-sans text-[0.6rem] font-semibold text-amber-400">
            PIT
          </span>
        )}
      </div>

      <div className="min-w-0 text-right leading-tight">
        <div className="truncate text-[0.7rem] text-zinc-300" title={gap}>
          {gap}
        </div>
        {showInterval && (
          <div className="truncate text-[0.62rem] text-zinc-600" title={interval}>
            {interval}
          </div>
        )}
      </div>
    </article>
  );
}

function layoutDrivers(rows: DriverRow[]): DriverPlacement[] {
  const count = rows.length;
  if (count === 0) return [];

  return rows.map((row, index) => {
    const angle = (360 / count) * index - 90;
    const radians = (angle * Math.PI) / 180;
    return {
      row,
      x: CENTER + Math.cos(radians) * DRIVER_RADIUS,
      y: CENTER + Math.sin(radians) * DRIVER_RADIUS,
    };
  });
}

function driverGap(row: DriverRow) {
  const position = row.timing?.Position || String(row.position);
  if (position === "1") return "Leader";
  return row.timing?.GapToLeader || row.timing?.IntervalToPositionAhead?.Value || "--";
}
