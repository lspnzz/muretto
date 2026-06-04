"use client";

import { useEffect, useState } from "react";

import type { RaceWeather } from "@/types";
import type { UpcomingRace } from "@/types/UpcomingRace";

type RaceWeatherState = {
  weather?: RaceWeather;
  loading: boolean;
  error?: string;
};

export function useRaceWeather(
  race: UpcomingRace | undefined,
  enabled = true,
): RaceWeatherState {
  const [state, setState] = useState<RaceWeatherState>({ loading: false });
  const latitude = race?.latitude;
  const longitude = race?.longitude;
  const raceIso = race?.raceIso;

  useEffect(() => {
    if (!enabled || !Number.isFinite(latitude) || !Number.isFinite(longitude) || !raceIso) {
      setState({ loading: false });
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({
      lat: String(latitude),
      lon: String(longitude),
      at: raceIso,
    });

    setState({ loading: true });

    fetch(`/api/weather/race?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Weather request failed: ${response.status}`);
        return (await response.json()) as RaceWeather;
      })
      .then((weather) => setState({ weather, loading: false }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({
          loading: false,
          error: error instanceof Error ? error.message : "Weather request failed",
        });
      });

    return () => controller.abort();
  }, [enabled, latitude, longitude, raceIso]);

  return state;
}
