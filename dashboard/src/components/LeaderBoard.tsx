"use client";

import type { ReactNode } from "react";

import { orderedDrivers } from "@/lib/selectors";
import { TRACK_STATUS_COLOR } from "@/lib/trackStatus";
import { useDataStore } from "@/stores/useDataStore";
import type { State } from "@/types";
import { DriverRow, TIMING_GRID_STYLE } from "./DriverRow";
import { UpcomingRaceTimings } from "./UpcomingRacePlaceholder";

export function LeaderBoard() {
  const state = useDataStore((s) => s.state);
  const connected = useDataStore((s) => s.connected);
  const delayMs = useDataStore((s) => s.delayMs);
  const rows = orderedDrivers(state);

  if (rows.length === 0) {
    return <UpcomingRaceTimings />;
  }

  return (
    <section className="min-w-[72rem] flex-1">
      <LiveTimingStrip state={state} connected={connected} delayMs={delayMs} />
      <div
        className="sticky top-0 z-10 grid items-center gap-3 border-b border-zinc-900 bg-zinc-950/95 px-3 py-1.5 text-xs uppercase tracking-wide text-zinc-500 backdrop-blur"
        style={TIMING_GRID_STYLE}
      >
        <span className="text-right">P</span>
        <span />
        <span>Drv</span>
        <span>Leader</span>
        <span>Interval</span>
        <span>Last</span>
        <span>Best</span>
        <span>Sectors</span>
        <span className="text-center">T</span>
        <span>Stint</span>
        <span>Laps</span>
        <span>State</span>
        <span>Telemetry</span>
        <span className="sr-only">Details</span>
      </div>
      <ul>
        {rows.map((row) => (
          <DriverRow key={row.racingNumber} row={row} state={state} />
        ))}
      </ul>
    </section>
  );
}

function LiveTimingStrip({
  state,
  connected,
  delayMs,
}: {
  state: State;
  connected: boolean;
  delayMs: number;
}) {
  const lap = state.LapCount;
  const clock = state.ExtrapolatedClock?.Remaining;
  const sessionStatus = state.SessionStatus?.Status || state.SessionInfo?.Name || "--";
  const trackStatus = state.TrackStatus?.Status ?? "";
  const statusColor = TRACK_STATUS_COLOR[trackStatus] ?? "bg-zinc-600";
  const trackLabel = state.TrackStatus?.Message || trackStatusLabel(trackStatus);

  return (
    <div className="grid gap-2 border-b border-zinc-900 bg-zinc-950 px-3 py-2 text-xs sm:grid-cols-2 xl:grid-cols-5">
      <StripItem
        label={lap && lap.TotalLaps > 0 ? "Lap" : "Clock"}
        value={lap && lap.TotalLaps > 0 ? `${lap.CurrentLap}/${lap.TotalLaps}` : clock || "--"}
      />
      <StripItem label="Session" value={sessionStatus} />
      <StripItem
        label="Track"
        value={trackLabel}
        marker={<span className={`h-2 w-2 shrink-0 rounded-full ${statusColor}`} aria-hidden />}
      />
      <StripItem
        label="Feed"
        value={connected ? "Online" : "Offline"}
        marker={
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`}
            aria-hidden
          />
        }
      />
      <StripItem label="Delay" value={`${(delayMs / 1000).toFixed(1)}s`} />
    </div>
  );
}

function StripItem({
  label,
  value,
  marker,
}: {
  label: string;
  value: string;
  marker?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-sm border border-zinc-900 bg-zinc-950/70 px-2 py-1.5">
      {marker}
      <span className="shrink-0 text-[0.62rem] uppercase tracking-wide text-zinc-600">{label}</span>
      <span className="min-w-0 truncate font-mono text-sm tabular-nums text-zinc-300">{value}</span>
    </div>
  );
}

function trackStatusLabel(status: string) {
  switch (status) {
    case "1":
      return "All clear";
    case "2":
      return "Yellow";
    case "4":
      return "Safety car";
    case "5":
      return "Red flag";
    case "6":
      return "VSC";
    default:
      return "--";
  }
}
