"use client";

import { useMemo, useState } from "react";

import {
  arcPath,
  behindDeg,
  cumulativeGaps,
  pointFor,
  referenceLapMs,
  rejoinRange,
  type GapInfo,
} from "@/lib/circleOfDoom";
import { pitLossFor, type PitLoss } from "@/lib/pitLoss";
import { isVscOrSc, trackStatusStyle } from "@/lib/trackStatus";
import { orderedDrivers } from "@/lib/selectors";
import { useDataStore } from "@/stores/useDataStore";
import type { State } from "@/types";

const CX = 50;
const CY = 50;
const RING_R = 40;
const RING_W = 8;

type Marker = {
  racingNumber: string;
  tla: string;
  colour: string;
  position: number;
  gapMs: number;
  lapped: boolean;
  inPit: boolean;
  behind: number;
};

/**
 * The pit-wall "circle of doom": one reference lap mapped onto a ring, leader
 * at 12 o'clock, travel clockwise. Geometry and provenance:
 * docs/references/strategy-screens.md.
 */
export function CircleOfDoom({ fit = false }: { fit?: boolean }) {
  const state = useDataStore((s) => s.state);
  const [selected, setSelected] = useState<string | null>(null);

  const sessionType = state.SessionInfo?.Type;
  const circuit = state.SessionInfo?.Meeting?.Circuit?.ShortName;
  // Pit-loss times drive the projected rejoin windows; the circuit preset is
  // used as-is (the editable pit-loss control was removed as unclear).
  const loss = useMemo(() => pitLossFor(circuit), [circuit]);
  const vscActive = isVscOrSc(state.TrackStatus?.Status);

  const { markers, gaps, refLap } = useMemo(() => buildRing(state), [state]);
  const selectedMarker = markers.find((m) => m.racingNumber === selected) ?? null;

  if (sessionType && sessionType !== "Race") {
    return (
      <section className="rounded-lg border border-zinc-800 p-5 text-sm text-zinc-500">
        The strategy ring works on race gaps — it activates when a race session is live.
      </section>
    );
  }

  return (
    <section
      className={`flex flex-col items-center gap-3 rounded-lg border border-zinc-800 p-4 ${fit ? "xl:h-full xl:min-h-0" : ""}`}
    >
      {/* In fit mode the ring box stays square (height-bound) so the absolutely
          positioned CentrePanel — sized as a % of this box — stays concentric
          with the letterboxed ring. */}
      <div className={`relative w-full max-w-2xl ${fit ? "xl:aspect-square xl:min-h-0 xl:w-auto xl:flex-1" : ""}`}>
        <svg
          viewBox="0 0 100 100"
          className={`w-full ${fit ? "xl:h-full" : ""}`}
          role="img"
          aria-label="Circle of doom"
        >
          {/* The annulus. */}
          <circle cx={CX} cy={CY} r={RING_R} fill="none" stroke="#3f3f46" strokeWidth={RING_W} />
          <circle cx={CX} cy={CY} r={RING_R + RING_W / 2 + 0.4} fill="none" stroke="#27272a" strokeWidth={0.3} />
          <circle cx={CX} cy={CY} r={RING_R - RING_W / 2 - 0.4} fill="none" stroke="#27272a" strokeWidth={0.3} />

          {selectedMarker && (
            <PitWindows marker={selectedMarker} loss={loss} refLap={refLap} vscActive={vscActive} />
          )}

          {markers.map((marker) => (
            <MarkerTick
              key={marker.racingNumber}
              marker={marker}
              leader={marker.position === 1}
              selected={marker.racingNumber === selected}
              onSelect={() =>
                setSelected((current) =>
                  current === marker.racingNumber ? null : marker.racingNumber,
                )
              }
            />
          ))}
        </svg>

        <CentrePanel
          marker={selectedMarker}
          markers={markers}
          gaps={gaps}
          loss={loss}
          vscActive={vscActive}
        />
      </div>
    </section>
  );
}

