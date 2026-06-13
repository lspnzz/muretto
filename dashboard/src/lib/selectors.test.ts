import { describe, expect, it } from "vitest";

import type { Driver, State } from "@/types";
import {
  currentStint,
  displayName,
  fastestSectorLeaders,
  pitCount,
  stintsForDriver,
} from "./selectors";

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

function driver(overrides: Partial<Driver>): Driver {
  return {
    RacingNumber: "44",
    BroadcastName: "",
    FullName: "",
    Tla: "",
    LastName: "",
    ...overrides,
  } as Driver;
}

describe("displayName", () => {
  it("prefers the surname", () => {
    const d = driver({ LastName: "Hamilton", FullName: "Lewis Hamilton", Tla: "HAM" });
    expect(displayName(d, "44")).toBe("Hamilton");
  });

  it("derives the surname from the full name", () => {
    expect(displayName(driver({ FullName: "Lewis Hamilton" }), "44")).toBe("Hamilton");
    expect(displayName(driver({ FullName: "Nyck de Vries" }), "21")).toBe("de Vries");
  });

  it("strips the initial from a broadcast name", () => {
    expect(displayName(driver({ BroadcastName: "M VERSTAPPEN" }), "1")).toBe("VERSTAPPEN");
  });

  it("falls back to TLA, then racing number", () => {
    expect(displayName(driver({ Tla: "ALO" }), "14")).toBe("ALO");
    expect(displayName(driver({}), "14")).toBe("14");
    expect(displayName(undefined, "14")).toBe("14");
  });
});

describe("stintsForDriver", () => {
  it("sorts stint history by feed index", () => {
    const currentState = state({
      TimingAppData: {
        Lines: {
          "44": {
            RacingNumber: "44",
            Line: 1,
            GridPos: "1",
            Stints: {
              "2": { Compound: "HARD", TotalLaps: 7, New: "FALSE" },
              "0": { Compound: "MEDIUM", TotalLaps: 14, New: "TRUE" },
              "1": { Compound: "SOFT", TotalLaps: 9, New: "TRUE" },
            },
          },
        },
      },
    });

    expect(stintsForDriver(currentState, "44").map((stint) => stint.Compound)).toEqual([
      "MEDIUM",
      "SOFT",
      "HARD",
    ]);
    expect(currentStint(currentState, "44")?.Compound).toBe("HARD");
    expect(pitCount(currentState, "44")).toBe(2);
  });
});

describe("fastestSectorLeaders", () => {
  it("returns session-best sector holders with team colours", () => {
    const currentState = state({
      DriverList: {
        "44": driver({ RacingNumber: "44", Tla: "HAM", TeamColour: "00D2BE", Line: 1 }),
        "16": driver({ RacingNumber: "16", Tla: "LEC", TeamColour: "DC0000", Line: 2 }),
      },
      TimingStats: {
        Lines: {
          "44": {
            BestSectors: [
              { Value: "28.143", Position: 2 },
              { Value: "33.421", Position: 1 },
            ],
          },
          "16": {
            BestSectors: [
              { Value: "28.301", Position: 1 },
              { Value: "33.298", Position: 2 },
            ],
          },
        },
      },
    });

    expect(fastestSectorLeaders(currentState)).toEqual([
      {
        sector: 0,
        racingNumber: "16",
        label: "LEC",
        color: "#DC0000",
        value: "28.301",
      },
      {
        sector: 1,
        racingNumber: "44",
        label: "HAM",
        color: "#00D2BE",
        value: "33.421",
      },
    ]);
  });
});
