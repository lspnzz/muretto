import { describe, expect, it } from "vitest";

import { deriveLiveness, ENDED_GRACE_MS, FRESH_WINDOW_MS } from "./liveness";
import type { State } from "@/types";

const NOW = 1_750_000_000_000;

function state(overrides: Partial<State>): State {
  return {
    SessionInfo: { Name: "Race" },
    ...overrides,
  } as State;
}

describe("deriveLiveness", () => {
  it("is none without session info", () => {
    expect(deriveLiveness(undefined, null, NOW)).toBe("none");
    expect(deriveLiveness({} as State, NOW, NOW)).toBe("none");
  });

  it("is live while updates flow", () => {
    expect(deriveLiveness(state({}), NOW - 5_000, NOW)).toBe("live");
  });

  it("trusts the server stamp before the first client update", () => {
    const s = state({ LastFeedEventMs: NOW - 10_000 });
    expect(deriveLiveness(s, null, NOW)).toBe("live");
  });

  it("goes stale when the feed falls silent", () => {
    const s = state({});
    expect(deriveLiveness(s, NOW - FRESH_WINDOW_MS - 1, NOW)).toBe("stale");
  });

  it("a held-over snapshot with no stamp is stale, not live", () => {
    // The deployed bug: data present, but nothing ever streamed.
    expect(deriveLiveness(state({}), null, NOW)).toBe("stale");
  });

  it("shows a just-finished session as ended", () => {
    const s = state({ SessionStatus: { Status: "Finalised" } });
    expect(deriveLiveness(s, NOW - 60_000, NOW)).toBe("ended");
  });

  it("an ended session ages out to stale", () => {
    const s = state({ SessionStatus: { Status: "Ends" } });
    expect(deriveLiveness(s, NOW - ENDED_GRACE_MS - 1, NOW)).toBe("stale");
  });

  it("a red flag stays live while data flows", () => {
    const s = state({ SessionStatus: { Status: "Aborted" } });
    expect(deriveLiveness(s, NOW - 1_000, NOW)).toBe("live");
  });

  it("a running session rides out quiet spells", () => {
    // Between qualifying segments nothing may stream for minutes.
    const s = state({ SessionStatus: { Status: "Started" } });
    expect(deriveLiveness(s, NOW - 5 * 60_000, NOW)).toBe("live");
    expect(deriveLiveness(s, NOW - 11 * 60_000, NOW)).toBe("stale");
  });

  it("without a running status the short window applies", () => {
    const s = state({ SessionStatus: { Status: "Inactive" } });
    expect(deriveLiveness(s, NOW - 3 * 60_000, NOW)).toBe("stale");
  });
});
