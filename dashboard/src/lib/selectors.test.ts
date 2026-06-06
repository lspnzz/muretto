import { describe, expect, it } from "vitest";

import type { State } from "@/types";
import { currentStint, pitCount, stintsForDriver } from "./selectors";

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
