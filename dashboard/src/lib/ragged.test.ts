import { describe, expect, it } from "vitest";

import {
  bestSectorPosition,
  listEntries,
  personalBestLapPosition,
  teamRadioCaptures,
} from "./ragged";

describe("listEntries", () => {
  it("passes arrays through", () => {
    expect(listEntries([1, 2])).toEqual([1, 2]);
  });

  it("orders index-keyed objects numerically", () => {
    expect(listEntries({ "10": "j", "2": "b", "0": "a" })).toEqual(["a", "b", "j"]);
  });

  it("is empty for scalars and null", () => {
    expect(listEntries(null)).toEqual([]);
    expect(listEntries("x")).toEqual([]);
  });
});

describe("teamRadioCaptures", () => {
  const capture = { Utc: "2022-07-03T14:12:11Z", RacingNumber: "44", Path: "TeamRadio/a.mp3" };

  it("reads the snapshot array shape", () => {
    expect(teamRadioCaptures({ Captures: [capture] })).toEqual([
      { utc: capture.Utc, racingNumber: "44", path: "TeamRadio/a.mp3" },
    ]);
  });

  it("reads the delta keyed-object shape", () => {
    expect(teamRadioCaptures({ Captures: { "0": capture } })).toHaveLength(1);
  });

  it("drops malformed entries and tolerates junk", () => {
    expect(teamRadioCaptures({ Captures: [{ Utc: 3 }, capture] })).toHaveLength(1);
    expect(teamRadioCaptures(null)).toEqual([]);
    expect(teamRadioCaptures("nope")).toEqual([]);
  });
});

describe("timing stats accessors", () => {
  const stats = {
    Lines: {
      "44": {
        PersonalBestLapTime: { Value: "1:31.375", Position: 1 },
        BestSectors: [{ Position: 1 }, { Position: 2 }],
      },
    },
  };

  it("finds the personal-best rank", () => {
    expect(personalBestLapPosition(stats, "44")).toBe(1);
    expect(personalBestLapPosition(stats, "16")).toBeNull();
    expect(personalBestLapPosition(null, "44")).toBeNull();
  });

  it("finds best-sector ranks with array or keyed shapes", () => {
    expect(bestSectorPosition(stats, "44", 0)).toBe(1);
    expect(bestSectorPosition(stats, "44", 1)).toBe(2);
    expect(bestSectorPosition(stats, "44", 2)).toBeNull();
    const keyed = { Lines: { "44": { BestSectors: { "1": { Position: 3 } } } } };
    expect(bestSectorPosition(keyed, "44", 1)).toBe(3);
  });
});
