import { describe, expect, it } from "vitest";

import { positionEntryFromOpenF1 } from "./trackPosition";

describe("positionEntryFromOpenF1", () => {
  it("keeps the newest location per driver", () => {
    const entry = positionEntryFromOpenF1([
      {
        date: "2026-06-13T14:00:01.000Z",
        driver_number: 44,
        x: 10,
        y: 20,
        z: 1,
      },
      {
        date: "2026-06-13T14:00:03.000Z",
        driver_number: 44,
        x: 30,
        y: 40,
        z: 2,
      },
      {
        date: "2026-06-13T14:00:02.000Z",
        driver_number: 16,
        x: -5,
        y: 12,
        z: 0,
      },
    ]);

    expect(entry).toEqual({
      Timestamp: "2026-06-13T14:00:03.000Z",
      Entries: {
        "16": { Status: "OnTrack", X: -5, Y: 12, Z: 0 },
        "44": { Status: "OnTrack", X: 30, Y: 40, Z: 2 },
      },
    });
  });

  it("ignores malformed rows and returns null when nothing is usable", () => {
    expect(
      positionEntryFromOpenF1([
        {
          date: "not a date",
          driver_number: 44,
          x: 10,
          y: 20,
          z: 0,
        },
        {
          date: "2026-06-13T14:00:03.000Z",
          driver_number: 16.5,
          x: 30,
          y: 40,
          z: 0,
        },
      ]),
    ).toBeNull();
  });
});
