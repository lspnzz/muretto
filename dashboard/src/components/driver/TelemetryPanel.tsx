"use client";

import { useEffect, useState } from "react";

import { overtakeMode, straightMode } from "@/lib/raceControl";
import { appendTrace, latestSample, type TelemetrySample } from "@/lib/telemetry";
import { useDataStore } from "@/stores/useDataStore";

// Fixed speed ceiling for the gauge scale, just above realistic top speed.
const SPEED_MAX = 360;
// Short sample buffer: the gauge shows its tail, so a batch that skips this
// driver holds the last reading instead of blanking.
const TRACE_CAP = 120;

/**
 * Live car telemetry for one driver: a broadcast-style halo gauge — throttle
 * up the left arc, brake up the right, speed on the outer scale. Mount keyed
 * by racing number so switching drivers starts clean. Energy/SOC gauges are
 * deliberately absent: the public feed carries none
 * (docs/plans/0005-driver-detail-tab.md).
 */
export function TelemetryPanel({ racingNumber }: { racingNumber: string }) {
  const carData = useDataStore((s) => s.state.CarData);
  const messages = useDataStore((s) => s.state.RaceControlMessages);
  const [trace, setTrace] = useState<TelemetrySample[]>([]);

  useEffect(() => {
    setTrace((prev) => appendTrace(prev, carData, racingNumber, TRACE_CAP));
  }, [carData, racingNumber]);

  // Trace tail first: a driver absent from one batch keeps the last reading
  // instead of flashing the empty state. latestSample covers the first paint.
  const sample = trace.at(-1) ?? latestSample(carData, racingNumber);
  const overtake = overtakeMode(messages);
  const straight = straightMode(messages);

  return (
    <section className="flex flex-col rounded-lg border border-zinc-800">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2.5">
        <h2 className="text-xs uppercase tracking-wide text-zinc-500">Car telemetry</h2>
        <div className="flex shrink-0 items-center gap-1.5">
          {straight && <ModeBadge label={`STR ${straight}`} on={straight !== "disabled"} />}
          {overtake && <ModeBadge label={`OT ${overtake}`} on={overtake === "enabled"} />}
          {sample && (
            <span className="font-mono text-xs tabular-nums text-zinc-600">
              {new Date(sample.utcMs).toISOString().slice(11, 19)}
            </span>
          )}
        </div>
      </div>

      {sample ? (
        // grow + center: the panel stretches to the right column's height
        // (DriverTab grid), and the gauge sits in the middle of it.
        <div className="flex grow flex-col justify-center p-4">
          <HaloGauge sample={sample} />
        </div>
      ) : (
        <p className="p-4 text-sm text-zinc-600">No car telemetry for this driver yet.</p>
      )}
    </section>
  );
}

