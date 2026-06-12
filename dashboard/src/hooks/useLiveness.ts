"use client";

import { useEffect, useState } from "react";

import { deriveLiveness, type Liveness } from "@/lib/liveness";
import { useDataStore } from "@/stores/useDataStore";

const RECHECK_MS = 5_000;

/**
 * Liveness of the rendered state. Re-evaluated on a slow tick as well as on
 * data changes, because staleness is a function of wall-clock time — a feed
 * that stops sending must age out with no new renders to trigger it.
 */
export function useLiveness(): Liveness {
  const state = useDataStore((s) => s.state);
  const lastEventAt = useDataStore((s) => s.lastEventAt);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), RECHECK_MS);
    return () => clearInterval(tick);
  }, []);

  return deriveLiveness(state, lastEventAt, now);
}
