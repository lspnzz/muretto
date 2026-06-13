import { describe, expect, it } from "vitest";

import { overtakeMode, straightMode } from "./raceControl";
import type { Message, RaceControlMessages } from "@/types";

function rcm(...texts: string[]): RaceControlMessages {
  const Messages = Object.fromEntries(
    texts.map((text, i) => [
      String(i),
      { Utc: "2026-06-12T14:00:00Z", Message: text, Category: "Other" } as Message,
    ]),
  );
  return { Messages };
}

describe("overtakeMode", () => {
  it("is null until Race Control announces a state", () => {
    expect(overtakeMode(null)).toBeNull();
    expect(overtakeMode(rcm("GREEN LIGHT - PIT EXIT OPEN"))).toBeNull();
  });

  it("reads the announced state", () => {
    expect(overtakeMode(rcm("OVERTAKE ENABLED"))).toBe("enabled");
    expect(overtakeMode(rcm("OVERTAKE DISABLED"))).toBe("disabled");
  });

  it("last announcement wins, in numeric key order", () => {
    const messages = rcm(
      "OVERTAKE ENABLED",
      ...Array.from({ length: 9 }, () => "YELLOW IN TRACK SECTOR 7"),
      "OVERTAKE DISABLED",
    );
    // Keys "0".."10": lexicographic order would put "10" before "2".
    expect(overtakeMode(messages)).toBe("disabled");
  });
});

describe("straightMode", () => {
  it("maps the three announced states", () => {
    expect(straightMode(rcm("STRAIGHT MODE - NORMAL GRIP"))).toBe("normal grip");
    expect(straightMode(rcm("STRAIGHT MODE - LOW GRIP"))).toBe("low grip");
    expect(straightMode(rcm("STRAIGHT MODE - DISABLED"))).toBe("disabled");
    expect(straightMode(rcm("GREEN LIGHT"))).toBeNull();
  });

  it("ignores unrelated DISABLED words without the STRAIGHT MODE prefix", () => {
    expect(straightMode(rcm("DRS DISABLED"))).toBeNull();
  });
});
