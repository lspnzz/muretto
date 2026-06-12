"use client";

// The small leaderboard cells. Column semantics and colour conventions:
// docs/references/strategy-screens.md (re-implemented, not copied — AGPL).
// No DRS column: post-2026 cars have none and the feed carries no
// energy-deployment channel; pit state rides the gap column instead.

import { tyreHex } from "@/lib/tyre";
import type { Stint, TimingDataDriver } from "@/types";

/** Current compound ring, stint age, and stop count. */
export function TyreCell({ stints }: { stints: Stint[] }) {
  const current = stints.at(-1);
  const compound = current?.Compound?.toUpperCase() ?? "";
  const used = current?.New === "FALSE";

  return (
    <div className="flex items-center gap-1.5 place-self-start">
      <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0" aria-hidden>
        <circle cx={16} cy={16} r={12} fill="none" stroke={tyreHex(compound)} strokeWidth={4.5} />
        <text
          x={16}
          y={17}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={11}
          fontWeight={700}
          fill={tyreHex(compound)}
        >
          {compound ? compound[0] : "?"}
        </text>
      </svg>
      <div>
        <p className="text-sm leading-none font-medium">
          L {current?.TotalLaps ?? 0}
          {used ? "*" : ""}
        </p>
        <p className="mt-1 text-xs leading-none text-zinc-500">
          PIT {Math.max(0, stints.length - 1)}
        </p>
      </div>
    </div>
  );
}

/** Interval to the car ahead over gap to the leader; pit state overrides. */
export function GapCell({ timing }: { timing: TimingDataDriver }) {
  const interval = timing.IntervalToPositionAhead?.Value || timing.TimeDiffToPositionAhead || "";
  const gap = timing.GapToLeader || timing.TimeDiffToFastest || "";
  const pitWord = timing.InPit ? "IN PIT" : timing.PitOut ? "PIT OUT" : null;
  const catching =
    !pitWord && Boolean(timing.IntervalToPositionAhead?.Catching) && Boolean(interval);

  return (
    <div className="place-self-start font-mono">
      <p
        className={`text-base leading-none font-medium tabular-nums ${
          pitWord
            ? "text-cyan-400"
            : catching
              ? "text-emerald-500"
              : interval
                ? ""
                : "text-zinc-500"
        }`}
      >
        {pitWord ?? (interval || "-- ---")}
      </p>
      <p className="mt-1 text-xs leading-none tabular-nums text-zinc-500">{gap || "-- ---"}</p>
    </div>
  );
}

/** Last lap over personal best, with fastest-lap colouring. */
export function LapTimeCell({
  timing,
  hasFastest,
}: {
  timing: TimingDataDriver;
  hasFastest: boolean;
}) {
  const last = timing.LastLapTime;
  const lastCls = last?.OverallFastest
    ? "text-violet-500"
    : last?.PersonalFastest
      ? "text-emerald-500"
      : last?.Value
        ? ""
        : "text-zinc-500";

  return (
    <div className="place-self-start font-mono">
      <p className={`text-base leading-none font-medium tabular-nums ${lastCls}`}>
        {last?.Value || "-- -- ---"}
      </p>
      <p
        className={`mt-1 text-xs leading-none tabular-nums ${
          hasFastest ? "text-violet-500" : "text-zinc-500"
        }`}
      >
        {timing.BestLapTime?.Value || "-- -- ---"}
      </p>
    </div>
  );
}
