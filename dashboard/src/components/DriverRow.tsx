"use client";

import { useState, type ReactNode } from "react";

import {
  type DriverRow as Row,
  currentTyre,
  pitCount,
  stintLaps,
  stintsForDriver,
  telemetry,
} from "@/lib/selectors";
import { TYRE_COLOR } from "@/lib/tyre";
import type { CarChannels, LapVal, Sector, Segment, State, Stint, TimingDataDriver } from "@/types";

export const TIMING_GRID_STYLE = {
  gridTemplateColumns:
    "2rem 0.25rem 3.25rem 4.75rem 4.75rem 5.25rem 5.25rem 6.5rem 3rem 3.75rem 3.25rem 7rem minmax(10rem,1fr) 2rem",
} as const;

export function DriverRow({ row, state }: { row: Row; state: State }) {
  const [expanded, setExpanded] = useState(false);
  const { driver, timing, racingNumber } = row;
  const position = timing?.Position || String(row.position);
  const tla = driver?.Tla || racingNumber;
  const colour = driver?.TeamColour ? `#${driver.TeamColour}` : "#666";
  const tyre = currentTyre(state, racingNumber);
  const lapsOnTyre = stintLaps(state, racingNumber);
  const stops = pitCount(state, racingNumber);
  const stints = stintsForDriver(state, racingNumber);
  const channels = telemetry(state, racingNumber);
  const drsOpen = (channels?.["45"] ?? 0) >= 10;
  const badges = statusBadges(timing, drsOpen);

  return (
    <li className="border-b border-zinc-900/80 odd:bg-zinc-900/35">
      <div
        className="grid min-h-10 items-center gap-3 px-3 py-1.5"
        style={TIMING_GRID_STYLE}
      >
        <span className="text-right text-sm font-semibold tabular-nums text-zinc-300">
          {position}
        </span>
        <span className="h-5 rounded" style={{ backgroundColor: colour }} aria-hidden />
        <span className="font-mono font-semibold text-zinc-100">{tla}</span>

        <TimingValue value={position === "1" ? "Leader" : timing?.GapToLeader} />
        <TimingValue value={timing?.IntervalToPositionAhead?.Value} muted />
        <LapTime value={timing?.LastLapTime} />
        <LapTime value={timing?.BestLapTime} />
        <SectorChips timing={timing} />

        <span
          className={`text-center text-sm font-bold ${tyre ? (TYRE_COLOR[tyre] ?? "text-zinc-400") : "text-zinc-700"}`}
          title={tyre || "No tyre data"}
        >
          {tyre?.[0] ?? "-"}
        </span>
        <span className="font-mono text-sm tabular-nums text-zinc-400">
          {lapsOnTyre === undefined ? "L--" : `L${lapsOnTyre}`}
          <span className="ml-1 text-zinc-600">P{stops}</span>
        </span>
        <span className="font-mono text-sm tabular-nums text-zinc-400">
          {timing?.NumberOfLaps ?? "--"}
        </span>

        <span className="flex min-w-0 flex-wrap gap-1">
          {badges.length === 0 ? (
            <span className="text-xs text-zinc-700">--</span>
          ) : (
            badges.map((badge) => (
              <span
                key={badge.label}
                className={`rounded-sm border px-1 py-0.5 text-[0.62rem] font-semibold leading-none ${BADGE_TONE[badge.tone]}`}
                title={badge.title}
              >
                {badge.label}
              </span>
            ))
          )}
        </span>

        <TelemetrySummary channels={channels} drsOpen={drsOpen} />

        <button
          type="button"
          aria-expanded={expanded}
          aria-label={`${expanded ? "Hide" : "Show"} ${tla} timing details`}
          className="flex h-7 w-7 items-center justify-center rounded-sm border border-zinc-800 font-mono text-sm text-zinc-500 transition-colors hover:border-zinc-600 hover:bg-zinc-900 hover:text-zinc-100"
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? "-" : "+"}
        </button>
      </div>

      {expanded && (
        <DriverDetails timing={timing} channels={channels} stints={stints} drsOpen={drsOpen} />
      )}
    </li>
  );
}

