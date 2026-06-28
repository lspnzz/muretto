"use client";

import { useEffect, useRef, useState } from "react";

import { personalBestLapNumber } from "@/lib/ragged";
import { type DriverLap, displayName, driverLaps, shortDriverName, stintsForDriver } from "@/lib/selectors";
import { type LapRange, stintIndexForLap, stintLapRanges } from "@/lib/stints";
import { tyreHex } from "@/lib/tyre";
import { useDataStore } from "@/stores/useDataStore";
import type { Stint } from "@/types";
import { DriverTag } from "./DriverTag";
import { TyreRing } from "./cells";

/**
 * Per-driver lap detail, opened by clicking a timing row. An "All laps" tab
 * lists every recorded lap (coloured by the tyre it ran on); one tab per stint
 * then shows that stint's tyre and its lap-by-lap times. Lap times come from
 * `State.LapHistory`, which ingest accumulates from the live stream — the feed
 * itself only ever carries the latest lap.
 */
export function DriverStintModal({
  racingNumber,
  onClose,
}: {
  racingNumber: string;
  onClose: () => void;
}) {
  const state = useDataStore((s) => s.state);
  const driver = state.DriverList?.[racingNumber];
  const timing = state.TimingData?.Lines?.[racingNumber];
  const stints = stintsForDriver(state, racingNumber);
  const ranges = stintLapRanges(stints);
  const laps = driverLaps(state, racingNumber);
  const bestLap = personalBestLapNumber(state.TimingStats, racingNumber);

  // Tabs: 0 = All laps, then one per stint. Default to the current (last) stint.
  const [active, setActive] = useState(() => stints.length);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Pull focus into the dialog on open, keep Tab inside it, and hand focus back
  // to the row that opened it on close — the contract role="dialog"+aria-modal
  // makes to assistive tech. Escape closes.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "Tab") trapTab(dialogRef.current, event);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [onClose]);

  // The live snapshot can shrink the stint list (scrubbing the delay slider to
  // an older frame, a session reset); clamp the one-time selection.
  const name = displayName(driver, racingNumber);
  const activeIndex = Math.min(active, stints.length);
  const stintIndex = activeIndex - 1;
  const compoundForLap = (lap: number): string => {
    const index = stintIndexForLap(ranges, lap);
    return index == null ? "" : (stints[index]?.Compound?.toUpperCase() ?? "");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-lg border border-zinc-800 bg-zinc-950 shadow-xl shadow-black/40 outline-none"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${name} laps`}
      >
        {/* Header: driver identity. */}
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-4 py-3">
          <div>
            <DriverTag
              position={timing?.Position || String(timing?.Line ?? "")}
              name={shortDriverName(name)}
              teamColour={driver?.TeamColour}
            />
            <p className="mt-1.5 text-xs text-zinc-500">
              {driver?.FullName || name} · #{racingNumber}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Tabs — All laps, then one per stint with a compound dot. */}
        <div className="flex flex-wrap gap-1.5 border-b border-zinc-800 px-3 py-2">
          <TabButton label="All laps" selected={activeIndex === 0} onClick={() => setActive(0)} />
          {stints.map((s, i) => (
            <TabButton
              key={i}
              label={`Stint ${i + 1}`}
              compound={s.Compound?.toUpperCase() ?? ""}
              selected={activeIndex === i + 1}
              onClick={() => setActive(i + 1)}
            />
          ))}
        </div>

        {activeIndex === 0 ? (
          <div className="min-h-0 overflow-y-auto px-4 py-4">
            <LapList laps={laps} bestLap={bestLap} compoundForLap={compoundForLap} />
          </div>
        ) : (
          stints[stintIndex] && (
            <StintPanel
              stint={stints[stintIndex]}
              range={ranges[stintIndex]}
              stopNumber={stintIndex}
              laps={lapsInRange(laps, ranges[stintIndex])}
              bestLap={bestLap}
            />
          )
        )}
      </div>
    </div>
  );
}

