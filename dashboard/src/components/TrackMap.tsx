"use client";

import { useEffect, useMemo, useState } from "react";

import { useUpcomingRace } from "@/hooks/useUpcomingRace";
import { orderedDrivers } from "@/lib/selectors";
import { useDataStore } from "@/stores/useDataStore";
import type { PositionCar, State } from "@/types";
import type { UpcomingRace } from "@/types/UpcomingRace";

type CircuitGeometry = {
  circuitName?: string;
  rotation?: number;
  x?: number[];
  y?: number[];
  corners?: Array<{
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

// Wide broadcast-strip canvas: the panel spans the container above the
// timing tower, and the projection letterboxes the circuit inside it.
const WIDTH = 200;
const HEIGHT = 80;
const PAD = 6;

export function TrackMap() {
  const state = useDataStore((s) => s.state);
  const { race } = useUpcomingRace();
  const latest = state.Position?.Position.at(-1);
  const { circuitKey, year } = useMemo(() => circuitRef(state, race), [state, race]);
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
  const rowByNumber = new Map(rows.map((row) => [row.racingNumber, row]));
  const cars: TrackPoint[] = Object.entries(latest?.Entries ?? {})
    .flatMap(([racingNumber, car]) => carPoint(racingNumber, car, rowByNumber))
    .sort((a, b) => {
      const left = rowByNumber.get(a.racingNumber)?.position ?? 999;
      const right = rowByNumber.get(b.racingNumber)?.position ?? 999;
      return left - right;
    });

  const drawing = useMemo(() => buildDrawing(geometry, cars), [geometry, cars]);

  return (
    <section className="rounded-lg border border-zinc-800 p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xs uppercase tracking-wide text-zinc-500">Track map</h2>
        <span className="font-mono text-xs text-zinc-600">
          {latest?.Timestamp
            ? latest.Timestamp.slice(11, 19)
            : geometry?.circuitName || race?.circuitName || ""}
        </span>
      </div>

      {drawing ? (
        <svg
          className="mx-auto block h-auto max-h-96 w-full"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label="Circuit map with current car positions"
        >
          <path
            d={drawing.trackPath}
            className="fill-none stroke-zinc-700"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />

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

          {drawing.cars.map((point) => (
            <g key={point.racingNumber} transform={`translate(${point.x} ${point.y})`}>
              <circle r="2.4" fill={point.color} className="stroke-black" strokeWidth="0.8" />
              <text
                x="3.6"
                y={point.labelDy}
                className="fill-zinc-100 font-mono text-[4px] font-semibold"
              >
                {point.label}
              </text>
            </g>
          ))}
        </svg>
      ) : (
        <div className="text-sm text-zinc-600">
          {loading ? "Loading circuit map." : "No circuit map."}
        </div>
      )}
    </section>
  );
}

function circuitRef(state: State, race: UpcomingRace | undefined) {
  const session = state.SessionInfo;
  const circuitKey = session?.Meeting?.Circuit?.Key || 0;
  const year = parseYear(session?.StartDate);
  if (circuitKey && year) return { circuitKey, year };

  const raceCircuitKey = race?.circuitKey ?? 0;
  const raceYear = parseYear(race?.season) || parseYear(race?.raceIso);
  return { circuitKey: raceCircuitKey, year: raceYear };
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

function buildDrawing(geometry: CircuitGeometry | null, cars: TrackPoint[]) {
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

  return {
    trackPath: pathFor(rotatedOutline.map((point) => project(point, bounds))),
    cars: staggerLabels(rotatedCars.map((point) => ({ ...point, ...project(point, bounds) }))),
    corners: rotatedCorners.map((corner) => ({ ...corner, ...project(corner, bounds) })),
  };
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

function pathFor(points: RawPoint[]) {
  return points
    .map((point, i) => `${i === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
}
