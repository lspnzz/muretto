"use client";

import { useEffect, useState } from "react";

import { remainingClock } from "@/lib/clock";
import { trackStatusStyle } from "@/lib/trackStatus";
import { useDataStore } from "@/stores/useDataStore";

/** Hero strip for the session currently on track (or just finished). */
export function SessionBanner({ ended }: { ended: boolean }) {
  const state = useDataStore((s) => s.state);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(tick);
  }, []);

  const session = state.SessionInfo;
  if (!session) return null;

  const status = trackStatusStyle(state.TrackStatus?.Status);
  const lap = state.LapCount;
  const remaining = remainingClock(state.ExtrapolatedClock, now);

  return (
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-zinc-800 bg-zinc-950 p-5">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-zinc-600">
          {ended ? "Session ended" : "Live now"}
        </p>
        <h2 className="mt-1 truncate text-2xl font-semibold text-zinc-100">
          {session.Meeting?.Name || "Session"}
        </h2>
        <p className="mt-0.5 text-sm text-zinc-500">
          {session.Name}
          {session.Meeting?.Circuit?.ShortName ? ` · ${session.Meeting.Circuit.ShortName}` : ""}
        </p>
      </div>

      <div className="flex items-center gap-6">
        {remaining && (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-zinc-600">Remaining</p>
            <p className="font-mono text-2xl font-semibold tabular-nums text-zinc-100">
              {remaining}
            </p>
          </div>
        )}
        {lap && lap.TotalLaps > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-zinc-600">Lap</p>
            <p className="font-mono text-2xl font-semibold tabular-nums text-zinc-100">
              {lap.CurrentLap}/{lap.TotalLaps}
            </p>
          </div>
        )}
        {status && (
          <span
            className={`flex h-8 items-center rounded-md px-3 text-sm font-medium text-zinc-950 ${status.bg}`}
            style={{ boxShadow: `0 0 40px 4px ${status.hex}55` }}
          >
            {state.TrackStatus?.Message || status.label}
          </span>
        )}
      </div>
    </section>
  );
}
