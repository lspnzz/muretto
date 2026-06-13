// CarData accessors for the driver tab. The topic is replace-only — every
// tick carries a fresh `Entries` batch (a few UTC-stamped samples), so a
// rolling trace has to be accumulated client-side across successive states.

import type { CarChannels, CarData } from "@/types";

export type TelemetrySample = {
  utcMs: number;
  rpm: number;
  speed: number;
  gear: number;
  throttle: number;
  brake: number;
};

function toSample(utc: string, channels: CarChannels): TelemetrySample | null {
  const utcMs = Date.parse(utc);
  if (!Number.isFinite(utcMs)) return null;
  return {
    utcMs,
    rpm: channels["0"],
    speed: channels["2"],
    gear: channels["3"],
    throttle: channels["4"],
    brake: channels["5"],
  };
}

/** All samples for one driver in the current batch, oldest first. */
function batchSamples(carData: CarData | null | undefined, racingNumber: string) {
  const samples = (carData?.Entries ?? []).flatMap((entry) => {
    const channels = entry.Cars[racingNumber]?.Channels;
    const sample = channels ? toSample(entry.Utc, channels) : null;
    return sample ? [sample] : [];
  });
  samples.sort((a, b) => a.utcMs - b.utcMs);
  return samples;
}

/** The driver's newest sample in the current batch. */
export function latestSample(
  carData: CarData | null | undefined,
  racingNumber: string,
): TelemetrySample | null {
  return batchSamples(carData, racingNumber).at(-1) ?? null;
}

/**
 * Fold the current batch into a rolling trace: only samples newer than the
 * tail are appended (batches overlap across ticks), the oldest fall off past
 * `cap`. A batch entirely older than the tail means the delay slider rewound
 * — start over instead of rendering a folded timeline.
 */
export function appendTrace(
  trace: TelemetrySample[],
  carData: CarData | null | undefined,
  racingNumber: string,
  cap: number,
): TelemetrySample[] {
  const batch = batchSamples(carData, racingNumber);
  const newest = batch.at(-1);
  if (!newest) return trace;

  const tailMs = trace.at(-1)?.utcMs;
  if (tailMs !== undefined && newest.utcMs < tailMs) return batch.slice(-cap);

  const fresh = batch.filter((sample) => tailMs === undefined || sample.utcMs > tailMs);
  if (fresh.length === 0) return trace;
  return [...trace, ...fresh].slice(-cap);
}