function TimingValue({ value, muted = false }: { value: string | undefined; muted?: boolean }) {
  return (
    <span className={`font-mono text-sm tabular-nums ${muted ? "text-zinc-500" : "text-zinc-400"}`}>
      {value || "--"}
    </span>
  );
}

function LapTime({ value }: { value: LapVal | undefined }) {
  return (
    <span className={`font-mono text-sm tabular-nums ${lapTone(value)}`}>
      {value?.Value || "--"}
    </span>
  );
}

function SectorChips({ timing }: { timing: TimingDataDriver | undefined }) {
  return (
    <span className="grid grid-cols-3 gap-1">
      {sectorEntries(timing).map(({ sector }, index) => {
        const label = `S${index + 1}`;
        return (
          <span
            key={label}
            className={`rounded-sm border px-1 py-0.5 text-center font-mono text-[0.65rem] leading-none ${sectorTone(sector)}`}
            title={sectorTitle(label, sector)}
            aria-label={sectorTitle(label, sector)}
          >
            {index + 1}
          </span>
        );
      })}
    </span>
  );
}

function TelemetrySummary({
  channels,
  drsOpen,
}: {
  channels: CarChannels | undefined;
  drsOpen: boolean;
}) {
  if (!channels) {
    return <span className="font-mono text-xs text-zinc-700">No telemetry</span>;
  }

  return (
    <span className="flex min-w-0 items-center gap-3 font-mono text-xs tabular-nums text-zinc-400">
      <span className="w-14 text-right">{channels["2"]} km/h</span>
      <span className="w-5 text-center">G{channels["3"]}</span>
      <span className={`w-8 text-center ${drsOpen ? "text-green-400" : "text-zinc-600"}`}>
        DRS
      </span>
    </span>
  );
}

