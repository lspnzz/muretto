"use client";

import { useEffect, useState } from "react";

import type { UpcomingRace } from "@/types/UpcomingRace";

type UpcomingRaceState = {
  race?: UpcomingRace;
  loading: boolean;
  error?: string;
};

export function useUpcomingRace(): UpcomingRaceState {
  const [state, setState] = useState<UpcomingRaceState>({ loading: true });

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/schedule/next", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Schedule request failed: ${response.status}`);
        return (await response.json()) as UpcomingRace;
      })
      .then((race) => setState({ race, loading: false }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({
          loading: false,
          error: error instanceof Error ? error.message : "Schedule request failed",
        });
      });

    return () => controller.abort();
  }, []);

  return state;
}
