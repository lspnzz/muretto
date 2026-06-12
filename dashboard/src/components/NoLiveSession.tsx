"use client";

import Link from "next/link";

import { useLiveness } from "@/hooks/useLiveness";
import { useDataStore } from "@/stores/useDataStore";

/** Shown on Strategy/Timings instead of stale data when nothing is live. */
export function NoLiveSession() {
  const liveness = useLiveness();
  const connected = useDataStore((s) => s.connected);

  const subtitle = !connected
    ? "Connection to the realtime service is down."
    : liveness === "stale"
      ? "The realtime feed is quiet — timing data is hidden so it can't go stale."
      : "Waiting for a session to start.";

  return (
    <section className="flex h-full min-h-[20rem] flex-col items-center justify-center gap-3 px-6 text-center">
      <h2 className="text-2xl font-semibold text-zinc-200">No live session</h2>
      <p className="max-w-md text-sm text-zinc-500">{subtitle}</p>
      <Link
        href="/"
        className="mt-2 rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-900"
      >
        See the race overview →
      </Link>
    </section>
  );
}

/** Badge for the short window after a session where its result still shows. */
export function SessionEndedBanner() {
  return (
    <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-950 px-4 py-2 text-sm text-zinc-400">
      <span className="inline-block h-2 w-2 rounded-full bg-zinc-500" aria-hidden />
      Session ended — showing the final state, not live data.
    </div>
  );
}
