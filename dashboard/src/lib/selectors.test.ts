import { describe, expect, it } from "vitest";

import type { Driver, State } from "@/types";
import { currentStint, displayName, pitCount, stintsForDriver } from "./selectors";

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
    const state = {
      Heartbeat: null,
      ExtrapolatedClock: null,
      TrackStatus: null,
      SessionStatus: null,
      SessionInfo: null,
      LapCount: null,
      WeatherData: null,
      DriverList: null,
      TimingData: null,
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
      RaceControlMessages: null,
      CarData: null,
      Position: null,
      TimingStats: null,
      TopThree: null,
      SessionData: null,
      TeamRadio: null,
      ChampionshipPrediction: null,
      LastFeedEventMs: null,
    } satisfies State;

    expect(stintsForDriver(state, "44").map((stint) => stint.Compound)).toEqual([
      "MEDIUM",
      "SOFT",
      "HARD",
    ]);
    expect(currentStint(state, "44")?.Compound).toBe("HARD");
    expect(pitCount(state, "44")).toBe(2);
  });
});