function DriverDetails({
  timing,
  channels,
  stints,
  drsOpen,
}: {
  timing: TimingDataDriver | undefined;
  channels: CarChannels | undefined;
  stints: Stint[];
  drsOpen: boolean;
}) {
  return (
    <div className="grid gap-4 border-t border-zinc-900/80 px-3 pb-3 pt-2 text-xs text-zinc-400 md:grid-cols-2 xl:grid-cols-4">
      <DetailSection title="Telemetry">
        {channels ? (
          <div className="space-y-2">
            <div className="grid grid-cols-4 gap-2 font-mono tabular-nums">
              <DetailMetric label="Speed" value={`${channels["2"]} km/h`} />
              <DetailMetric label="Gear" value={`G${channels["3"]}`} />
              <DetailMetric label="RPM" value={String(channels["0"])} />
              <DetailMetric label="DRS" value={drsOpen ? "Open" : "Closed"} />
            </div>
            <TelemetryBar label="Throttle" value={channels["4"]} tone="bg-green-400" />
            <TelemetryBar label="Brake" value={channels["5"]} tone="bg-red-400" />
          </div>
        ) : (
          <EmptyDetail>No telemetry feed.</EmptyDetail>
        )}
      </DetailSection>

      <DetailSection title="Speed traps">
        {timing ? (
          <div className="grid grid-cols-4 gap-2 font-mono tabular-nums">
            <DetailMetric label="I1" value={timing.Speeds.I1.Value || "--"} tone={lapTone(timing.Speeds.I1)} />
            <DetailMetric label="I2" value={timing.Speeds.I2.Value || "--"} tone={lapTone(timing.Speeds.I2)} />
            <DetailMetric label="FL" value={timing.Speeds.Fl.Value || "--"} tone={lapTone(timing.Speeds.Fl)} />
            <DetailMetric label="ST" value={timing.Speeds.St.Value || "--"} tone={lapTone(timing.Speeds.St)} />
          </div>
        ) : (
          <EmptyDetail>No speed-trap data.</EmptyDetail>
        )}
      </DetailSection>

      <DetailSection title="Sectors">
        {timing ? (
          <div className="space-y-1.5">
            {sectorEntries(timing).map(({ sector }, index) => (
              <div key={index} className="grid grid-cols-[2rem_minmax(0,1fr)_4.5rem] items-center gap-2">
                <span className="font-mono text-zinc-500">S{index + 1}</span>
                <SegmentPips sector={sector} />
                <span className={`text-right font-mono tabular-nums ${sectorTextTone(sector)}`}>
                  {sector?.Value || "--"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyDetail>No sector data.</EmptyDetail>
        )}
      </DetailSection>

      <DetailSection title="Stints">
        {stints.length > 0 ? (
          <ol className="flex flex-wrap gap-1.5">
            {stints.map((stint, index) => (
              <li
                key={`${stint.Compound ?? "unknown"}-${index}`}
                className="rounded-sm border border-zinc-800 bg-zinc-950 px-2 py-1 font-mono tabular-nums"
                title={stint.New === "TRUE" ? "New tyre" : stint.New === "FALSE" ? "Used tyre" : undefined}
              >
                <span className={`font-bold ${stint.Compound ? (TYRE_COLOR[stint.Compound] ?? "text-zinc-400") : "text-zinc-600"}`}>
                  {stint.Compound?.[0] ?? "-"}
                </span>
                <span className="ml-2 text-zinc-400">L{stint.TotalLaps ?? "--"}</span>
                <span className="ml-2 text-zinc-600">{stint.New === "TRUE" ? "N" : "U"}</span>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyDetail>No stint history.</EmptyDetail>
        )}
        {timing && (
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono tabular-nums">
            <DetailPair label="To fastest" value={timing.TimeDiffToFastest || "--"} />
            <DetailPair label="To ahead" value={timing.TimeDiffToPositionAhead || "--"} />
            <DetailPair label="Laps" value={String(timing.NumberOfLaps ?? "--")} />
            <DetailPair label="Status" value={String(timing.Status)} />
          </dl>
        )}
      </DetailSection>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <h3 className="mb-2 text-[0.68rem] uppercase tracking-wide text-zinc-600">{title}</h3>
      {children}
    </section>
  );
}

function DetailMetric({
  label,
  value,
  tone = "text-zinc-300",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[0.62rem] uppercase text-zinc-600">{label}</div>
      <div className={`truncate text-sm ${tone}`}>{value}</div>
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-zinc-600">{label}</dt>
      <dd className="text-right text-zinc-300">{value}</dd>
    </>
  );
}

function TelemetryBar({ label, value, tone }: { label: string; value: number; tone: string }) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_2.5rem] items-center gap-2">
      <span className="text-zinc-600">{label}</span>
      <span className="h-1.5 overflow-hidden rounded-sm bg-zinc-900">
        <span className={`block h-full ${tone}`} style={{ width: `${clamped}%` }} />
      </span>
      <span className="text-right font-mono tabular-nums text-zinc-300">{clamped}%</span>
    </div>
  );
}

function SegmentPips({ sector }: { sector: Sector | undefined }) {
  const segments = segmentEntries(sector);

  if (segments.length === 0) {
    return <span className="h-1.5 rounded-sm bg-zinc-900" />;
  }

  return (
    <span className="flex min-w-0 gap-1">
      {segments.map(({ segment }, index) => (
        <span
          key={index}
          className={`h-1.5 min-w-2 flex-1 rounded-sm ${segmentTone(segment)}`}
          title={`Segment ${index + 1}: ${segment?.Status ?? "--"}`}
        />
      ))}
    </span>
  );
}

function EmptyDetail({ children }: { children: ReactNode }) {
  return <div className="text-zinc-700">{children}</div>;
}

function sectorEntries(timing: TimingDataDriver | undefined) {
  const sectors = Object.entries(timing?.Sectors ?? {})
    .sort(([left], [right]) => Number(left) - Number(right))
    .flatMap(([, sector]) => (sector ? [{ sector }] : []));

  return [0, 1, 2].map((index) => sectors[index] ?? { sector: undefined });
}

function segmentEntries(sector: Sector | undefined) {
  return Object.entries(sector?.Segments ?? {})
    .sort(([left], [right]) => Number(left) - Number(right))
    .slice(0, 8)
    .map(([, segment]) => ({ segment }));
}

function sectorTitle(label: string, sector: Sector | undefined) {
  if (!sector) return `${label}: no data`;
  const value = sector.Value || "no time";
  if (sector.OverallFastest) return `${label}: ${value}, fastest overall`;
  if (sector.PersonalFastest) return `${label}: ${value}, personal best`;
  if (sector.Stopped) return `${label}: stopped`;
  return `${label}: ${value}`;
}

function lapTone(value: LapVal | undefined) {
  if (value?.OverallFastest) return "text-purple-300";
  if (value?.PersonalFastest) return "text-green-300";
  return "text-zinc-300";
}

function sectorTone(sector: Sector | undefined) {
  if (!sector) return "border-zinc-900 bg-zinc-950 text-zinc-700";
  if (sector.Stopped) return "border-red-500/60 bg-red-500/10 text-red-300";
  if (sector.OverallFastest) return "border-purple-400/70 bg-purple-500/10 text-purple-300";
  if (sector.PersonalFastest) return "border-green-400/70 bg-green-500/10 text-green-300";
  return "border-yellow-500/40 bg-yellow-500/10 text-yellow-200";
}

function sectorTextTone(sector: Sector | undefined) {
  if (!sector) return "text-zinc-700";
  if (sector.OverallFastest) return "text-purple-300";
  if (sector.PersonalFastest) return "text-green-300";
  if (sector.Stopped) return "text-red-300";
  return "text-zinc-300";
}

function segmentTone(segment: Segment | undefined) {
  if (!segment) return "bg-zinc-900";
  if (segment.Status >= 2048) return "bg-purple-400";
  if (segment.Status > 0) return "bg-green-400";
  return "bg-zinc-700";
}

type Badge = {
  label: string;
  title: string;
  tone: keyof typeof BADGE_TONE;
};

const BADGE_TONE = {
  amber: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  blue: "border-sky-400/40 bg-sky-400/10 text-sky-300",
  green: "border-green-400/40 bg-green-400/10 text-green-300",
  purple: "border-purple-400/40 bg-purple-400/10 text-purple-300",
  red: "border-red-400/50 bg-red-500/10 text-red-300",
  zinc: "border-zinc-700 bg-zinc-900 text-zinc-400",
} as const;

function statusBadges(timing: TimingDataDriver | undefined, drsOpen: boolean): Badge[] {
  const badges: Badge[] = [];

  if (timing?.Retired) badges.push({ label: "RET", title: "Retired", tone: "red" });
  if (timing?.Stopped) badges.push({ label: "STOP", title: "Stopped on track", tone: "red" });
  if (timing?.InPit) badges.push({ label: "PIT", title: "In pit lane", tone: "amber" });
  if (timing?.PitOut) badges.push({ label: "OUT", title: "Pit out", tone: "blue" });
  if (drsOpen) badges.push({ label: "DRS", title: "DRS open", tone: "green" });
  if (timing?.LastLapTime?.OverallFastest) {
    badges.push({ label: "FL", title: "Fastest lap", tone: "purple" });
  } else if (timing?.LastLapTime?.PersonalFastest) {
    badges.push({ label: "PB", title: "Personal best last lap", tone: "green" });
  }
  if (timing?.KnockedOut) badges.push({ label: "KO", title: "Knocked out", tone: "zinc" });
  if (timing?.Cutoff) badges.push({ label: "CUT", title: "Below cutoff", tone: "zinc" });

  return badges;
}
