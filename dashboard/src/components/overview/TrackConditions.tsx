"use client";

import { useRaceWeather } from "@/hooks/useRaceWeather";
import { useUpcomingRace } from "@/hooks/useUpcomingRace";
import { useDataStore } from "@/stores/useDataStore";
import type { RaceWeather, WeatherData } from "@/types";

type WeatherItem = {
  label: string;
  value: string;
  suffix?: string;
};

/** Live track conditions when a session runs, race-start forecast otherwise. */
export function TrackConditions({ live }: { live: boolean }) {
  const liveWeather = useDataStore((s) => s.state.WeatherData);
  const { race } = useUpcomingRace();
  const useLive = live && Boolean(liveWeather);
  const raceWeather = useRaceWeather(race, !useLive);

  if (useLive && liveWeather) {
    return (
      <ConditionsSection
        tag="live"
        meta={liveWeather.WindDirection ? `wind ${liveWeather.WindDirection}°` : undefined}
        items={liveItems(liveWeather)}
      />
    );
  }

  if (raceWeather.weather) {
    return (
      <ConditionsSection
        tag={raceWeather.weather.source === "current" ? "at the circuit now" : "race-start forecast"}
        items={raceItems(raceWeather.weather)}
      />
    );
  }

  return (
    <section className="rounded-lg border border-zinc-800 p-5">
      <h2 className="text-xs uppercase tracking-wide text-zinc-500">Track conditions</h2>
      <div className="mt-3 text-sm text-zinc-600">
        {raceWeather.loading ? "Loading weather…" : "No weather data."}
      </div>
    </section>
  );
}

function ConditionsSection({
  tag,
  meta,
  items,
}: {
  tag: string;
  meta?: string;
  items: WeatherItem[];
}) {
  return (
    <section className="rounded-lg border border-zinc-800 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-wide text-zinc-500">Track conditions</h2>
        <span className="font-mono text-xs text-zinc-600">{meta ? `${tag} · ${meta}` : tag}</span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-[10px] uppercase tracking-wide text-zinc-600">{item.label}</dt>
            <dd className="mt-1 font-mono text-xl tabular-nums text-zinc-200">
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

function liveItems(weather: WeatherData): WeatherItem[] {
  const rain = isWet(weather.Rainfall) ? "wet" : "dry";

  return [
    { label: "Air", value: showString(weather.AirTemp), suffix: "°C" },
    { label: "Track", value: showString(weather.TrackTemp), suffix: "°C" },
    { label: "Rain", value: rain },
    { label: "Wind", value: showString(weather.WindSpeed), suffix: "km/h" },
    { label: "Humidity", value: showString(weather.Humidity), suffix: "%" },
    { label: "Pressure", value: showString(weather.Pressure), suffix: "mbar" },
  ];
}

function raceItems(weather: RaceWeather): WeatherItem[] {
  return [
    { label: "Air", value: showNumber(weather.airTemp, 1), suffix: "°C" },
    { label: "Rain", value: showNumber(weather.rain ?? weather.precipitation, 1), suffix: "mm" },
    { label: "Chance", value: showNumber(weather.precipitationProbability, 0), suffix: "%" },
    { label: "Wind", value: showNumber(weather.windSpeed, 0), suffix: "km/h" },
    { label: "Humidity", value: showNumber(weather.humidity, 0), suffix: "%" },
    { label: "Pressure", value: showNumber(weather.pressure, 0), suffix: "mbar" },
  ];
}

function showString(value: string) {
  return value.trim() || "--";
}

function showNumber(value: number | null | undefined, digits: number) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "--";
}

function isWet(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}
