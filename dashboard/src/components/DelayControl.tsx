"use client";

import { useDataStore } from "@/stores/useDataStore";

export function DelayControl() {
  const delayMs = useDataStore((s) => s.delayMs);
  const maxDelayMs = useDataStore((s) => s.maxDelayMs);
  const setDelayMs = useDataStore((s) => s.setDelayMs);

  return (
    <label className="grid w-full grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1 text-sm text-zinc-400 sm:flex sm:w-auto">
      <span>delay</span>
      <input
        type="range"
        min={0}
        max={maxDelayMs}
        step={500}
        value={delayMs}
        onChange={(e) => setDelayMs(Number(e.target.value))}
        className="order-last col-span-2 w-full min-w-0 accent-zinc-300 sm:order-none sm:col-span-1 sm:w-40"
      />
      <span className="w-12 justify-self-end text-right tabular-nums text-zinc-300">
        {(delayMs / 1000).toFixed(1)}s
      </span>
    </label>
  );
}
