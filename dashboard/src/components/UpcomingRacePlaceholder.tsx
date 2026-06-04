"use client";

import { useUpcomingRace } from "@/hooks/useUpcomingRace";
import type { UpcomingRace } from "@/types/UpcomingRace";

type RacePlaceholderProps = {
  compact?: boolean;
};

export function UpcomingRacePanel({ compact = false }: RacePlaceholderProps) {
  const { race, loading } = useUpcomingRace();

  if (loading) return <PlaceholderShell compact={compact} />;
  if (!race) return <div className="p-6 text-sm text-zinc-500">Waiting for timing data...</div>;

  return (
    <section
      className={[
        "flex h-full min-h-[18rem] flex-col justify-start px-4 text-zinc-300",
        compact ? "py-4" : "py-8",
      ].join(" ")}
    >
      <p className="text-xs uppercase tracking-wide text-zinc-600">Next race</p>
      <h2
        className={[
          "mt-1 max-w-full text-zinc-100",
          compact ? "text-xl font-semibold" : "text-3xl font-semibold",
        ].join(" ")}
      >
        {race.raceName}
      </h2>
      <p className="mt-1 text-sm text-zinc-500">
        {race.round ? `Round ${race.round} - ` : ""}
        {race.circuitName}
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-zinc-900 py-4">
        <RaceFact label="Weekend" value={formatDateRange(race)} />
        <RaceFact label="Race" value={formatDateTime(race.raceIso)} />
        <RaceFact label="Location" value={formatLocation(race)} />
        <RaceFact label="Source" value="Live calendar" />
      </dl>
    </section>
  );
}

export function UpcomingRaceTimings() {
  const { race, loading } = useUpcomingRace();

  if (loading) return <PlaceholderShell />;
  if (!race) return <div className="p-6 text-sm text-zinc-500">Waiting for timing data...</div>;

  return (
    <section className="min-w-[22rem]">
      <div className="flex items-center justify-between px-3 py-2">
        <div>
          <h2 className="text-xs uppercase tracking-wide text-zinc-500">Next race timings</h2>
          <p className="mt-1 text-sm text-zinc-300">{race.raceName}</p>
        </div>
        <span className="font-mono text-xs text-zinc-600">{formatDateRange(race)}</span>
      </div>
      <ul className="border-t border-zinc-900">
        {race.sessions.map((session) => (
          <li
            key={`${session.name}-${session.iso}`}
            className="flex items-center gap-3 px-3 py-2 odd:bg-zinc-900/40"
          >
            <span className="w-32 text-sm font-medium text-zinc-300">{session.name}</span>
            <span className="font-mono text-sm tabular-nums text-zinc-500">
              {formatDateTime(session.iso)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PlaceholderShell({ compact = false }: RacePlaceholderProps) {
  return (
    <section
      className={[
        "flex h-full min-h-[18rem] flex-col justify-start px-4",
        compact ? "py-4" : "py-8",
      ].join(" ")}
    >
      <div className="h-3 w-20 rounded-sm bg-zinc-900" />
      <div className="mt-3 h-7 w-56 rounded-sm bg-zinc-900" />
      <div className="mt-2 h-4 w-44 rounded-sm bg-zinc-900" />
      <div className="mt-5 grid grid-cols-2 gap-3 border-y border-zinc-900 py-4">
        <div className="h-10 rounded-sm bg-zinc-900" />
        <div className="h-10 rounded-sm bg-zinc-900" />
        <div className="h-10 rounded-sm bg-zinc-900" />
        <div className="h-10 rounded-sm bg-zinc-900" />
      </div>
    </section>
  );
}

function RaceFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-zinc-600">{label}</dt>
      <dd className="mt-1 text-sm text-zinc-300">{value}</dd>
    </div>
  );
}

function formatDateRange(race: UpcomingRace) {
  if (race.sessions.length === 0) return formatDate(race.raceIso);
  return `${formatDate(race.sessions[0].iso)} - ${formatDate(race.raceIso)}`;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZoneName: "short",
    weekday: "short",
  }).format(new Date(iso));
}

function formatLocation(race: UpcomingRace) {
  return [race.locality, race.country].filter(Boolean).join(", ");
}
