import { NextRequest, NextResponse } from "next/server";

import type { UpcomingRace, UpcomingRaceSession } from "@/types/UpcomingRace";

const JOLPICA_CURRENT_SEASON = "https://api.jolpi.ca/ergast/f1/current.json";
const REVALIDATE_SECONDS = 60 * 60 * 6;
const RACE_GRACE_MS = 4 * 60 * 60 * 1000;

const SESSION_FIELDS = [
  ["FirstPractice", "Practice 1"],
  ["SecondPractice", "Practice 2"],
  ["ThirdPractice", "Practice 3"],
  ["SprintQualifying", "Sprint qualifying"],
  ["Sprint", "Sprint"],
  ["Qualifying", "Qualifying"],
] as const;

type JolpicaSession = {
  date?: string;
  time?: string;
};

type JolpicaRace = {
  season?: string;
  round?: string;
  url?: string;
  raceName?: string;
  date?: string;
  time?: string;
  Circuit?: {
    circuitId?: string;
    circuitName?: string;
    Location?: {
      lat?: string;
      long?: string;
      locality?: string;
      country?: string;
    };
  };
} & Partial<Record<(typeof SESSION_FIELDS)[number][0], JolpicaSession>>;

type JolpicaScheduleResponse = {
  MRData?: {
    RaceTable?: {
      season?: string;
      Races?: JolpicaRace[];
    };
  };
};

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const now = parseNow(request.nextUrl.searchParams.get("now"));
  const response = await fetch(JOLPICA_CURRENT_SEASON, {
    headers: {
      Accept: "application/json",
      "User-Agent": "muretto-dashboard/0.1",
    },
    next: { revalidate: REVALIDATE_SECONDS },
  });

  if (!response.ok) {
    return NextResponse.json({ error: "Schedule unavailable" }, { status: 502 });
  }

  const payload = (await response.json()) as JolpicaScheduleResponse;
  const races = payload.MRData?.RaceTable?.Races ?? [];
  const race = races.map(normalizeRace).find((candidate): candidate is UpcomingRace => {
    if (!candidate) return false;
    return new Date(candidate.raceIso).getTime() + RACE_GRACE_MS >= now.getTime();
  });

  if (!race) {
    return NextResponse.json({ error: "No upcoming race found" }, { status: 404 });
  }

  const json = NextResponse.json(race);
  json.headers.set("Cache-Control", "public, s-maxage=900, stale-while-revalidate=3600");
  return json;
}

function normalizeRace(race: JolpicaRace): UpcomingRace | null {
  const raceIso = toIso(race.date, race.time);
  if (!raceIso || !race.raceName || !race.Circuit?.circuitName || !race.Circuit.circuitId) {
    return null;
  }

  return {
    season: race.season ?? "",
    round: race.round ?? "",
    raceName: race.raceName,
    raceUrl: race.url,
    circuitId: race.Circuit.circuitId,
    circuitName: race.Circuit.circuitName,
    locality: race.Circuit.Location?.locality ?? "",
    country: race.Circuit.Location?.country ?? "",
    latitude: parseNumber(race.Circuit.Location?.lat),
    longitude: parseNumber(race.Circuit.Location?.long),
    raceIso,
    sessions: sessionList(race, raceIso),
  };
}

function sessionList(race: JolpicaRace, raceIso: string): UpcomingRaceSession[] {
  return [
    ...SESSION_FIELDS.flatMap(([key, name]) => {
      const iso = toIso(race[key]?.date, race[key]?.time);
      return iso ? [{ name, iso }] : [];
    }),
    { name: "Race", iso: raceIso },
  ].sort((a, b) => new Date(a.iso).getTime() - new Date(b.iso).getTime());
}

function toIso(date: string | undefined, time: string | undefined) {
  if (!date) return null;
  return `${date}T${time || "00:00:00Z"}`;
}

function parseNumber(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseNow(value: string | null) {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}
