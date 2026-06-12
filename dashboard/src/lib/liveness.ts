// Decide whether the state on screen is a live session or a held-over
// snapshot. Between weekends the F1 feed answers subscribe with the *last*
// session's data; the service keeps it in memory, so presence of data proves
// nothing. Two truth signals instead (plan 0003):
//
// - `SessionStatus` — `Finished`/`Finalised`/`Ends` mean the session is over.
// - freshness — the newest of the client's last SSE `update` receipt and the
//   server's `LastFeedEventMs` stamp (covers the gap between connecting and
//   the first delta). Wall-clock date checks are deliberately avoided so
//   replayed recordings count as live (invariant 7).

import type { State } from "@/types";

export type Liveness = "live" | "ended" | "stale" | "none";

/** Data must keep flowing within this window to count as live. */
export const FRESH_WINDOW_MS = 120_000;

/** After a session ends, keep showing its result this long, clearly badged. */
export const ENDED_GRACE_MS = 3 * 60 * 60 * 1000;

const ENDED_STATUSES = new Set(["Finished", "Finalised", "Ends"]);

export function deriveLiveness(
  state: State | undefined,
  lastEventAt: number | null,
  now: number,
): Liveness {
  if (!state?.SessionInfo) return "none";

  const newest = Math.max(lastEventAt ?? 0, state.LastFeedEventMs ?? 0);
  const age = newest > 0 ? now - newest : Number.POSITIVE_INFINITY;

  const status = state.SessionStatus?.Status;
  if (status && ENDED_STATUSES.has(status)) {
    return age <= ENDED_GRACE_MS ? "ended" : "stale";
  }

  return age <= FRESH_WINDOW_MS ? "live" : "stale";
}

/** True when the tabs should render timing widgets at all. */
export function showsLiveData(liveness: Liveness): boolean {
  return liveness === "live" || liveness === "ended";
}
