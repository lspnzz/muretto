"use client";

import { useEffect, useMemo, useState } from "react";

import { useUpcomingRace } from "@/hooks/useUpcomingRace";
import { marshalSegments, sliceSegment, trackMapFlags } from "@/lib/flags";
import type { TrackMapFlags } from "@/lib/flags";
import { fastestSectorLeaders, orderedDrivers } from "@/lib/selectors";
import type { FastestSectorLeader } from "@/lib/selectors";
import { useDataStore } from "@/stores/useDataStore";
import type { PositionCar, State } from "@/types";

type CircuitGeometry = {
  circuitName?: string;
  rotation?: number;
  x?: number[];
  y?: number[];
  corners?: Array<{
    number: number;
    trackPosition: { x: number; y: number };
  }>;
  marshalSectors?: Array<{
    number: number;
    trackPosition: { x: number; y: number };
  }>;
};

type CircuitGeometryWithOutline = CircuitGeometry & {
  x: number[];
  y: number[];
};

type RawPoint = {
  x: number;
  y: number;
};

type TrackPoint = RawPoint & {
  racingNumber: string;
  label: string;
  color: string;
};

type TrackMapProps = {
  highlight?: string;
  showFastestSectors?: boolean;
  // Fit-to-viewport mode (pit wall): on wide screens the panel fills its cell
  // and the circuit letterboxes into the available height instead of capping.
  fit?: boolean;
};

// Wide broadcast-strip canvas: the panel spans the container above the
// timing tower, and the projection letterboxes the circuit inside it.
const WIDTH = 200;
const HEIGHT = 80;
const PAD = 6;
const TIMING_SECTOR_COUNT = 3;
// Half-length of the perpendicular sector-boundary ticks, in viewBox units.
const SECTOR_TICK_HALF = 3.4;
const SECTOR_TICK = "#e4e4e7";

// Hexes match TRACK_STATUS in lib/trackStatus.ts (amber-400 / red-500).
const TRACK_DEFAULT = "#3f3f46";
const TRACK_CAUTION = "#fbbf24";
const TRACK_RED = "#ef4444";

const FLAG_LABEL: Partial<Record<TrackMapFlags["kind"], { label: string; className: string }>> = {
  yellow: { label: "Yellow flag", className: "text-amber-400" },
  sc: { label: "Safety car", className: "text-amber-400" },
  vsc: { label: "VSC deployed", className: "text-amber-400" },
  "vsc-ending": { label: "VSC ending", className: "text-amber-400" },
  red: { label: "Red flag", className: "text-red-500" },
};

/** The whole outline takes the flag colour once the caution covers the track. */
function trackColorFor(flags: TrackMapFlags): string {
  switch (flags.kind) {
    case "red":
      return TRACK_RED;
    case "sc":
    case "vsc":
    case "vsc-ending":
      return TRACK_CAUTION;
    case "yellow":
      return flags.trackWide ? TRACK_CAUTION : TRACK_DEFAULT;
    default:
      return TRACK_DEFAULT;
  }
}

/**
 * Circuit outline with live car dots. With `highlight` set (the driver tab),
 * the named car keeps its label and pops; the rest dim and go label-less.
 */
