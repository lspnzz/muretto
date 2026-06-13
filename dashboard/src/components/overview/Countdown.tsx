"use client";

import { useEffect, useState } from "react";

const UNITS = [
  ["days", 86_400_000],
  ["hours", 3_600_000],
  ["min", 60_000],
  ["sec", 1_000],
] as const;

export function Countdown({ targetIso, label }: { targetIso: string; label: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(tick);
  }, []);

  const diff = Date.parse(targetIso) - now;
  if (!Number.isFinite(diff)) return null;

  if (diff <= 0) {
    return (
      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-600">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-zinc-200">Underway</p>
      </div>
    );
  }

  let rest = diff;
  const parts = UNITS.map(([unit, ms]) => {
    const value = Math.floor(rest / ms);
    rest -= value * ms;
    return { unit, value };
  });

  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-zinc-600">{label}</p>
      <div className="mt-1 flex gap-4">
        {parts.map(({ unit, value }) => (
          <div key={unit} className="min-w-12">
            <p className="text-3xl font-bold tabular-nums text-zinc-100">
              {String(value).padStart(2, "0")}
            </p>
            <p className="text-xs text-zinc-600">{unit}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
