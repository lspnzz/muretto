import { NextRequest, NextResponse } from "next/server";

import type { RaceWeather } from "@/types";

const OPEN_METEO_FORECAST = "https://api.open-meteo.com/v1/forecast";
const REVALIDATE_SECONDS = 15 * 60;
const CURRENT_VARIABLES = [
  "temperature_2m",
  "relative_humidity_2m",
  "precipitation",
  "rain",
  "weather_code",
  "pressure_msl",
  "surface_pressure",
  "wind_speed_10m",
  "wind_direction_10m",
].join(",");
const HOURLY_VARIABLES = [
  "temperature_2m",
  "relative_humidity_2m",
  "precipitation_probability",
  "precipitation",
  "rain",
  "weather_code",
  "pressure_msl",
  "surface_pressure",
  "wind_speed_10m",
  "wind_direction_10m",
].join(",");

type OpenMeteoResponse = {
  current?: OpenMeteoCurrent;
  hourly?: OpenMeteoHourly;
};

type OpenMeteoCurrent = {
  time?: string;
  temperature_2m?: number | null;
  relative_humidity_2m?: number | null;
  precipitation?: number | null;
  rain?: number | null;
  weather_code?: number | null;
  pressure_msl?: number | null;
  surface_pressure?: number | null;
  wind_speed_10m?: number | null;
  wind_direction_10m?: number | null;
};

type OpenMeteoHourly = {
  time?: string[];
  temperature_2m?: Array<number | null>;
  relative_humidity_2m?: Array<number | null>;
  precipitation_probability?: Array<number | null>;
  precipitation?: Array<number | null>;
  rain?: Array<number | null>;
  weather_code?: Array<number | null>;
  pressure_msl?: Array<number | null>;
  surface_pressure?: Array<number | null>;
  wind_speed_10m?: Array<number | null>;
  wind_direction_10m?: Array<number | null>;
};

export async function GET(request: NextRequest) {
  const latitude = parseCoordinate(request.nextUrl.searchParams.get("lat"), -90, 90);
  const longitude = parseCoordinate(request.nextUrl.searchParams.get("lon"), -180, 180);

  if (latitude === null || longitude === null) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  const target = parseTarget(request.nextUrl.searchParams.get("at"));
  let response: Response;

  try {
    response = await fetch(weatherUrl(latitude, longitude), {
      headers: {
        Accept: "application/json",
        "User-Agent": "muretto-dashboard/0.1",
      },
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    return NextResponse.json({ error: "Weather unavailable" }, { status: 502 });
  }

  if (!response.ok) {
    return NextResponse.json({ error: "Weather unavailable" }, { status: 502 });
  }

  const payload = (await response.json()) as OpenMeteoResponse;
  const weather = pickWeather(payload, target);

  if (!weather) {
    return NextResponse.json({ error: "Weather unavailable" }, { status: 404 });
  }

  const json = NextResponse.json(weather);
  json.headers.set(
    "Cache-Control",
    `public, s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=${REVALIDATE_SECONDS * 2}`,
  );
  return json;
}

function weatherUrl(latitude: number, longitude: number) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: CURRENT_VARIABLES,
    hourly: HOURLY_VARIABLES,
    forecast_days: "16",
    wind_speed_unit: "kmh",
    precipitation_unit: "mm",
  });

  return `${OPEN_METEO_FORECAST}?${params}`;
}

function pickWeather(payload: OpenMeteoResponse, target: Date): RaceWeather | null {
  const hourlyIndex = closestHourlyIndex(payload.hourly, target);
  if (hourlyIndex !== -1 && payload.hourly) {
    return fromHourly(payload.hourly, hourlyIndex);
  }

  return fromCurrent(payload.current);
}

function closestHourlyIndex(hourly: OpenMeteoHourly | undefined, target: Date) {
  const times = hourly?.time ?? [];
  let bestIndex = -1;
  let bestDelta = Number.POSITIVE_INFINITY;

  times.forEach((time, index) => {
    const parsed = Date.parse(`${time}Z`);
    if (Number.isNaN(parsed)) return;

    const delta = Math.abs(parsed - target.getTime());
    if (delta < bestDelta) {
      bestIndex = index;
      bestDelta = delta;
    }
  });

  return bestDelta <= 90 * 60 * 1000 ? bestIndex : -1;
}

function fromHourly(hourly: OpenMeteoHourly, index: number): RaceWeather {
  return {
    source: "forecast",
    time: toUtcIso(hourly.time?.[index]),
    airTemp: numberAt(hourly.temperature_2m, index),
    humidity: numberAt(hourly.relative_humidity_2m, index),
    pressure: numberAt(hourly.pressure_msl, index) ?? numberAt(hourly.surface_pressure, index),
    rain: numberAt(hourly.rain, index),
    precipitation: numberAt(hourly.precipitation, index),
    precipitationProbability: numberAt(hourly.precipitation_probability, index),
    windDirection: numberAt(hourly.wind_direction_10m, index),
    windSpeed: numberAt(hourly.wind_speed_10m, index),
    weatherCode: numberAt(hourly.weather_code, index),
  };
}

function fromCurrent(current: OpenMeteoCurrent | undefined): RaceWeather | null {
  if (!current?.time) return null;

  return {
    source: "current",
    time: toUtcIso(current.time),
    airTemp: numberOrNull(current.temperature_2m),
    humidity: numberOrNull(current.relative_humidity_2m),
    pressure: numberOrNull(current.pressure_msl) ?? numberOrNull(current.surface_pressure),
    rain: numberOrNull(current.rain),
    precipitation: numberOrNull(current.precipitation),
    precipitationProbability: null,
    windDirection: numberOrNull(current.wind_direction_10m),
    windSpeed: numberOrNull(current.wind_speed_10m),
    weatherCode: numberOrNull(current.weather_code),
  };
}

function parseCoordinate(value: string | null, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function parseTarget(value: string | null) {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function numberAt(values: Array<number | null> | undefined, index: number) {
  return numberOrNull(values?.[index]);
}

function numberOrNull(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toUtcIso(value: string | undefined) {
  const parsed = value ? Date.parse(`${value}Z`) : Number.NaN;
  return Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString();
}
