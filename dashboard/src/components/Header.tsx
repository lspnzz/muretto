"use client";

import { useDataStore } from "@/stores/useDataStore";
import { DelayControl } from "./DelayControl";

const TRACK_STATUS_COLOR: Record<string, string> = {
  "1": "bg-green-500", // all clear
  "2": "bg-yellow-500", // yellow
  "4": "bg-yellow-500", // safety car
  "5": "bg-red-500", // red flag
  "6": "bg-yellow-500", // VSC
};

export function Header() {
  const state = useDataStore((s) => s.state);
  const connected = useDataStore((s) => s.connected);

  const session = state.SessionInfo;
  const lap = state.LapCount;
  const trackStatus = state.TrackStatus?.Status ?? "";
  const statusColor = TRACK_STATUS_COLOR[trackStatus] ?? "bg-zinc-600";

  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-zinc-800 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className={`inline-block h-3 w-3 rounded-full ${statusColor}`} aria-hidden />
        <span className="text-lg font-semibold">muretto</span>
      </div>

      {session?.Meeting?.Name && (
        <div className="text-sm text-zinc-300">
          {session.Meeting.Name}
          {session.Name ? ` — ${session.Name}` : ""}
        </div>
      )}

      {lap && lap.TotalLaps > 0 && (
        <div className="text-sm tabular-nums text-zinc-400">
          Lap {lap.CurrentLap}/{lap.TotalLaps}
        </div>
      )}

      <div className="ml-auto flex items-center gap-4">
        <DelayControl />
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`}
            aria-hidden
          />
          <span className="text-zinc-400">{connected ? "live" : "offline"}</span>
        </div>
      </div>
    </header>
  );
}
