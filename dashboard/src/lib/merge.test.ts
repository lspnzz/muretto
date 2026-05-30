import { describe, expect, it } from "vitest";

import { deepMerge } from "./merge";

describe("deepMerge", () => {
  it("replaces scalars", () => {
    expect(deepMerge({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
  });

  it("merges nested objects, leaving siblings intact", () => {
    const base = { Driver: { Tla: "HAM", Position: "3", TeamColour: "00D2BE" } };
    const out = deepMerge(base, { Driver: { Position: "1" } });
    expect(out).toEqual({ Driver: { Tla: "HAM", Position: "1", TeamColour: "00D2BE" } });
  });

  it("removes keys on null (keyed-collection remove)", () => {
    expect(deepMerge({ "44": {}, "16": {} }, { "44": null })).toEqual({ "16": {} });
  });

  it("replaces arrays wholesale", () => {
    expect(deepMerge({ Entries: [1, 2, 3] }, { Entries: [9] })).toEqual({ Entries: [9] });
  });

  it("adds new keyed entries", () => {
    const out = deepMerge({ "44": { Line: 1 } }, { "16": { Line: 2 } });
    expect(out).toEqual({ "44": { Line: 1 }, "16": { Line: 2 } });
  });

  it("does not mutate the base", () => {
    const base = { a: { b: 1 } };
    deepMerge(base, { a: { b: 2 } });
    expect(base).toEqual({ a: { b: 1 } });
  });
});