export function TrackMap({ highlight, showFastestSectors = false, fit = false }: TrackMapProps) {
  const state = useDataStore((s) => s.state);
  const { race } = useUpcomingRace();
  const nativeLatest = state.Position?.Position.at(-1) ?? null;
  const { circuitKey, year } = useMemo(() => circuitRef(state), [state]);
  const [geometry, setGeometry] = useState<CircuitGeometry | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!circuitKey || !year) {
      setGeometry(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    fetch(`/api/circuits/${circuitKey}/${year}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: CircuitGeometry | null) => setGeometry(hasOutline(data) ? data : null))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setGeometry(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [circuitKey, year]);

  const rows = orderedDrivers(state);
  const latest = nativeLatest;
  const rowByNumber = new Map(rows.map((row) => [row.racingNumber, row]));
  const latestEntries: Record<string, PositionCar | undefined> = latest?.Entries ?? {};
  const cars: TrackPoint[] = Object.entries(latestEntries)
    .flatMap(([racingNumber, car]) => carPoint(racingNumber, car, rowByNumber))
    .sort((a, b) => {
      // Leaderboard order; the highlighted car draws last so it sits on top.
      if (highlight && (a.racingNumber === highlight) !== (b.racingNumber === highlight)) {
        return a.racingNumber === highlight ? 1 : -1;
      }
      const left = rowByNumber.get(a.racingNumber)?.position ?? 999;
      const right = rowByNumber.get(b.racingNumber)?.position ?? 999;
      return left - right;
    });

  const flags = useMemo(
    () => trackMapFlags(state.TrackStatus?.Status, state.RaceControlMessages),
    [state.TrackStatus, state.RaceControlMessages],
  );
  const sectorLeaders = useMemo(
    () => (showFastestSectors ? fastestSectorLeaders(state) : []),
    [showFastestSectors, state],
  );
  const drawing = useMemo(
    () => buildDrawing(geometry, cars, flags, sectorLeaders),
    [geometry, cars, flags, sectorLeaders],
  );
  const statusLabel = FLAG_LABEL[flags.kind];

  return (
    <section
      className={`rounded-lg border border-zinc-800 p-4 ${fit ? "xl:flex xl:h-full xl:min-h-0 xl:flex-col" : ""}`}
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h2
          className={`text-xs uppercase tracking-wide ${statusLabel?.className ?? "text-zinc-500"}`}
        >
          {statusLabel?.label ?? "Track map"}
        </h2>
        <span className="font-mono text-xs text-zinc-600">
          {latest?.Timestamp
            ? latest.Timestamp.slice(11, 19)
            : geometry?.circuitName || race?.circuitName || ""}
        </span>
      </div>

      {drawing ? (
        <svg
          className={`mx-auto block h-auto max-h-96 w-full ${fit ? "xl:max-h-none xl:min-h-0 xl:flex-1" : ""}`}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label="Circuit map with current car positions"
        >
          <path
            d={drawing.trackPath}
            fill="none"
            stroke={trackColorFor(flags)}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />

          {drawing.sectorTicks.map((tick) => (
            <line
              key={`sector-${tick.sector}`}
              x1={tick.x1}
              y1={tick.y1}
              x2={tick.x2}
              y2={tick.y2}
              stroke={SECTOR_TICK}
              strokeWidth="2"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            >
              <title>{`Sector ${tick.sector} / ${tick.sector + 1} boundary`}</title>
            </line>
          ))}

          {drawing.fastestSectors.map((segment) => (
            <path
              key={segment.sector}
              d={segment.path}
              fill="none"
              stroke={segment.color}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.6"
              vectorEffect="non-scaling-stroke"
              opacity="0.9"
            >
              <title>
                {`Sector ${segment.sector + 1}: ${segment.label}${segment.value ? ` ${segment.value}` : ""}`}
              </title>
            </path>
          ))}

          {drawing.yellowSegments.map((segment) => (
            <path
              key={segment.number}
              d={segment.path}
              fill="none"
              stroke={TRACK_CAUTION}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
              vectorEffect="non-scaling-stroke"
              className={segment.flag === "double-yellow" ? "animate-pulse" : undefined}
            >
              <title>{`${segment.flag === "double-yellow" ? "Double yellow" : "Yellow"} in track sector ${segment.number}`}</title>
            </path>
          ))}

          {drawing.corners.map((corner) => (
            <text
              key={corner.number}
              x={corner.x}
              y={corner.y}
              className="fill-zinc-500 font-mono text-[3px]"
              textAnchor="middle"
              dominantBaseline="central"
            >
              {corner.number}
            </text>
          ))}

          {drawing.cars.map((point) => {
            const dimmed = Boolean(highlight) && point.racingNumber !== highlight;
            const focused = highlight === point.racingNumber;
            return (
              <g
                key={point.racingNumber}
                transform={`translate(${point.x} ${point.y})`}
                className={dimmed ? "opacity-40" : undefined}
              >
                <circle
                  r={focused ? 3 : dimmed ? 1.9 : 2.4}
                  fill={point.color}
                  className={focused ? "stroke-zinc-100" : "stroke-black"}
                  strokeWidth="0.8"
                />
                {!dimmed && (
                  <text
                    x={focused ? 4.2 : 3.6}
                    y={point.labelDy}
                    className="fill-zinc-100 font-mono text-[4px] font-semibold"
                  >
                    {point.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      ) : (
        <div className="text-sm text-zinc-600">
          {loading ? "Loading circuit map." : "No circuit map."}
        </div>
      )}
    </section>
  );
}

function circuitRef(state: State) {
  const session = state.SessionInfo;
  const circuitKey = session?.Meeting?.Circuit?.Key || 0;
  const year = parseYear(session?.StartDate);
  return { circuitKey, year };
}

function parseYear(value: string | undefined) {
  const match = value?.match(/^(\d{4})/);
  return match ? Number(match[1]) : 0;
}

function carPoint(
  racingNumber: string,
  car: PositionCar | undefined,
  rowByNumber: Map<string, ReturnType<typeof orderedDrivers>[number]>,
) {
  if (!car || !Number.isFinite(car.X) || !Number.isFinite(car.Y)) return [];
  const driver = rowByNumber.get(racingNumber)?.driver;
  return [
    {
      racingNumber,
      label: driver?.Tla || racingNumber,
      color: driver?.TeamColour ? `#${driver.TeamColour}` : "#a1a1aa",
      x: car.X,
      y: car.Y,
    },
  ];
}

