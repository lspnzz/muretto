"use client";

import { useDataStore } from "@/stores/useDataStore";

export function DelayControl() {
  const delayMs = useDataStore((s) => s.delayMs);
  const maxDelayMs = useDataStore((s) => s.maxDelayMs);
  const setDelayMs = useDataStore((s) => s.setDelayMs);

  return (
    <label className="flex items-center gap-2 text-sm text-zinc-400">
      <span>delay</span>
      <input
        type="range"
        min={0}
        max={maxDelayMs}
        step={500}
        value={delayMs}
        onChange={(e) => setDelayMs(Number(e.target.value))}
        className="accent-zinc-300"
      />
      <span className="w-10 tabular-nums text-zinc-300">{(delayMs / 1000).toFixed(1)}s</span>
    </label>
  );
}
