"use client";

// The small leaderboard cells. Column semantics and colour conventions:
// docs/references/strategy-screens.md (re-implemented, not copied — AGPL).
// No DRS column: post-2026 cars have none and the feed carries no
// energy-deployment channel.

import type { FastestLapTyre } from "@/lib/fastestLap";
import { tyreHex } from "@/lib/tyre";
import { timingGapDisplay } from "@/lib/timingGaps";
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

/**
 * Stop count derived from stint count — but while the car is in the pit lane,
 * the count is replaced by a transient IN/OUT indicator (the old standalone
 * pit-status column folded in here).
 */
export function PitCell({ stints, timing }: { stints: Stint[]; timing: TimingDataDriver }) {
  const pitState = timing.InPit ? "IN" : timing.PitOut ? "OUT" : null;

  return (
    <div className="justify-self-start font-mono text-base leading-none font-medium tabular-nums">
      {pitState ? (
        <span className="text-xs font-semibold text-cyan-400">{pitState}</span>
      ) : (
        Math.max(0, stints.length - 1)
      )}
    </div>
  );
}

/** Gap to the leader over interval to the car ahead. */
export function GapCell({
  timing,
  sessionPart,
}: {
  timing: TimingDataDriver;
  sessionPart: number | null | undefined;
}) {
  const { gap, interval, catching } = timingGapDisplay(timing, sessionPart);

  return (
    <div className="justify-self-end text-right font-mono">
      <p
        className={`text-base leading-none font-medium tabular-nums ${
          gap ? "" : "text-zinc-500"
        }`}
      >
        {gap || "-- ---"}
      </p>
      <p
        className={`mt-1 text-xs leading-none tabular-nums ${
          catching ? "text-emerald-500" : "text-zinc-500"
        }`}
      >
        {interval || "-- ---"}
      </p>
    </div>
  );
}

/** Last lap time, with fastest-lap colouring. */
export function LastLapCell({ timing }: { timing: TimingDataDriver }) {
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

/**
 * Personal best lap time (violet when it is the session best), followed by the
 * compound letter stacked over the tyre age for the lap it was set on. The
 * stacked badge is sized to the lap time's line height, so the cell stays one
 * line tall. This is the trailing column: a light left rule separates it from
 * the rest of the table. The cell fills its track (so the rule sits on the
 * column boundary) and stretches the full row height (so the rule reads as one
 * continuous line); content stays left-aligned so the lap times line up.
 */
export function BestLapCell({
  timing,
  hasFastest,
  fastestTyre,
}: {
  timing: TimingDataDriver;
  hasFastest: boolean;
  fastestTyre: FastestLapTyre | null;
}) {
  const timeCls = hasFastest ? "text-violet-500" : timing.BestLapTime?.Value ? "" : "text-zinc-500";

  return (
    <div
      className="flex items-center gap-1.5 self-stretch -my-1.5 border-l border-zinc-800 py-1.5 pl-3"
      title={
        fastestTyre
          ? `Fastest lap on ${fastestTyre.compound} (${fastestTyre.age} lap${
              fastestTyre.age === 1 ? "" : "s"
            })`
          : undefined
      }
    >
      <span className={`font-mono text-base leading-none font-medium tabular-nums ${timeCls}`}>
        {timing.BestLapTime?.Value || "-- -- ---"}
      </span>
      {fastestTyre && (
        <span className="flex h-4 flex-col items-center justify-center font-mono leading-none" aria-hidden>
          <span className="text-[8px] font-medium" style={{ color: tyreHex(fastestTyre.compound) }}>
            {fastestTyre.compound[0]}
          </span>
          <span className="text-[8px] tabular-nums text-zinc-500">{fastestTyre.age}</span>
        </span>
      )}
    </div>
  );
}