function hasOutline(value: CircuitGeometry | null): value is CircuitGeometryWithOutline {
  return Boolean(value?.x?.length && value.y?.length && value.x.length === value.y.length);
}

function buildDrawing(
  geometry: CircuitGeometry | null,
  cars: TrackPoint[],
  flags: TrackMapFlags,
  sectorLeaders: FastestSectorLeader[],
) {
  if (!hasOutline(geometry)) return null;

  const outline = geometry.x.map((x, i) => ({ x, y: geometry.y[i] }));
  const rotation = geometry.rotation ?? 0;
  const rotatedOutline = rotateAll(outline, outline, rotation);
  const rotatedCars = rotateAll(cars, outline, rotation);
  const rotatedCorners = rotateAll(
    (geometry.corners ?? []).map((corner) => ({
      number: corner.number,
      x: corner.trackPosition.x,
      y: corner.trackPosition.y,
    })),
    outline,
    rotation,
  );
  const bounds = boundsFor(rotatedOutline);
  const projected = rotatedOutline.map((point) => project(point, bounds));
  const sectors = splitPathEvenly(projected, TIMING_SECTOR_COUNT);

  return {
    trackPath: pathFor(projected),
    sectorTicks: sectorBoundaryTicks(sectors),
    fastestSectors: fastestSectorPaths(sectors, flags, sectorLeaders),
    yellowSegments: yellowSegmentPaths(outline, projected, geometry, flags),
    cars: staggerLabels(rotatedCars.map((point) => ({ ...point, ...project(point, bounds) }))),
    corners: rotatedCorners.map((corner) => ({ ...corner, ...project(corner, bounds) })),
  };
}

function fastestSectorPaths(
  sectors: RawPoint[][],
  flags: TrackMapFlags,
  sectorLeaders: FastestSectorLeader[],
) {
  if (
    sectorLeaders.length === 0 ||
    flags.kind === "red" ||
    flags.kind === "sc" ||
    flags.kind === "vsc" ||
    flags.kind === "vsc-ending"
  ) {
    return [];
  }

  return sectorLeaders.flatMap((leader) => {
    const points = sectors[leader.sector];
    if (!points || points.length < 2) return [];
    return [{ ...leader, path: pathFor(points) }];
  });
}

/**
 * Short perpendicular ticks where the timing sectors meet. Anchored on the same
 * even 3-split the fastest-sector overlay uses, so the ticks mark exactly where
 * the coloured sector segments begin and end.
 */
function sectorBoundaryTicks(sectors: RawPoint[][]) {
  return sectors.slice(1).flatMap((segment, index) => {
    const point = segment[0];
    const prev = sectors[index];
    const after = segment[1] ?? point;
    const before = prev[prev.length - 2] ?? point;
    const tx = after.x - before.x;
    const ty = after.y - before.y;
    const len = Math.hypot(tx, ty) || 1;
    const nx = -ty / len;
    const ny = tx / len;
    return [
      {
        sector: index + 1,
        x1: point.x - nx * SECTOR_TICK_HALF,
        y1: point.y - ny * SECTOR_TICK_HALF,
        x2: point.x + nx * SECTOR_TICK_HALF,
        y2: point.y + ny * SECTOR_TICK_HALF,
      },
    ];
  });
}