function buildRing(state: State) {
  const rows = orderedDrivers(state).flatMap((row) =>
    row.timing && !row.timing.Retired && !row.timing.Stopped
      ? [{ ...row, timing: row.timing }]
      : [],
  );
  const refLap = referenceLapMs(state);
  const gaps = cumulativeGaps(rows.map((row) => row.timing));

  const markers: Marker[] = rows.map((row, index) => {
    const info = gaps.get(row.racingNumber) ?? { gapMs: 0, lapped: false };
    return {
      racingNumber: row.racingNumber,
      tla: row.driver?.Tla || row.racingNumber,
      colour: row.driver?.TeamColour ? `#${row.driver.TeamColour}` : "#71717a",
      position: index + 1,
      gapMs: info.gapMs,
      lapped: info.lapped,
      inPit: Boolean(row.timing?.InPit),
      behind: behindDeg(info.gapMs, refLap),
    };
  });

  return { markers, gaps, refLap };
}

function MarkerTick({
  marker,
  leader,
  selected,
  onSelect,
}: {
  marker: Marker;
  leader: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  // In-pit cars sit inside the ring (they are not on track).
  const [rIn, rOut, rLabel] = marker.inPit ? [25, 31, 20.5] : [35.5, 44.5, 48.2];
  const inner = pointFor(marker.behind, CX, CY, rIn);
  const outer = pointFor(marker.behind, CX, CY, rOut);
  const label = pointFor(marker.behind, CX, CY, rLabel);
  const hitIn = pointFor(marker.behind, CX, CY, rIn - 3);
  const hitOut = pointFor(marker.behind, CX, CY, rOut + 3);
  const opacity = marker.lapped ? 0.45 : 1;

  return (
    <g onClick={onSelect} className="cursor-pointer" opacity={opacity}>
      {selected && (
        <line
          x1={inner.x}
          y1={inner.y}
          x2={outer.x}
          y2={outer.y}
          stroke="#e879f9"
          strokeWidth={3.2}
          strokeLinecap="round"
          opacity={0.55}
        />
      )}
      <line
        x1={inner.x}
        y1={inner.y}
        x2={outer.x}
        y2={outer.y}
        stroke={marker.colour}
        strokeWidth={leader ? 2.2 : 1.3}
        strokeLinecap="round"
      />
      <text
        x={label.x}
        y={label.y}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={3.1}
        fontFamily="var(--font-mono, ui-monospace, monospace)"
        fill={selected ? "#e879f9" : "#d4d4d8"}
        fontWeight={leader || selected ? 700 : 400}
      >
        {marker.tla}
      </text>
      {/* Generous transparent hit area — the ticks are thin. */}
      <line x1={hitIn.x} y1={hitIn.y} x2={hitOut.x} y2={hitOut.y} stroke="transparent" strokeWidth={6}>
        <title>{`${marker.tla} — P${marker.position}, ${marker.inPit ? "in pit" : `+${(marker.gapMs / 1000).toFixed(1)}s`}`}</title>
      </line>
    </g>
  );
}

function CentrePanel({
  marker,
  markers,
  gaps,
  loss,
  vscActive,
}: {
  marker: Marker | null;
  markers: Marker[];
  gaps: Map<string, GapInfo>;
  loss: PitLoss;
  vscActive: boolean;
}) {
  const state = useDataStore((s) => s.state);
  const lap = state.LapCount;
  const status = trackStatusStyle(state.TrackStatus?.Status);

  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 flex h-[44%] w-[44%] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-full text-center">
      {marker ? (
        <SelectedInfo marker={marker} markers={markers} gaps={gaps} loss={loss} vscActive={vscActive} />
      ) : (
        <>
          <span className="text-xs uppercase tracking-wide text-zinc-600">Lap</span>
          <span className="font-mono text-2xl font-semibold tabular-nums text-zinc-100">
            {lap && lap.TotalLaps > 0 ? `${lap.CurrentLap}/${lap.TotalLaps}` : "--/--"}
          </span>
          {status && (
            <span className="flex items-center gap-1.5 text-xs text-zinc-400">
              <span className={`h-2 w-2 rounded-full ${status.bg}`} aria-hidden />
              {status.label}
            </span>
          )}
          <span className="mt-1 max-w-[12rem] text-[11px] leading-tight text-zinc-600">
            Select a car to project its pit stop
          </span>
        </>
      )}
    </div>
  );
}

