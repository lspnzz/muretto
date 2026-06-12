"use client";

import { useUpcomingRace } from "@/hooks/useUpcomingRace";
import type { UpcomingRace } from "@/types/UpcomingRace";
import { Countdown } from "./Countdown";

/** The next-race card — deliberately the only place next-race data appears. */
export function NextRace() {
  const { race, loading } = useUpcomingRace();

  if (loading) return <NextRaceSkeleton />;
  if (!race) {
    return (
      <section className="rounded-lg border border-zinc-800 p-5 text-sm text-zinc-500">
        No upcoming race found in the calendar.
      </section>
    );
  }

  const nextSession =
    race.sessions.find((s) => Date.parse(s.iso) >= Date.now()) ?? race.sessions.at(-1);

  return (
    <section className="rounded-lg border border-zinc-800 p-5">
      <p className="text-xs uppercase tracking-wide text-zinc-600">Next race</p>
      <h2 className="mt-1 text-3xl font-semibold text-zinc-100">{race.raceName}</h2>
      <p className="mt-1 text-sm text-zinc-500">
        {race.round ? `Round ${race.round} — ` : ""}
        {race.circuitName}
        {formatLocation(race) ? ` · ${formatLocation(race)}` : ""}
      </p>

      <div className="mt-5 flex flex-wrap gap-8 border-y border-zinc-900 py-4">
        {nextSession && (
          <Countdown targetIso={nextSession.iso} label={`${nextSession.name} starts in`} />
        )}
        {nextSession?.iso !== race.raceIso && (
          <Countdown targetIso={race.raceIso} label="Race starts in" />
        )}
      </div>

      <ul className="mt-4">
        {race.sessions.map((session) => {
          const past = Date.parse(session.iso) < Date.now();
          const next = session === nextSession && !past;
          return (
            <li
              key={`${session.name}-${session.iso}`}
              className={[
                "flex items-center gap-3 rounded-sm px-2 py-1.5 odd:bg-zinc-900/40",
                past ? "opacity-50" : "",
              ].join(" ")}
            >
              <span
                className={`w-32 text-sm font-medium ${next ? "text-zinc-100" : "text-zinc-300"}`}
              >
                {session.name}
              </span>
              <span
                className={`font-mono text-sm tabular-nums ${next ? "text-zinc-300" : "text-zinc-500"}`}
              >
                {formatDateTime(session.iso)}
              </span>
              {next && (
                <span className="rounded-sm bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-400">
                  next
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function NextRaceSkeleton() {
  return (
    <section className="animate-pulse rounded-lg border border-zinc-800 p-5">
      <div className="h-3 w-20 rounded-sm bg-zinc-900" />
      <div className="mt-3 h-8 w-64 rounded-sm bg-zinc-900" />
      <div className="mt-2 h-4 w-44 rounded-sm bg-zinc-900" />
      <div className="mt-5 h-20 rounded-sm bg-zinc-900" />
      <div className="mt-4 h-32 rounded-sm bg-zinc-900" />
    </section>
  );
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}

function formatLocation(race: UpcomingRace) {
  return [race.locality, race.country].filter(Boolean).join(", ");
}
