import { describe, expect, it } from "vitest";

import type { TimingDataDriver } from "@/types";
import { timingGapDisplay } from "./timingGaps";

describe("timingGapDisplay", () => {
  it("shows gap to leader as the primary value", () => {
    const display = timingGapDisplay(
      line({
        GapToLeader: "+8.512",
        IntervalToPositionAhead: { Value: "+7.278", Catching: false },
      }),
      null,
    );

    expect(display).toEqual({
      gap: "+8.512",
      interval: "+7.278",
      catching: false,
    });
  });

  it("uses the active qualifying stats part when race gaps are absent", () => {
    const display = timingGapDisplay(
      line({
        Stats: {
          "0": { TimeDiffToFastest: "+0.800", TimeDiffToPositionAhead: "+0.500" },
          "1": { TimeDiffToFastest: "+0.231", TimeDiffToPositionAhead: "+0.120" },
        },
      }),
      2,
    );

    expect(display.gap).toBe("+0.231");
    expect(display.interval).toBe("+0.120");
  });

  it("falls back to top-level timing diffs", () => {
    const display = timingGapDisplay(
      line({
        TimeDiffToFastest: "+0.321",
        TimeDiffToPositionAhead: "+0.111",
      }),
      null,
    );

    expect(display.gap).toBe("+0.321");
    expect(display.interval).toBe("+0.111");
  });
});

function line(overrides: Partial<TimingDataDriver>): TimingDataDriver {
  return {
    RacingNumber: "44",
    Line: 1,
    Position: "1",
    ShowPosition: false,
    GapToLeader: "",
    IntervalToPositionAhead: null,
    TimeDiffToFastest: null,
    TimeDiffToPositionAhead: null,
    Stats: {},
    Retired: false,
    InPit: false,
    PitOut: false,
    Stopped: false,
    Status: 0,
    NumberOfLaps: null,
    KnockedOut: null,
    Cutoff: null,
    Sectors: {},
    Speeds: {
      I1: lapVal(),
      I2: lapVal(),
      FL: lapVal(),
      ST: lapVal(),
    },
    BestLapTime: lapVal(),
    LastLapTime: lapVal(),
    ...overrides,
  };
}

function lapVal() {
  return {
    Value: "",
    Status: 0,
    OverallFastest: false,
    PersonalFastest: false,
    Position: null,
  };
}
