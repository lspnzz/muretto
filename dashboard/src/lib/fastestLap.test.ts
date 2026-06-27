import { describe, expect, it } from "vitest";

import type { State, Stint } from "@/types";
import { fastestLapTyre } from "./fastestLap";

function state(overrides: Partial<State> = {}): State {
  return {
    Heartbeat: null,
    ExtrapolatedClock: null,
    TrackStatus: null,
    SessionStatus: null,
    SessionInfo: null,
    LapCount: null,
    WeatherData: null,
    DriverList: null,
    TimingData: null,
    TimingAppData: null,
    RaceControlMessages: null,
    CarData: null,
    Position: null,
    TimingStats: null,
    TopThree: null,
    SessionData: null,
    TeamRadio: null,
    ChampionshipPrediction: null,
    LastFeedEventMs: null,
    ...overrides,
  };
}

function withRun(bestLap: number | null, stints: Record<string, Stint>): State {
  return state({
    TimingStats:
      bestLap == null ? { Lines: {} } : { Lines: { "1": { PersonalBestLapTime: { Lap: bestLap } } } },
    TimingAppData: {
      Lines: { "1": { RacingNumber: "1", Line: 1, GridPos: "1", Stints: stints } },
    },
  });
}

function stint(compound: string, totalLaps: number, startLaps = 0, isNew = "TRUE"): Stint {
  return { Compound: compound, TotalLaps: totalLaps, StartLaps: startLaps, New: isNew };
}

describe("fastestLapTyre", () => {
  it("attributes a lap within a single fresh stint", () => {
    expect(fastestLapTyre(withRun(5, { "0": stint("SOFT", 12) }), "1")).toEqual({
      compound: "SOFT",
      age: 5,
    });
  });

  it("maps the lap onto the right stint across pit stops", () => {
    // stint 0 = laps 1-10 (MEDIUM), stint 1 = laps 11-18 (SOFT).
    const s = withRun(14, { "0": stint("MEDIUM", 10), "1": stint("SOFT", 8) });
    expect(fastestLapTyre(s, "1")).toEqual({ compound: "SOFT", age: 4 });
  });

  it("counts the carried-over age of a used set", () => {
    // stint 0 started 3 laps old, ran 5 laps (laps 1-5) before pitting.
    const s = withRun(4, { "0": stint("HARD", 8, 3, "FALSE"), "1": stint("SOFT", 6) });
    expect(fastestLapTyre(s, "1")).toEqual({ compound: "HARD", age: 7 });
  });

  it("falls back to the latest stint when totals lag the best lap", () => {
    // Coverage ends at lap 18 but the best lap is reported on lap 20.
    const s = withRun(20, { "0": stint("MEDIUM", 10), "1": stint("SOFT", 8) });
    expect(fastestLapTyre(s, "1")).toEqual({ compound: "SOFT", age: 10 });
  });

  it("returns null without a best-lap lap number", () => {
    expect(fastestLapTyre(withRun(null, { "0": stint("SOFT", 6) }), "1")).toBeNull();
  });

  it("returns null without stint data", () => {
    expect(fastestLapTyre(withRun(5, {}), "1")).toBeNull();
  });

  it("returns null when the compound is unknown", () => {
    const s = withRun(3, { "0": { Compound: null, TotalLaps: 6, StartLaps: 0, New: "TRUE" } });
    expect(fastestLapTyre(s, "1")).toBeNull();
  });
});
