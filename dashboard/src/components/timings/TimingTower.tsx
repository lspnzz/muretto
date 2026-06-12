"use client";

import { useEffect, useState } from "react";

import { remainingClock } from "@/lib/clock";
import { trackStatusStyle } from "@/lib/trackStatus";
import { useDataStore } from "@/stores/useDataStore";
import type { TimingDataDriver } from "@/types";
import { TIMING_GRID, TimingRow } from "./TimingRow";

const HEADERS = ["Driver", "Tyre", "Gap", "Lap time", "Sectors"];

export function TimingTower() {
  const state = useDataStore((s) => s.state);
  const drivers = state.DriverList ?? {};
  const lines = Object.values(state.TimingData?.Lines ?? {}).filter(
    (line): line is TimingDataDriver => Boolean(line),
  );
  lines.sort((a, b) => Number(a.Position) - Number(b.Position));

  if (lines.length === 0) {
    return (
      <section className="rounded-lg border border-zinc-800 p-4 text-sm text-zinc-600">
        Waiting for timing data…
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-zinc-800">
      <PanelHeader />
      <div className="overflow-x-auto">
        <div className="min-w-fit">
          <div
            className="grid items-center gap-x-2.5 border-b border-zinc-800 px-3 py-2 text-[11px] uppercase tracking-wide text-zinc-500"
            style={{ gridTemplateColumns: TIMING_GRID }}
          >
            {HEADERS.map((header) => (
              <p key={header}>{header}</p>
            ))}
          </div>
          {/* Thin rules between rows — the FOM timing-page convention, not zebra. */}
          <div className="flex flex-col divide-y divide-zinc-900 py-1">
            {lines.map((timing, index) => (
              <TimingRow
                key={timing.RacingNumber}
                racingNumber={timing.RacingNumber}
                timing={timing}
                driver={drivers[timing.RacingNumber]}
                position={index + 1}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Session name, running clock, and track status — the panel's title line. */
function PanelHeader() {
  const session = useDataStore((s) => s.state.SessionInfo);
  const clock = useDataStore((s) => s.state.ExtrapolatedClock);
  const trackStatus = useDataStore((s) => s.state.TrackStatus);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(tick);
  }, []);

  const remaining = remainingClock(clock, now);
  const status = trackStatusStyle(trackStatus?.Status);

  return (
    <div className="flex items-center justify-between gap-4 border-b border-zinc-800 px-3 py-2.5">
      <h2 className="truncate text-xs uppercase tracking-wide text-zinc-500">
        {session?.Name?.trim() || "Timing"}
      </h2>
      <div className="flex shrink-0 items-center gap-4">
        {remaining && (
          <span className="font-mono text-xs tabular-nums text-zinc-400">{remaining}</span>
        )}
        {status && (
          <span className="flex items-center gap-1.5 text-xs text-zinc-400">
            <span className={`h-2 w-2 rounded-full ${status.bg}`} aria-hidden />
            {trackStatus?.Message || status.label}
          </span>
        )}
      </div>
    </div>
  );
}
