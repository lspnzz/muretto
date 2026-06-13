import type { TimingDataDriver } from "@/types";

export type TimingGapDisplay = {
  gap: string;
  interval: string;
  catching: boolean;
};

export function timingGapDisplay(
  timing: TimingDataDriver,
  sessionPart: number | null | undefined,
): TimingGapDisplay {
  const activeStats = statsForSessionPart(timing, sessionPart);
  const gap =
    clean(timing.GapToLeader) ||
    clean(activeStats?.TimeDiffToFastest) ||
    clean(timing.TimeDiffToFastest);
  const interval =
    clean(timing.IntervalToPositionAhead?.Value) ||
    clean(activeStats?.TimeDiffToPositionAhead) ||
    clean(timing.TimeDiffToPositionAhead);

  return {
    gap,
    interval,
    catching: Boolean(timing.IntervalToPositionAhead?.Catching) && Boolean(interval),
  };
}

function statsForSessionPart(
  timing: TimingDataDriver,
  sessionPart: number | null | undefined,
): TimingDataDriver["Stats"][string] | undefined {
  const stats = timing.Stats;
  if (!stats) return undefined;

  const selected = sessionPart && sessionPart > 0 ? stats[String(sessionPart - 1)] : undefined;
  if (selected) return selected;

  const latestKey = Object.keys(stats)
    .filter((key) => stats[key])
    .sort((left, right) => Number(left) - Number(right))
    .at(-1);
  return latestKey ? stats[latestKey] : undefined;
}

function clean(value: string | null | undefined): string {
  return value?.trim() ?? "";
}
