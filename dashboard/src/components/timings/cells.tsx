"use client";

// The small leaderboard cells. Column semantics and colour conventions:
// docs/references/strategy-screens.md (re-implemented, not copied — AGPL).

import { tyreHex } from "@/lib/tyre";
import type { Stint, TimingDataDriver } from "@/types";

/** DRS box doubling as PIT indicator (CarData channel 45). */
export function DrsBox({
  drsValue,
  inPit,
  pitOut,
}: {
  drsValue: number | undefined;
  inPit: boolean;
  pitOut: boolean;
}) {
  const pit = inPit || pitOut;
  const on = (drsValue ?? 0) > 9;
  const possible = drsValue === 8;
  const cls = pit
    ? "border-cyan-500 text-cyan-500"
    : on
      ? "border-emerald-500 text-emerald-500"
      : possible
        ? "border-zinc-400 text-zinc-400"
        : "border-zinc-700 text-zinc-700";

  return (
    <div
      className={`inline-flex h-8 w-full items-center justify-center rounded-md border-2 font-mono text-base font-black ${cls}`}
    >
      {pit ? "PIT" : "DRS"}
    </div>
  );
}

/** Current compound ring, stint age, and stop count. */
export function TyreCell({ stints }: { stints: Stint[] }) {
  const current = stints.at(-1);
  const compound = current?.Compound?.toUpperCase() ?? "";
  const used = current?.New === "FALSE";

  return (
    <div className="flex items-center gap-2 place-self-start">
      <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden>
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
        <p className="leading-none font-medium">
          L {current?.TotalLaps ?? 0}
          {used ? "*" : ""}
        </p>
        <p className="text-sm leading-none text-zinc-500">PIT {Math.max(0, stints.length - 1)}</p>
      </div>
    </div>
  );
}

/** Positions gained/lost vs the grid, plus the car's status word. */
export function InfoCell({
  timing,
  gridPos,
}: {
  timing: TimingDataDriver;
  gridPos: number | null;
}) {
  const current = Number(timing.Position);
  const diff = gridPos !== null && Number.isFinite(current) ? gridPos - current : null;
  const diffText =
    diff === null ? `${timing.NumberOfLaps ?? 0}L` : diff > 0 ? `+${diff}` : String(diff);
  const diffCls =
    diff === null || diff === 0 ? "text-zinc-500" : diff > 0 ? "text-emerald-500" : "text-red-500";

  return (
    <div className="place-self-start">
      <p className={`text-lg leading-none font-medium tabular-nums ${diffCls}`}>{diffText}</p>
      <p className="text-sm leading-none text-zinc-500">{statusWord(timing)}</p>
    </div>
  );
}

function statusWord(timing: TimingDataDriver): string {
  if (timing.KnockedOut) return "OUT";
  if (timing.Cutoff) return "CUTOFF";
  if (timing.Retired) return "RETIRED";
  if (timing.Stopped) return "STOPPED";
  if (timing.InPit) return "PIT";
  if (timing.PitOut) return "PIT OUT";
  return "—";
}

/** Interval to the car ahead over gap to the leader. */
export function GapCell({ timing }: { timing: TimingDataDriver }) {
  const interval = timing.IntervalToPositionAhead?.Value || timing.TimeDiffToPositionAhead || "";
  const gap = timing.GapToLeader || timing.TimeDiffToFastest || "";
  const catching = Boolean(timing.IntervalToPositionAhead?.Catching) && Boolean(interval);

  return (
    <div className="place-self-start">
      <p
        className={`text-lg leading-none font-medium tabular-nums ${
          catching ? "text-emerald-500" : interval ? "" : "text-zinc-500"
        }`}
      >
        {interval || "-- ---"}
      </p>
      <p className="text-sm leading-none tabular-nums text-zinc-500">{gap || "-- ---"}</p>
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
    <div className="place-self-start">
      <p className={`text-lg leading-none font-medium tabular-nums ${lastCls}`}>
        {last?.Value || "-- -- ---"}
      </p>
      <p
        className={`text-sm leading-none tabular-nums ${
          hasFastest ? "text-violet-500" : "text-zinc-500"
        }`}
      >
        {timing.BestLapTime?.Value || "-- -- ---"}
      </p>
    </div>
  );
}