/** Track-wide mode flag from Race Control (2026 regs — lib/raceControl.ts). */
function ModeBadge({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        on ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" : "border-zinc-700 text-zinc-500"
      }`}
    >
      {label}
    </span>
  );
}

// ----- Halo gauge -----------------------------------------------------------
//
// Modelled on the F1 app's driver-tracker instrument (re-implemented, not
// copied): ONE speedometer — the thick band sweeps along a 0–360 km/h scale,
// so the arc's tip reads against the numerals — plus two slim inner arcs for
// the pedals: throttle climbs the left side, brake the right.

const CX = 100;
const CY = 96;
const BAND_R = 68; // speedometer band centreline
const BAND_W = 15;
const PEDAL_R = 53; // slim pedal arcs, inside the band
const PEDAL_W = 6;
const LABEL_R = 89; // scale numerals — kept well clear of the band
const CAPTION_R = 36; // curved THROTTLE/BRAKE captions, well inside the arcs
// Degrees clockwise from 12 o'clock: the horseshoe spans 210° → 360° → 150°.
const ARC_START = 210;
const ARC_SPAN = 300;
const SIDE_SPAN = ARC_SPAN / 2;
const SCALE_STEPS = [0, 60, 120, 180, 240, 300, 360];

/** Point at `deg` clockwise from 12 o'clock, SVG screen coordinates. */
function polar(r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: CX + r * Math.sin(rad), y: CY - r * Math.cos(rad) };
}

/** Clockwise arc path from `from` to `to` (degrees from 12 o'clock). */
function arcPath(r: number, from: number, to: number) {
  const a = polar(r, from);
  const b = polar(r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

function HaloGauge({ sample }: { sample: TelemetrySample }) {
  const throttle = Math.max(0, Math.min(100, sample.throttle));
  const brake = Math.max(0, Math.min(100, sample.brake));
  const speed = Math.max(0, Math.min(SPEED_MAX, sample.speed));

  // The band itself is the speedometer: its tip reads against the numerals.
  const speedArc = arcPath(BAND_R, ARC_START, ARC_START + (speed / SPEED_MAX) * ARC_SPAN);
  // Throttle climbs the left side toward 12; brake mirrors it on the right.
  const throttleArc = arcPath(PEDAL_R, ARC_START, ARC_START + (throttle / 100) * SIDE_SPAN);
  const brakeArc = arcPath(
    PEDAL_R,
    ARC_START + ARC_SPAN - (brake / 100) * SIDE_SPAN,
    ARC_START + ARC_SPAN,
  );

  return (
    <svg
      viewBox="0 0 200 192"
      className="mx-auto block w-full max-w-[300px]"
      role="img"
      aria-label={`Speed ${sample.speed} km/h, RPM ${sample.rpm}, gear ${sample.gear}, throttle ${throttle}%, brake ${brake}%`}
    >
      <defs>
        {/* Innermost rails: captions stay on the dark background. */}
        <path id="halo-throttle-rail" d={arcPath(CAPTION_R, ARC_START, ARC_START + SIDE_SPAN)} />
        <path
          id="halo-brake-rail"
          d={arcPath(CAPTION_R, ARC_START + SIDE_SPAN, ARC_START + ARC_SPAN)}
        />
      </defs>

      {/* Speedometer band: dark rail, then the sweep up the 0–360 scale. */}
      <path
        d={arcPath(BAND_R, ARC_START, ARC_START + ARC_SPAN)}
        className="fill-none stroke-zinc-900"
        strokeWidth={BAND_W}
      />
      {speed > 0 && (
        <path d={speedArc} className="fill-none stroke-zinc-200" strokeWidth={BAND_W} />
      )}

      {/* Pedal arcs: throttle left, brake right, on their own slim rails. */}
      <path
        d={arcPath(PEDAL_R, ARC_START, ARC_START + SIDE_SPAN)}
        className="fill-none stroke-zinc-900"
        strokeWidth={PEDAL_W}
      />
      <path
        d={arcPath(PEDAL_R, ARC_START + SIDE_SPAN, ARC_START + ARC_SPAN)}
        className="fill-none stroke-zinc-900"
        strokeWidth={PEDAL_W}
      />
      {throttle > 0 && (
        <path d={throttleArc} className="fill-none stroke-emerald-500" strokeWidth={PEDAL_W} />
      )}
      {brake > 0 && (
        <path d={brakeArc} className="fill-none stroke-red-500" strokeWidth={PEDAL_W} />
      )}
      {SCALE_STEPS.map((step) => {
        const point = polar(LABEL_R, ARC_START + (step / SPEED_MAX) * ARC_SPAN);
        return (
          <text
            key={step}
            x={point.x}
            y={point.y}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-zinc-600 font-mono text-[7px]"
          >
            {step}
          </text>
        );
      })}

      {/* Curved pedal captions, anchored low on each side so they never
          climb up beside the speed digits. */}
      <text className="fill-zinc-500 font-mono text-[7px] uppercase tracking-[0.12em]">
        <textPath href="#halo-throttle-rail" startOffset="35%" textAnchor="middle">
          Throttle
        </textPath>
      </text>
      <text className="fill-zinc-500 font-mono text-[7px] uppercase tracking-[0.12em]">
        <textPath href="#halo-brake-rail" startOffset="65%" textAnchor="middle">
          Brake
        </textPath>
      </text>

      {/* Centre stack: speed, RPM, gear in the bottom gap. */}
      <text
        x={CX}
        y={80}
        textAnchor="middle"
        className="fill-zinc-100 font-mono text-[28px] font-bold tabular-nums"
      >
        {sample.speed}
      </text>
      <text
        x={CX}
        y={92}
        textAnchor="middle"
        className="fill-zinc-500 font-mono text-[8px] uppercase tracking-[0.25em]"
      >
        km/h
      </text>
      <text
        x={CX}
        y={112}
        textAnchor="middle"
        className="fill-zinc-300 font-mono text-[14px] font-semibold tabular-nums"
      >
        {sample.rpm.toLocaleString("en-US")}
      </text>
      <text
        x={CX}
        y={123}
        textAnchor="middle"
        className="fill-zinc-500 font-mono text-[8px] uppercase tracking-[0.25em]"
      >
        rpm
      </text>
      <text
        x={CX}
        y={182}
        textAnchor="middle"
        className="fill-zinc-500 font-mono text-[10px] uppercase tracking-[0.2em]"
      >
        Gear{" "}
        <tspan className="fill-zinc-100 text-[16px] font-bold">
          {sample.gear > 0 ? sample.gear : "N"}
        </tspan>
      </text>
    </svg>
  );
}
