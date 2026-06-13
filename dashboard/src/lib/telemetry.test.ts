import { describe, expect, it } from "vitest";

import { appendTrace, latestSample, type TelemetrySample } from "./telemetry";
import type { CarData } from "@/types";

function channels(speed: number, overrides: Partial<Record<string, number>> = {}) {
  return {
    "0": 11000,
    "2": speed,
    "3": 7,
    "4": 100,
    "5": 0,
    "45": 0,
    ...overrides,
  };
}

function batch(...entries: Array<[string, Record<string, ReturnType<typeof channels>>]>): CarData {
  return {
    Entries: entries.map(([utc, cars]) => ({
      Utc: utc,
      Cars: Object.fromEntries(
        Object.entries(cars).map(([num, ch]) => [num, { Channels: ch }]),
      ),
    })),
  } as CarData;
}

function sample(utc: string, speed: number): TelemetrySample {
  return {
    utcMs: Date.parse(utc),
    rpm: 11000,
    speed,
    gear: 7,
    throttle: 100,
    brake: 0,
  };
}

describe("latestSample", () => {
  it("returns the newest sample for the driver", () => {
    const data = batch(
      ["2026-06-12T14:00:00Z", { "44": channels(280) }],
      ["2026-06-12T14:00:00.300Z", { "44": channels(287), "16": channels(265) }],
    );
    expect(latestSample(data, "44")?.speed).toBe(287);
    expect(latestSample(data, "16")?.speed).toBe(265);
  });

  it("skips entries missing the driver and handles absence", () => {
    const data = batch(["2026-06-12T14:00:00Z", { "44": channels(280) }]);
    expect(latestSample(data, "1")).toBeNull();
    expect(latestSample(null, "44")).toBeNull();
    expect(latestSample(undefined, "44")).toBeNull();
  });
});

describe("appendTrace", () => {
  const t0 = "2026-06-12T14:00:00Z";
  const t1 = "2026-06-12T14:00:00.300Z";
  const t2 = "2026-06-12T14:00:00.600Z";

  it("appends only samples newer than the tail", () => {
    const trace = [sample(t0, 280)];
    const data = batch([t0, { "44": channels(280) }], [t1, { "44": channels(287) }]);
    const next = appendTrace(trace, data, "44", 10);
    expect(next.map((s) => s.speed)).toEqual([280, 287]);
  });

  it("returns the trace unchanged for an already-seen batch", () => {
    const trace = [sample(t0, 280), sample(t1, 287)];
    const data = batch([t1, { "44": channels(287) }]);
    expect(appendTrace(trace, data, "44", 10)).toBe(trace);
  });

  it("drops the oldest samples past the cap", () => {
    const trace = [sample(t0, 280)];
    const data = batch([t1, { "44": channels(287) }], [t2, { "44": channels(291) }]);
    const next = appendTrace(trace, data, "44", 2);
    expect(next.map((s) => s.speed)).toEqual([287, 291]);
  });

  it("starts over when the batch is older than the tail (delay rewind)", () => {
    const trace = [sample(t2, 291)];
    const data = batch([t0, { "44": channels(280) }], [t1, { "44": channels(287) }]);
    const next = appendTrace(trace, data, "44", 10);
    expect(next.map((s) => s.speed)).toEqual([280, 287]);
  });

  it("ignores batches without the driver", () => {
    const trace = [sample(t0, 280)];
    const data = batch([t1, { "16": channels(265) }]);
    expect(appendTrace(trace, data, "44", 10)).toBe(trace);
  });
});
