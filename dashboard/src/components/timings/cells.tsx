"use client";

// The small leaderboard cells. Column semantics and colour conventions:
// docs/references/strategy-screens.md (re-implemented, not copied — AGPL).
// No DRS column: post-2026 cars have none and the feed carries no
// energy-deployment channel.

import { tyreHex } from "@/lib/tyre";
import type { Stint, TimingDataDriver } from "@/types";

/** Compound-coloured tyre ring with current stint age inside. */
export function TyreCell({ stints }: { stints: Stint[] }) {
  const current = stints.at(-1);
  const compound = current?.Compound?.toUpperCase() ?? "";
  const laps = current?.TotalLaps ?? 0;

  return (
    <div className="justify-self-start">
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
          {laps}
        </text>
      </svg>
    </div>
  );
}

/** Stop count derived from stint count. */
export function PitCell({ stints }: { stints: Stint[] }) {
  return (
    <div className="justify-self-start font-mono text-base leading-none font-medium tabular-nums">
      {Math.max(0, stints.length - 1)}
    </div>
  );
}

/** Interval to the car ahead over gap to the leader. */
export function GapCell({ timing }: { timing: TimingDataDriver }) {
  const interval = timing.IntervalToPositionAhead?.Value || timing.TimeDiffToPositionAhead || "";
  const gap = timing.GapToLeader || timing.TimeDiffToFastest || "";
  const catching = Boolean(timing.IntervalToPositionAhead?.Catching) && Boolean(interval);

  return (
    <div className="justify-self-end text-right font-mono">
      <p
        className={`text-base leading-none font-medium tabular-nums ${
          catching ? "text-emerald-500" : interval ? "" : "text-zinc-500"
        }`}
      >
        {interval || "-- ---"}
      </p>
      <p className="mt-1 text-xs leading-none tabular-nums text-zinc-500">{gap || "-- ---"}</p>
    </div>
  );
}

/** In/out pit state sits in the unlabeled trailing status column when present. */
export function PitStatusCell({ timing }: { timing: TimingDataDriver }) {
  const pitWord = timing.InPit ? "IN PIT" : timing.PitOut ? "PIT OUT" : "";

  return (
    <div className="justify-self-end font-mono text-xs leading-none font-semibold text-cyan-400">
      {pitWord && <span>{pitWord}</span>}
    </div>
  );
}

/** Last lap time, with fastest-lap colouring. */
export function TimeCell({ timing }: { timing: TimingDataDriver }) {
  const last = timing.LastLapTime;
  const lastCls = last?.OverallFastest
    ? "text-violet-500"
    : last?.PersonalFastest
      ? "text-emerald-500"
      : last?.Value
        ? ""
        : "text-zinc-500";

  return (
    <div
      className={`justify-self-end text-right font-mono text-base leading-none font-medium tabular-nums ${lastCls}`}
    >
      {last?.Value || "-- -- ---"}
    </div>
  );
}

/** Personal best lap time, violet when it is the session best. */
export function BestLapCell({
  timing,
  hasFastest,
}: {
  timing: TimingDataDriver;
  hasFastest: boolean;
}) {
  return (
    <div
      className={`justify-self-end text-right font-mono text-base leading-none font-medium tabular-nums ${
        hasFastest ? "text-violet-500" : timing.BestLapTime?.Value ? "" : "text-zinc-500"
      }`}
    >
      {timing.BestLapTime?.Value || "-- -- ---"}
    </div>
  );
}
