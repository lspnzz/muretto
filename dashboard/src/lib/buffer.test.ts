import { describe, expect, it } from "vitest";

import { type Frame, pickFrame, trimBuffer } from "./buffer";

const frames: Frame<string>[] = [
  { t: 1000, snapshot: "a" },
  { t: 2000, snapshot: "b" },
  { t: 3000, snapshot: "c" },
];

describe("pickFrame", () => {
  it("returns the newest frame at or before the target time", () => {
    expect(pickFrame(frames, 2500)).toBe("b");
    expect(pickFrame(frames, 3000)).toBe("c");
    expect(pickFrame(frames, 9999)).toBe("c"); // live edge
  });

  it("returns the oldest frame when the target predates all frames", () => {
    expect(pickFrame(frames, 0)).toBe("a");
  });

  it("returns null for an empty buffer", () => {
    expect(pickFrame([], 1000)).toBeNull();
  });
});

describe("trimBuffer", () => {
  it("drops frames older than the window but keeps one base frame", () => {
    // now=3000, window=1000 -> cutoff=2000; keep last frame < 2000 (t=1000) + newer
    const trimmed = trimBuffer(frames, 3000, 1000);
    expect(trimmed.map((f) => f.t)).toEqual([1000, 2000, 3000]);
  });

  it("removes frames well past the window", () => {
    const trimmed = trimBuffer(frames, 5000, 1000); // cutoff=4000
    expect(trimmed.map((f) => f.t)).toEqual([3000]);
  });
});
