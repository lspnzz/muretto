import { describe, expect, it } from "vitest";

import { displayName } from "./selectors";
import type { Driver } from "@/types";

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
