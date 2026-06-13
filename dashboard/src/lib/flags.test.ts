import { describe, expect, it } from "vitest";

import {
  deriveYellowSectors,
  marshalSegments,
  sliceSegment,
  trackMapFlags,
} from "./flags";
import type { Message, RaceControlMessages } from "@/types";

function rcm(...messages: Array<Partial<Message>>): RaceControlMessages {
  const entries = messages.map((msg, i) => [
    String(i),
    { Utc: `2022-07-03T14:0${i}:00Z`, Lap: 1, Message: "", Category: "Flag", ...msg },
  ]);
  return { Messages: Object.fromEntries(entries) };
}

const yellow = (sector: number): Partial<Message> => ({
  Flag: "YELLOW",
  Scope: "Sector",
  Sector: sector,
});
const doubleYellow = (sector: number): Partial<Message> => ({
  Flag: "DOUBLE YELLOW",
  Scope: "Sector",
  Sector: sector,
});
const clear = (sector: number): Partial<Message> => ({
  Flag: "CLEAR",
  Scope: "Sector",
  Sector: sector,
});

describe("deriveYellowSectors", () => {
  it("is empty without messages", () => {
    expect(deriveYellowSectors(undefined).sectors.size).toBe(0);
    expect(deriveYellowSectors({ Messages: {} }).sectors.size).toBe(0);
  });

  it("adds yellow sectors and clears them individually", () => {
    const { sectors } = deriveYellowSectors(rcm(yellow(2), yellow(8), clear(2)));
    expect([...sectors.keys()]).toEqual([8]);
  });

  it("upgrades a sector to double yellow", () => {
    const { sectors } = deriveYellowSectors(rcm(yellow(5), doubleYellow(5)));
    expect(sectors.get(5)).toBe("double-yellow");
  });

  it("treats a message with a sector as sector-scoped even without Scope", () => {
    const { sectors } = deriveYellowSectors(rcm({ Flag: "YELLOW", Sector: 3 }));
    expect(sectors.get(3)).toBe("yellow");
  });

  it("wipes everything on a track-scoped green", () => {
    const { sectors, trackWide } = deriveYellowSectors(
      rcm(yellow(2), doubleYellow(8), { Flag: "GREEN", Scope: "Track" }),
    );
    expect(sectors.size).toBe(0);
    expect(trackWide).toBe(false);
  });

  it("flags a track-wide yellow when the message has no sector", () => {
    const { trackWide } = deriveYellowSectors(rcm({ Flag: "YELLOW", Scope: "Track" }));
    expect(trackWide).toBe(true);
  });

  it("replays keys in numeric order, not lexicographic", () => {
    // Key "10" must apply after "9" — a lexicographic sort would slot it
    // before "2" and resurrect the cleared sector.
    const messages: RaceControlMessages = {
      Messages: {
        "9": { ...yellow(4), Utc: "", Lap: 1, Message: "", Category: "Flag" } as Message,
        "10": { ...clear(4), Utc: "", Lap: 1, Message: "", Category: "Flag" } as Message,
      },
    };
    expect(deriveYellowSectors(messages).sectors.size).toBe(0);
  });

  it("ignores messages without a flag", () => {
    const { sectors } = deriveYellowSectors(
      rcm({ Message: "TRACK LIMITS - LAP DELETED", Category: "Other", Flag: null }),
    );
    expect(sectors.size).toBe(0);
  });
});

describe("trackMapFlags", () => {
  const withYellow = rcm(yellow(2));

  it("maps status codes to whole-track modes", () => {
    expect(trackMapFlags("5", withYellow).kind).toBe("red");
    expect(trackMapFlags("4", withYellow).kind).toBe("sc");
    expect(trackMapFlags("6", withYellow).kind).toBe("vsc");
    expect(trackMapFlags("7", withYellow).kind).toBe("vsc-ending");
  });

  it("carries sector detail only in the yellow states", () => {
    const flags = trackMapFlags("2", withYellow);
    expect(flags.kind).toBe("yellow");
    if (flags.kind === "yellow") expect(flags.sectors.get(2)).toBe("yellow");
  });

  it("is clear when the track status says so, despite stale yellows in the log", () => {
    expect(trackMapFlags("1", withYellow).kind).toBe("clear");
    expect(trackMapFlags(undefined, withYellow).kind).toBe("clear");
  });
});

describe("marshalSegments", () => {
  // A 36-point circle; marshal posts at 0°, 90°, 180°, 270° → indices 0, 9, 18, 27.
  const outline = Array.from({ length: 36 }, (_, i) => ({
    x: 100 * Math.cos((i * 10 * Math.PI) / 180),
    y: 100 * Math.sin((i * 10 * Math.PI) / 180),
  }));
  const post = (number: number, degrees: number) => ({
    number,
    trackPosition: {
      x: 100 * Math.cos((degrees * Math.PI) / 180),
      y: 100 * Math.sin((degrees * Math.PI) / 180),
    },
  });

  it("splits the outline at the nearest point to each post, wrapping the last", () => {
    const segments = marshalSegments(outline, [post(1, 0), post(2, 90), post(3, 180), post(4, 270)]);
    expect(segments).toEqual([
      { number: 1, start: 0, end: 9 },
      { number: 2, start: 9, end: 18 },
      { number: 3, start: 18, end: 27 },
      { number: 4, start: 27, end: 0 },
    ]);
  });

  it("orders segments by sector number regardless of input order", () => {
    const segments = marshalSegments(outline, [post(2, 90), post(1, 0)]);
    expect(segments.map((s) => s.number)).toEqual([1, 2]);
  });

  it("returns nothing without enough posts or outline", () => {
    expect(marshalSegments(outline, undefined)).toEqual([]);
    expect(marshalSegments(outline, [post(1, 0)])).toEqual([]);
    expect(marshalSegments([], [post(1, 0), post(2, 90)])).toEqual([]);
  });
});

describe("sliceSegment", () => {
  const points = [0, 1, 2, 3, 4, 5];

  it("slices inclusively", () => {
    expect(sliceSegment(points, { number: 1, start: 1, end: 3 })).toEqual([1, 2, 3]);
  });

  it("wraps past the end of the outline", () => {
    expect(sliceSegment(points, { number: 1, start: 4, end: 1 })).toEqual([4, 5, 0, 1]);
  });
});
