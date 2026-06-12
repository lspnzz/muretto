"use client";

import { useEffect, useState } from "react";

import { remainingClock } from "@/lib/clock";
import { useDataStore } from "@/stores/useDataStore";

/** Session name and the running countdown clock. */
export function SessionStrip() {
  const state = useDataStore((s) => s.state);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(tick);
  }, []);

  const session = state.SessionInfo;
  const part = state.TimingData?.SessionPart;
  const partSuffix =
    part && session?.Name?.toLowerCase().includes("qualifying") ? ` Q${part}` : "";
  const remaining = remainingClock(state.ExtrapolatedClock, now);

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <h1 className="truncate text-sm leading-none font-medium text-white">
        {session ? `${session.Meeting?.Name}: ${session.Name}${partSuffix}` : "—"}
      </h1>
      <p className="font-mono text-2xl leading-none font-extrabold tabular-nums">
        {remaining ?? "--:--:--"}
      </p>
    </div>
  );
}
