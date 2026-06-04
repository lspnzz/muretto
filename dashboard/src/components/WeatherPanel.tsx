"use client";

import { useDataStore } from "@/stores/useDataStore";
import { UpcomingRaceInline } from "./UpcomingRacePlaceholder";

type WeatherItem = {
  label: string;
  value: string;
  suffix?: string;
};

export function WeatherPanel() {
  const weather = useDataStore((s) => s.state.WeatherData);

  if (!weather) {
    return (
      <section className="border-b border-zinc-800 px-3 py-3">
        <h2 className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Weather</h2>
        <UpcomingRaceInline label="No weather data." />
      </section>
    );
  }

  const rain = isWet(weather.Rainfall) ? "wet" : "dry";
  const items: WeatherItem[] = [
    { label: "Air", value: show(weather.AirTemp), suffix: "C" },
    { label: "Track", value: show(weather.TrackTemp), suffix: "C" },
    { label: "Rain", value: rain },
    { label: "Wind", value: show(weather.WindSpeed), suffix: "km/h" },
    { label: "Hum", value: show(weather.Humidity), suffix: "%" },
    { label: "Press", value: show(weather.Pressure), suffix: "mbar" },
  ];

  return (
    <section className="border-b border-zinc-800 px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-wide text-zinc-500">Weather</h2>
        <span className="font-mono text-xs text-zinc-600">
          {weather.WindDirection ? `${weather.WindDirection} deg` : "--"}
        </span>
      </div>
      <dl className="grid grid-cols-3 gap-x-3 gap-y-2">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-[10px] uppercase tracking-wide text-zinc-600">{item.label}</dt>
            <dd className="font-mono text-sm tabular-nums text-zinc-200">
              {item.value}
              {item.suffix && item.value !== "--" ? (
                <span className="ml-1 text-xs text-zinc-500">{item.suffix}</span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function show(value: string) {
  return value.trim() || "--";
}

function isWet(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}