function SelectedInfo({
  marker,
  markers,
  gaps,
  loss,
  vscActive,
}: {
  marker: Marker;
  markers: Marker[];
  gaps: Map<string, GapInfo>;
  loss: PitLoss;
  vscActive: boolean;
}) {
  const green = rejoinRange(gaps, marker.racingNumber, loss.green * 1000);
  const vsc = rejoinRange(gaps, marker.racingNumber, loss.vsc * 1000);
  const ahead = markers.find((m) => m.position === marker.position - 1);
  const behind = markers.find((m) => m.position === marker.position + 1);

  return (
    <>
      <span className="font-mono text-xl font-bold" style={{ color: marker.colour }}>
        {marker.tla}
        <span className="ml-2 text-sm font-semibold text-zinc-400">P{marker.position}</span>
      </span>
      {ahead && (
        <span className="text-[11px] tabular-nums text-zinc-500">
          ahead: {ahead.tla} −{((marker.gapMs - ahead.gapMs) / 1000).toFixed(1)}s
        </span>
      )}
      {behind && (
        <span className="text-[11px] tabular-nums text-zinc-500">
          behind: {behind.tla} +{((behind.gapMs - marker.gapMs) / 1000).toFixed(1)}s
        </span>
      )}
      <div className="mt-1 flex flex-col gap-0.5 text-xs tabular-nums">
        <span className={vscActive ? "text-zinc-500" : "font-semibold text-emerald-400"}>
          Pit now → {rangeLabel(green)} <span className="text-[10px]">(green)</span>
        </span>
        <span className={vscActive ? "font-semibold text-amber-300" : "text-zinc-500"}>
          Pit now → {rangeLabel(vsc)} <span className="text-[10px]">(VSC)</span>
        </span>
      </div>
    </>
  );
}

function rangeLabel(range: { best: number; worst: number } | null): string {
  if (!range) return "—";
  return range.best === range.worst ? `P${range.best}` : `P${range.best}–P${range.worst}`;
}

function PitWindows({
  marker,
  loss,
  refLap,
  vscActive,
}: {
  marker: Marker;
  loss: PitLoss;
  refLap: number;
  vscActive: boolean;
}) {
  const windows = [
    { key: "green", seconds: loss.green, colour: "#10b981", active: !vscActive },
    { key: "vsc", seconds: loss.vsc, colour: "#fbbf24", active: vscActive },
  ];

  return (
    <g>
      {windows.map(({ key, seconds, colour, active }) => {
        const far = behindDeg(marker.gapMs + (seconds + 2) * 1000, refLap);
        const near = behindDeg(marker.gapMs + (seconds - 1) * 1000, refLap);
        const ghost = pointFor(behindDeg(marker.gapMs + seconds * 1000, refLap), CX, CY, RING_R);
        return (
          <g key={key} opacity={active ? 1 : 0.4}>
            <path
              d={arcPath(far, near, CX, CY, RING_R)}
              fill="none"
              stroke={colour}
              strokeWidth={RING_W}
              strokeOpacity={0.35}
            />
            {/* The cyan pit-exit ghost of the original pit-wall tool. */}
            <circle
              cx={ghost.x}
              cy={ghost.y}
              r={1.7}
              fill={active ? "#22d3ee" : "none"}
              stroke="#22d3ee"
              strokeWidth={0.5}
            />
          </g>
        );
      })}
    </g>
  );
}
