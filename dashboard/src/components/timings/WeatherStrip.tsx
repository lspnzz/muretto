"use client";

import { useDataStore } from "@/stores/useDataStore";

type Complication = {
  label: string;
  value: string;
  unit?: string;
  /** 0..1 for the arc gauge; omit for textual values. */
  fraction?: number;
  colour: string;
};

/** Round watch-style weather complications for the timing top bar. */
export function WeatherStrip() {
  const weather = useDataStore((s) => s.state.WeatherData);
  if (!weather) return null;

  const num = (v: string) => {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };

  const track = num(weather.TrackTemp);
  const air = num(weather.AirTemp);
  const humidity = num(weather.Humidity);
  const wind = num(weather.WindSpeed);
  const wet = ["1", "true", "yes"].includes(weather.Rainfall.trim().toLowerCase());

  const items: Complication[] = [
    {
      label: "TRC",
      value: track === null ? "--" : String(Math.round(track)),
      unit: "°",
      fraction: track === null ? undefined : clamp01(track / 60),
      colour: "#FF9500",
    },
    {
      label: "AIR",
      value: air === null ? "--" : String(Math.round(air)),
      unit: "°",
      fraction: air === null ? undefined : clamp01(air / 40),
      colour: "#FFE620",
    },
    {
      label: "HUM",
      value: humidity === null ? "--" : String(Math.round(humidity)),
      unit: "%",
      fraction: humidity === null ? undefined : clamp01(humidity / 100),
      colour: "#4EBCFA",
    },
    {
      label: "RAIN",
      value: wet ? "WET" : "DRY",
      colour: wet ? "#36A6F9" : "#52525B",
      fraction: wet ? 1 : 0,
    },
    {
      label: "WIND",
      value: wind === null ? "--" : String(Math.round(wind)),
      unit: "km/h",
      fraction: wind === null ? undefined : clamp01(wind / 40),
      colour: "#60A5FA",
    },
  ];

  return (
    <div className="flex justify-between gap-3">
      {items.map((item) => (
        <Gauge key={item.label} item={item} />
      ))}
    </div>
  );
}

const GAUGE_SWEEP = 260; // degrees, symmetric around 12 o'clock

function Gauge({ item }: { item: Complication }) {
  return (
    <div className="relative flex h-[55px] w-[55px] flex-col items-center justify-center rounded-full bg-black">
      <svg viewBox="0 0 50 50" className="absolute inset-0 h-full w-full" aria-hidden>
        <path d={gaugeArc(1)} fill="none" stroke="#27272a" strokeWidth={4} strokeLinecap="round" />
        {item.fraction !== undefined && item.fraction > 0 && (
          <path
            d={gaugeArc(item.fraction)}
            fill="none"
            stroke={item.colour}
            strokeWidth={4}
            strokeLinecap="round"
          />
        )}
      </svg>
      <p className="text-sm font-bold leading-none tabular-nums">
        {item.value}
        {item.unit && item.value !== "--" ? (
          <span className="text-[8px] font-medium text-zinc-500">{item.unit}</span>
        ) : null}
      </p>
      <p className="mt-0.5 text-[8px] leading-none text-zinc-500">{item.label}</p>
    </div>
  );
}

function gaugeArc(fraction: number): string {
  const start = -GAUGE_SWEEP / 2;
  const end = start + GAUGE_SWEEP * clamp01(fraction);
  const point = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return { x: 25 + 21 * Math.sin(rad), y: 25 - 21 * Math.cos(rad) };
  };
  const a = point(start);
  const b = point(end);
  const largeArc = end - start > 180 ? 1 : 0;
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A 21 21 0 ${largeArc} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