function TabButton({
  label,
  compound,
  selected,
  onClick,
}: {
  label: string;
  compound?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium",
        selected ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300",
      ].join(" ")}
    >
      {compound !== undefined && (
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: tyreHex(compound) }}
          aria-hidden
        />
      )}
      {label}
    </button>
  );
}

function StintPanel({
  stint,
  range,
  stopNumber,
  laps,
  bestLap,
}: {
  stint: Stint;
  range: LapRange | undefined;
  stopNumber: number;
  laps: DriverLap[];
  bestLap: number | null;
}) {
  const compound = stint.Compound?.toUpperCase() ?? "";
  const colour = tyreHex(compound);
  const age = stint.TotalLaps ?? 0;
  const carried = stint.StartLaps ?? 0;
  const fresh = stint.New !== "FALSE";
  const driven = range?.driven ?? 0;

  return (
    <div className="flex min-h-0 flex-col">
      {/* Tyre: icon + compound + age together, then provenance. */}
      <div className="flex items-center gap-3 px-4 pt-4">
        <TyreRing compound={compound} label={compound ? compound[0] : "?"} className="h-12 w-12 shrink-0" />
        <div>
          <p className="text-base font-semibold" style={{ color: colour }}>
            {compound || "Unknown"}
            <span className="ml-1.5 font-normal text-zinc-400">
              · {age} lap{age === 1 ? "" : "s"} old
            </span>
          </p>
          <p className="text-xs text-zinc-500">
            {fresh ? "Fresh set" : `Used set · ${carried} lap${carried === 1 ? "" : "s"} carried over`}
            {" · "}
            {stopNumber === 0 ? "from lights out" : `after stop #${stopNumber}`}
          </p>
        </div>
      </div>

      <p className="mt-4 px-4 text-[11px] uppercase tracking-wide text-zinc-500">
        Lap times · {driven} lap{driven === 1 ? "" : "s"} run
      </p>
      <div className="min-h-0 overflow-y-auto px-4 pt-1.5 pb-4">
        <LapList laps={laps} bestLap={bestLap} />
      </div>
    </div>
  );
}

/** Lap-time rows, fastest in violet; the compound dot only when laps span sets. */
function LapList({
  laps,
  bestLap,
  compoundForLap,
}: {
  laps: DriverLap[];
  bestLap: number | null;
  compoundForLap?: (lap: number) => string;
}) {
  if (laps.length === 0) {
    return <p className="text-sm text-zinc-500">No lap times yet.</p>;
  }

  return (
    <ol className="flex flex-col">
      {laps.map(({ lap, val }) => {
        const fastest = bestLap === lap;
        return (
          <li
            key={lap}
            className="flex items-center justify-between border-b border-zinc-900 py-1.5 last:border-0"
          >
            <span className="flex items-center gap-2 text-xs text-zinc-500">
              {compoundForLap && (
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: tyreHex(compoundForLap(lap)) }}
                  aria-hidden
                />
              )}
              <span className="tabular-nums">Lap {lap}</span>
            </span>
            <span
              className={`font-mono text-base tabular-nums ${fastest ? "text-violet-400" : "text-zinc-200"}`}
            >
              {fastest && <span className="mr-2 text-[10px] uppercase text-violet-400/80">fastest</span>}
              {val.Value || "--:--.---"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

type LapsInRange = (laps: DriverLap[], range: LapRange | undefined) => DriverLap[];

/** The recorded laps that fall within a stint's race-lap span. */
const lapsInRange: LapsInRange = (laps, range) => {
  if (!range) return [];
  return laps.filter((l) => l.lap >= range.start && l.lap <= range.end);
};

/** Keep Tab focus cycling within the dialog rather than escaping to the page. */
function trapTab(container: HTMLElement | null, event: KeyboardEvent): void {
  if (!container) return;
  const focusable = [
    ...container.querySelectorAll<HTMLElement>("button, [href], [tabindex]:not([tabindex='-1'])"),
  ].filter((el) => !el.hasAttribute("disabled"));
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const current = document.activeElement;

  if (event.shiftKey && (current === first || current === container)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && current === last) {
    event.preventDefault();
    first.focus();
  }
}
