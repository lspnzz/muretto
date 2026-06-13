"use client";

import { displayName, type DriverRow } from "@/lib/selectors";

/** Position-ordered chip strip; exactly one driver selected at a time. */
export function DriverSelector({
  rows,
  selected,
  onSelect,
}: {
  rows: DriverRow[];
  selected: string;
  onSelect: (racingNumber: string) => void;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Select driver">
      {rows.map((row) => {
        const active = row.racingNumber === selected;
        const colour = row.driver?.TeamColour ? `#${row.driver.TeamColour}` : "#a1a1aa";
        return (
          <button
            key={row.racingNumber}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(row.racingNumber)}
            className={[
              "flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-sm transition-colors",
              active
                ? "border-zinc-200 bg-zinc-900"
                : "border-zinc-800 hover:bg-zinc-900",
            ].join(" ")}
          >
            <span className="text-xs tabular-nums text-zinc-500">
              {row.position < 999 ? row.position : "—"}
            </span>
            <span className="font-bold uppercase tracking-wide" style={{ color: colour }}>
              {row.driver?.Tla || displayName(row.driver, row.racingNumber)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
