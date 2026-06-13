"use client";

import { orderedDrivers } from "@/lib/selectors";
import { tyreHex } from "@/lib/tyre";
import { useDataStore } from "@/stores/useDataStore";
import type { Stint } from "@/types";

/** Per-driver stint history — compound bars sized by laps run. */
export function TyreStints() {
  const state = useDataStore((s) => s.state);
  const rows = orderedDrivers(state);
  const lines = state.TimingAppData?.Lines;

  if (!lines) {
    return (
      <section className="rounded-lg border border-zinc-800 p-4 text-sm text-zinc-600">
        No stint data yet.
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-zinc-800 p-4">
      <h2 className="mb-3 text-xs uppercase tracking-wide text-zinc-500">Tyre stints</h2>
      <ul className="flex flex-col gap-1.5">
        {rows.map((row, index) => {
          const stints = orderedStints(lines[row.racingNumber]?.Stints);
          if (stints.length === 0) return null;
          const totalLaps = stints.reduce((sum, s) => sum + (s.TotalLaps ?? 0), 0);
          return (
            <li key={row.racingNumber} className="flex items-center gap-2">
              <span className="w-5 text-right text-xs tabular-nums text-zinc-500">
                {index + 1}
              </span>
              <span className="w-10 font-mono text-xs font-semibold">
                {row.driver?.Tla || row.racingNumber}
              </span>
              <div className="flex h-5 flex-1 gap-px overflow-hidden rounded-sm">
                {stints.map((stint, i) => {
                  const laps = stint.TotalLaps ?? 0;
                  const compound = stint.Compound?.toUpperCase() ?? "";
                  const width = totalLaps > 0 ? Math.max((laps / totalLaps) * 100, 9) : 100;
                  return (
                    <div
                      key={i}
                      className="flex min-w-0 items-center justify-center"
                      style={{ width: `${width}%`, backgroundColor: tyreHex(compound) }}
                      title={`${compound || "?"} — ${laps} laps${stint.New === "FALSE" ? " (used set)" : ""}`}
                    >
                      <span className={`truncate px-1 text-[10px] font-semibold ${textOn(compound)}`}>
                        {compound ? compound[0] : "?"} {laps}
                      </span>
                    </div>
                  );
                })}
              </div>
              <span className="w-12 text-right text-xs tabular-nums text-zinc-600">
                {Math.max(0, stints.length - 1)} stop{stints.length === 2 ? "" : "s"}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function orderedStints(stints: { [key: string]: Stint | undefined } | undefined): Stint[] {
  if (!stints) return [];
  return Object.keys(stints)
    .sort((a, b) => Number(a) - Number(b))
    .flatMap((key) => (stints[key] ? [stints[key]] : []));
}

function textOn(compound: string): string {
  return compound === "INTERMEDIATE" || compound === "WET" || compound === ""
    ? "text-zinc-100"
    : "text-zinc-950";
}
