import { create } from "zustand";

import type { State } from "@/types";

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
  setState: (state: State) => void;
  setConnected: (connected: boolean) => void;
  setLastEventAt: (lastEventAt: number) => void;
  setDelayMs: (delayMs: number) => void;
};

export const useDataStore = create<DataStore>((set) => ({
  state: {} as State,
  connected: false,
  lastEventAt: null,
  delayMs: 0,
  maxDelayMs: 120_000,
  setState: (state) => set({ state }),
  setConnected: (connected) => set({ connected }),
  setLastEventAt: (lastEventAt) => set({ lastEventAt }),
  setDelayMs: (delayMs) => set({ delayMs }),
}));
