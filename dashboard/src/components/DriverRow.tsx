"use client";

import { type DriverRow as Row, currentTyre, telemetry } from "@/lib/selectors";
import { TYRE_COLOR } from "@/lib/tyre";
import type { State } from "@/types";

export function DriverRow({ row, state }: { row: Row; state: State }) {
  const { driver, timing, racingNumber } = row;
  const tla = driver?.Tla || racingNumber;
  const colour = driver?.TeamColour ? `#${driver.TeamColour}` : "#666";
  const tyre = currentTyre(state, racingNumber);
  const channels = telemetry(state, racingNumber);
  const drsOpen = (channels?.["45"] ?? 0) >= 10;

  return (
    <li className="flex items-center gap-3 px-3 py-1.5 odd:bg-zinc-900/40">
      <span className="w-6 text-right text-sm font-semibold tabular-nums text-zinc-300">
        {timing?.Position || row.position}
      </span>
      <span className="h-5 w-1 rounded" style={{ backgroundColor: colour }} aria-hidden />
      <span className="w-10 font-mono font-semibold">{tla}</span>

      <span className="w-20 text-sm tabular-nums text-zinc-400">
        {timing?.GapToLeader || "—"}
      </span>
      <span className="w-20 text-sm tabular-nums text-zinc-500">
        {timing?.IntervalToPositionAhead?.Value || ""}
      </span>
      <span className="w-24 font-mono text-sm tabular-nums text-zinc-300">
        {timing?.LastLapTime?.Value || ""}
      </span>

      {tyre && (
        <span className={`w-6 text-center text-sm font-bold ${TYRE_COLOR[tyre] ?? "text-zinc-400"}`}>
          {tyre[0]}
        </span>
      )}

      {channels && (
        <span className="ml-auto flex items-center gap-3 font-mono text-xs tabular-nums text-zinc-400">
          <span className="w-14 text-right">{channels["2"]} km/h</span>
          <span className="w-4 text-center">{channels["3"]}</span>
          <span className={`w-8 text-center ${drsOpen ? "text-green-400" : "text-zinc-600"}`}>
            DRS
          </span>
        </span>
      )}

      {timing?.InPit && <span className="text-xs font-semibold text-amber-400">PIT</span>}
    </li>
  );
}