/**
 * Paths for the marshal sectors currently under yellow. Sector boundaries are
 * matched against the *raw* outline (marshal posts share its coordinate
 * space), then the index ranges slice the projected points — indices survive
 * rotation and projection, so both stay in lockstep.
 */
function yellowSegmentPaths(
  outline: RawPoint[],
  projected: RawPoint[],
  geometry: CircuitGeometry,
  flags: TrackMapFlags,
) {
  if (flags.kind !== "yellow" || flags.sectors.size === 0) return [];

  return marshalSegments(outline, geometry.marshalSectors).flatMap((segment) => {
    const flag = flags.sectors.get(segment.number);
    if (!flag) return [];
    return [{ number: segment.number, flag, path: pathFor(sliceSegment(projected, segment)) }];
  });
}

// Approximate label footprint in viewBox units, for collision checks.
const LABEL_W = 11;
const LABEL_H = 4.5;

/**
 * Nose-to-tail cars get stacked labels instead of overprinted ones. Cars
 * arrive in leaderboard order, so the car ahead keeps the prime spot and
 * followers shift down a line at a time.
 */
function staggerLabels<T extends RawPoint>(cars: T[]): Array<T & { labelDy: number }> {
  const placed: RawPoint[] = [];
  return cars.map((car) => {
    let labelDy = -3;
    const collides = () =>
      placed.some(
        (p) => Math.abs(p.x - car.x) < LABEL_W && Math.abs(p.y - (car.y + labelDy)) < LABEL_H,
      );
    while (collides()) labelDy += LABEL_H;
    placed.push({ x: car.x, y: car.y + labelDy });
    return { ...car, labelDy };
  });
}

function rotateAll<T extends RawPoint>(points: T[], reference: RawPoint[], degrees: number): T[] {
  if (degrees === 0 || points.length === 0) return points;

  const bounds = boundsFor(reference);
  const center = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return points.map((point) => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return {
      ...point,
      x: center.x + dx * cos - dy * sin,
      y: center.y + dx * sin + dy * cos,
    };
  });
}

function boundsFor(points: RawPoint[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

/**
 * Fit the circuit into the canvas without distorting it: one uniform scale
 * (the tighter axis wins), centered on both axes. Y flips — feed north is up,
 * SVG y grows down.
 */
function project(point: RawPoint, bounds: ReturnType<typeof boundsFor>) {
  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;
  const scale = Math.min((WIDTH - PAD * 2) / spanX, (HEIGHT - PAD * 2) / spanY);
  if (!Number.isFinite(scale)) return { x: WIDTH / 2, y: HEIGHT / 2 };
  return {
    x: (WIDTH - spanX * scale) / 2 + (point.x - bounds.minX) * scale,
    y: HEIGHT - (HEIGHT - spanY * scale) / 2 - (point.y - bounds.minY) * scale,
  };
}

function splitPathEvenly(points: RawPoint[], count: number): RawPoint[][] {
  if (points.length < 2 || count < 1) return [];

  const total = totalDistance(points);
  if (!Number.isFinite(total) || total <= 0) return [];

  const sectors: RawPoint[][] = [];
  let current: RawPoint[] = [points[0]];
  let travelled = 0;
  let nextCut = total / count;
  let cutIndex = 1;

  for (let i = 1; i < points.length; i += 1) {
    const start = points[i - 1];
    const end = points[i];
    const length = distance(start, end);

    while (cutIndex < count && travelled + length >= nextCut) {
      const ratio = length === 0 ? 0 : (nextCut - travelled) / length;
      const cut = {
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
      };
      current.push(cut);
      sectors.push(current);
      current = [cut];
      cutIndex += 1;
      nextCut = (total * cutIndex) / count;
    }

    current.push(end);
    travelled += length;
  }

  sectors.push(current);
  return sectors.slice(0, count);
}

function totalDistance(points: RawPoint[]): number {
  return points.reduce((sum, point, i) => {
    if (i === 0) return 0;
    return sum + distance(points[i - 1], point);
  }, 0);
}

function distance(a: RawPoint, b: RawPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function pathFor(points: RawPoint[]) {
  return points
    .map((point, i) => `${i === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
}
