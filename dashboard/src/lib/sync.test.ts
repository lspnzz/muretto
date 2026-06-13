import { describe, expect, it } from "vitest";

import {
  type ClockAnchor,
  clampDelay,
  delayFromSessionStart,
  delayFromTvRemaining,
  liveRemainingMs,
  parseRemainingInput,
  parseWallClockInput,
} from "./sync";

const T0 = Date.parse("2026-06-12T14:00:00Z");

function anchor(remaining: string, receivedAt: number | null, extrapolating = true): ClockAnchor {
  return {
    clock: { Utc: "2026-06-12T14:00:00Z", Remaining: remaining, Extrapolating: extrapolating },
    receivedAt,
  };
}

describe("parseRemainingInput", () => {
  it("reads what a TV clock shows", () => {
    expect(parseRemainingInput("12:34")).toBe(754_000);
    expect(parseRemainingInput("1:02:03")).toBe(3_723_000);
    expect(parseRemainingInput(" 0:05 ")).toBe(5_000);
  });

  it("rejects garbage", () => {
    expect(parseRemainingInput("")).toBeNull();
    expect(parseRemainingInput("12:99")).toBeNull();
    expect(parseRemainingInput("soon")).toBeNull();
  });
});

describe("parseWallClockInput", () => {
  // Local-time refs so the assertions hold in any timezone.
  const ref = new Date(2026, 5, 12, 15, 10, 0).getTime();

  it("reads HH:MM:SS and HH:MM as today's local time", () => {
    expect(parseWallClockInput("15:03:07", ref)).toBe(new Date(2026, 5, 12, 15, 3, 7).getTime());
    expect(parseWallClockInput("15:03", ref)).toBe(new Date(2026, 5, 12, 15, 3, 0).getTime());
  });

  it("picks the nearest day around midnight", () => {
    const justAfterMidnight = new Date(2026, 5, 13, 0, 10, 0).getTime();
    expect(parseWallClockInput("23:58:00", justAfterMidnight)).toBe(
      new Date(2026, 5, 12, 23, 58, 0).getTime(),
    );
  });

  it("rejects garbage", () => {
    expect(parseWallClockInput("25:00", ref)).toBeNull();
    expect(parseWallClockInput("nope", ref)).toBeNull();
  });
});

describe("liveRemainingMs", () => {
  it("ticks down from the streamed-update receipt time", () => {
    expect(liveRemainingMs(anchor("00:10:00", T0), T0 + 90_000)).toBe(510_000);
  });

  it("keeps the receipt anchor for replayed recordings (ancient Utc)", () => {
    const replayed: ClockAnchor = {
      clock: { Utc: "2022-07-03T14:21:10Z", Remaining: "01:22:30", Extrapolating: true },
      receivedAt: T0,
    };
    expect(liveRemainingMs(replayed, T0 + 10_000)).toBe(4_940_000);
  });

  it("falls back to the feed Utc stamp for snapshot-only clocks", () => {
    expect(liveRemainingMs(anchor("00:10:00", null), T0 + 90_000)).toBe(510_000);
  });

  it("tolerates small clock skew on the Utc fallback", () => {
    // Feed stamp 30s ahead of the local clock: treat as "just anchored".
    expect(liveRemainingMs(anchor("00:10:00", null), T0 - 30_000)).toBe(600_000);
  });

  it("trusts the Utc stamp when a snapshot-borne clock arrives mid-stream", () => {
    // Received 10 min after its live-ish Utc stamp (upstream reconnect):
    // the content is 10 min old, so remaining has already burned that down.
    const snapshotBorne = anchor("00:30:00", T0 + 600_000);
    expect(liveRemainingMs(snapshotBorne, T0 + 660_000)).toBe(1_140_000);
  });

  it("is null when paused, recorded, or absent", () => {
    expect(liveRemainingMs(anchor("00:10:00", T0, false), T0)).toBeNull();
    const recorded: ClockAnchor = {
      clock: { Utc: "2022-07-03T14:20:00Z", Remaining: "01:23:45", Extrapolating: true },
      receivedAt: null,
    };
    expect(liveRemainingMs(recorded, T0)).toBeNull();
    expect(liveRemainingMs(null, T0)).toBeNull();
  });
});

describe("delay derivation", () => {
  it("TV remaining trails live by exactly the delay", () => {
    // Live is at 9:00 left; the TV still shows 9:45 → the TV is 45s behind.
    const tv = parseRemainingInput("9:45");
    expect(tv).not.toBeNull();
    expect(delayFromTvRemaining(anchor("00:10:00", T0), tv as number, T0 + 60_000)).toBe(45_000);
  });

  it("race start: delay is TV lights-out minus feed lights-out", () => {
    expect(delayFromSessionStart(T0, T0 + 47_000)).toBe(47_000);
  });

  it("clamps to the buffer window", () => {
    expect(clampDelay(-3_000, 120_000)).toBe(0);
    expect(clampDelay(47_500.4, 120_000)).toBe(47_500);
    expect(clampDelay(500_000, 120_000)).toBe(120_000);
  });
});
