import { create } from "zustand";

import type { State } from "@/types";

type DataStore = {
  /** The delayed snapshot currently being rendered. */
  state: State;
  connected: boolean;
  /** Replay delay in ms (0 = live). */
  delayMs: number;
  maxDelayMs: number;
  setState: (state: State) => void;
  setConnected: (connected: boolean) => void;
  setDelayMs: (delayMs: number) => void;
};

export const useDataStore = create<DataStore>((set) => ({
  state: {} as State,
  connected: false,
  delayMs: 0,
  maxDelayMs: 30_000,
  setState: (state) => set({ state }),
  setConnected: (connected) => set({ connected }),
  setDelayMs: (delayMs) => set({ delayMs }),
}));
