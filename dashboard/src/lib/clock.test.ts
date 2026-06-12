import { describe, expect, it } from "vitest";

import { formatHms, parseHms, remainingClock } from "./clock";

describe("hms round-trip", () => {
  it("parses and formats", () => {
    expect(parseHms("01:23:45")).toBe(5_025_000);
    expect(formatHms(5_025_000)).toBe("01:23:45");
    expect(parseHms("nope")).toBeNull();
    expect(formatHms(-5)).toBe("00:00:00");
  });
});

describe("remainingClock", () => {
  const anchor = Date.parse("2026-06-12T14:00:00Z");

  it("extrapolates while running", () => {
    const clock = { Utc: "2026-06-12T14:00:00Z", Remaining: "01:00:00", Extrapolating: true };
    expect(remainingClock(clock, anchor + 90_000)).toBe("00:58:30");
  });

  it("holds still when not extrapolating", () => {
    const clock = { Utc: "2026-06-12T14:00:00Z", Remaining: "00:42:00", Extrapolating: false };
    expect(remainingClock(clock, anchor + 90_000)).toBe("00:42:00");
  });

  it("does not extrapolate against a recorded anchor", () => {
    const clock = { Utc: "2022-07-03T14:20:00Z", Remaining: "01:23:45", Extrapolating: true };
    expect(remainingClock(clock, Date.parse("2026-06-12T14:00:00Z"))).toBe("01:23:45");
  });

  it("is null without a clock", () => {
    expect(remainingClock(null, anchor)).toBeNull();
  });
});
