"use client";

import { useEffect, useRef } from "react";

import { LIVE_STREAM_URL } from "@/lib/env";
import { deepMerge } from "@/lib/merge";
import { type Frame, pickFrame, trimBuffer } from "@/lib/buffer";
import { useDataStore } from "@/stores/useDataStore";
import type { State } from "@/types";

const TICK_MS = 100;
const MAX_AGE_MS = 30_000;

/**
 * Connects to the realtime SSE stream, merges `initial`/`update` events into a
 * time-indexed buffer, and ticks the snapshot that was current `delayMs` ago
 * into the store. Mount once near the tree root.
 */
export function useLiveData() {
  const live = useRef<State>({} as State);
  const buffer = useRef<Frame<State>[]>([]);

  useEffect(() => {
    const sse = new EventSource(LIVE_STREAM_URL);
    const now = () => Date.now();

    sse.onopen = () => useDataStore.getState().setConnected(true);
    sse.onerror = () => useDataStore.getState().setConnected(false);

    sse.addEventListener("initial", (event) => {
      live.current = JSON.parse((event as MessageEvent).data) as State;
      buffer.current = [{ t: now(), snapshot: structuredClone(live.current) }];
    });

    sse.addEventListener("update", (event) => {
      const patch = JSON.parse((event as MessageEvent).data);
      live.current = deepMerge(live.current, patch) as State;
      buffer.current.push({ t: now(), snapshot: structuredClone(live.current) });
      buffer.current = trimBuffer(buffer.current, now(), MAX_AGE_MS);
    });

    const tick = setInterval(() => {
      const { delayMs, setState } = useDataStore.getState();
      const snapshot = pickFrame(buffer.current, now() - delayMs);
      if (snapshot) setState(snapshot);
    }, TICK_MS);

    return () => {
      clearInterval(tick);
      sse.close();
      useDataStore.getState().setConnected(false);
    };
  }, []);
}
