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

export function WeatherPanel() {
  const liveWeather = useDataStore((s) => s.state.WeatherData);
  const { race } = useUpcomingRace();
  const raceWeather = useRaceWeather(race, !liveWeather);

  if (liveWeather) {
    return (
      <WeatherSection
        meta={liveWeather.WindDirection ? `${liveWeather.WindDirection} deg` : "--"}
        items={liveItems(liveWeather)}
      />
    );
  }

  if (raceWeather.weather) {
    return (
      <WeatherSection
        meta={raceWeather.weather.source === "forecast" ? "race forecast" : "current"}
        items={raceItems(raceWeather.weather)}
      />
    );
  }

  if (raceWeather.loading) {
    return (
      <section className="border-b border-zinc-800 px-3 py-3">
        <h2 className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Weather</h2>
        <div className="text-sm text-zinc-600">Loading weather.</div>
      </section>
    );
  }

  return (
    <section className="border-b border-zinc-800 px-3 py-3">
      <h2 className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Weather</h2>
      <div className="text-sm text-zinc-600">No weather data.</div>
    </section>
  );
}

function WeatherSection({ meta, items }: { meta: string; items: WeatherItem[] }) {
  return (
    <section className="border-b border-zinc-800 px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-wide text-zinc-500">Weather</h2>
        <span className="font-mono text-xs text-zinc-600">{meta}</span>
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

function liveItems(weather: WeatherData): WeatherItem[] {
  const rain = isWet(weather.Rainfall) ? "wet" : "dry";

  return [
    { label: "Air", value: showString(weather.AirTemp), suffix: "C" },
    { label: "Track", value: showString(weather.TrackTemp), suffix: "C" },
    { label: "Rain", value: rain },
    { label: "Wind", value: showString(weather.WindSpeed), suffix: "km/h" },
    { label: "Hum", value: showString(weather.Humidity), suffix: "%" },
    { label: "Press", value: showString(weather.Pressure), suffix: "mbar" },
  ];
}

function raceItems(weather: RaceWeather): WeatherItem[] {
  return [
    { label: "Air", value: showNumber(weather.airTemp, 1), suffix: "C" },
    { label: "Rain", value: showNumber(weather.rain ?? weather.precipitation, 1), suffix: "mm" },
    { label: "Chance", value: showNumber(weather.precipitationProbability, 0), suffix: "%" },
    { label: "Wind", value: showNumber(weather.windSpeed, 0), suffix: "km/h" },
    { label: "Hum", value: showNumber(weather.humidity, 0), suffix: "%" },
    { label: "Press", value: showNumber(weather.pressure, 0), suffix: "mbar" },
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
