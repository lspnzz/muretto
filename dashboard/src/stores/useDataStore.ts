import { create } from "zustand";

import type { ClockAnchor } from "@/lib/sync";
import type { State } from "@/types";

/** Wall receipt time of an observed `SessionStatus` flip to "Started". */
export type SessionStartAnchor = { at: number; sessionKey: number | null };

type DataStore = {
  /** The delayed snapshot currently being rendered. */
  state: State;
  connected: boolean;
  /** Wall-clock receipt time of the last SSE `update`, for liveness. */
  lastEventAt: number | null;
  /** Replay delay in ms (0 = live). */
  delayMs: number;
  /** Slider ceiling; also how much history the snapshot buffer retains. */
  maxDelayMs: number;
  /** Latest *live* session clock — sync anchor, never delayed (lib/sync.ts). */
  liveClock: ClockAnchor | null;
  /** Live-observed session start — sync anchor, never delayed. */
  sessionStartedAt: SessionStartAnchor | null;
  setState: (state: State) => void;
  setConnected: (connected: boolean) => void;
  setLastEventAt: (lastEventAt: number) => void;
  setDelayMs: (delayMs: number) => void;
  setLiveClock: (liveClock: ClockAnchor | null) => void;
  setSessionStartedAt: (sessionStartedAt: SessionStartAnchor | null) => void;
};

export const useDataStore = create<DataStore>((set) => ({
  state: {} as State,
  connected: false,
  lastEventAt: null,
  delayMs: 0,
  maxDelayMs: 120_000,
  liveClock: null,
  sessionStartedAt: null,
  setState: (state) => set({ state }),
  setConnected: (connected) => set({ connected }),
  setLastEventAt: (lastEventAt) => set({ lastEventAt }),
  setDelayMs: (delayMs) => set({ delayMs }),
  setLiveClock: (liveClock) => set({ liveClock }),
  setSessionStartedAt: (sessionStartedAt) => set({ sessionStartedAt }),
}));
