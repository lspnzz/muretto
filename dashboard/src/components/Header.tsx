"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useUpcomingRace } from "@/hooks/useUpcomingRace";
import { TRACK_STATUS_COLOR } from "@/lib/trackStatus";
import { useDataStore } from "@/stores/useDataStore";
import type { SessionInfo } from "@/types/SessionInfo";
import type { UpcomingRace } from "@/types/UpcomingRace";
import { DelayControl } from "./DelayControl";

export function Header() {
  const state = useDataStore((s) => s.state);
  const connected = useDataStore((s) => s.connected);
  const { race } = useUpcomingRace();
  const pathname = usePathname();

  const session = state.SessionInfo;
  const lap = state.LapCount;
  const trackStatus = state.TrackStatus?.Status ?? "";
  const statusColor = TRACK_STATUS_COLOR[trackStatus] ?? "bg-zinc-600";
  const headerSession = sessionHeader(session, race);

  return (
    <header className="flex flex-wrap items-start gap-x-5 gap-y-3 border-b border-zinc-800 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex shrink-0 items-center gap-2">
            <span className={`inline-block h-3 w-3 rounded-full ${statusColor}`} aria-hidden />
            <span className="text-lg font-semibold">muretto</span>
          </div>

          {headerSession && (
            <div className="flex min-w-0 items-baseline gap-2 text-sm">
              <span className="truncate font-medium text-zinc-300">{headerSession.title}</span>
              {headerSession.detail && (
                <span className="shrink-0 font-mono text-xs uppercase tracking-wide text-zinc-500">
                  {headerSession.detail}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span
            className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`}
            aria-hidden
          />
          <span className="text-zinc-400">{connected ? "online" : "offline"}</span>
        </div>
      </div>

      <nav className="hidden items-center gap-3 pt-1 text-sm sm:flex" aria-label="Dashboard views">
        <Link className={navLinkClass(pathname === "/")} href="/">
          Live
        </Link>
        <Link className={navLinkClass(pathname === "/strategy")} href="/strategy">
          Strategy
        </Link>
      </nav>

      {lap && lap.TotalLaps > 0 && (
        <div className="text-sm tabular-nums text-zinc-400 sm:pt-1">
          Lap {lap.CurrentLap}/{lap.TotalLaps}
        </div>
      )}

      <SettingsMenu />
    </header>
  );
}

function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-controls="header-settings-menu"
        aria-expanded={open}
        aria-label={open ? "Close settings" : "Open settings"}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-800 text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="flex h-4 w-4 flex-col justify-between" aria-hidden>
          <span className="h-0.5 rounded-full bg-current" />
          <span className="h-0.5 rounded-full bg-current" />
          <span className="h-0.5 rounded-full bg-current" />
        </span>
      </button>

      {open && (
        <div
          id="header-settings-menu"
          className="absolute right-0 top-11 z-50 w-[calc(100vw-2rem)] max-w-sm rounded-md border border-zinc-800 bg-zinc-950 p-3 shadow-xl shadow-black/40 sm:w-80"
        >
          <DelayControl />
        </div>
      )}
    </div>
  );
}

function navLinkClass(active: boolean) {
  return [
    "underline-offset-4 transition-colors hover:text-zinc-100",
    active ? "text-zinc-100 underline decoration-zinc-500" : "text-zinc-500",
  ].join(" ");
}

function sessionHeader(session: SessionInfo | null | undefined, race: UpcomingRace | undefined) {
  const liveSession = session;

  if (liveSession) {
    const liveTitle = liveSession.Meeting?.Name?.trim();

    if (liveTitle) {
      return {
        title: liveTitle,
        detail: sessionCode(liveSession.Name || liveSession.Type),
      };
    }
  }

  if (!race) return null;

  const nextSession =
    race.sessions.find((item) => new Date(item.iso).getTime() >= Date.now()) ??
    race.sessions.at(-1);

  return {
    title: race.raceName,
    detail: sessionCode(nextSession?.name ?? "Race"),
  };
}

function sessionCode(name: string | undefined) {
  const normalized = name?.trim();
  if (!normalized) return "";

  const lower = normalized.toLowerCase();
  const practice = lower.match(/(?:free\s+)?practice\s*(\d)/);
  const qualifying = lower.match(/qualifying\s*(\d)/);

  if (practice) return `FP${practice[1]}`;
  if (lower === "fp1" || lower === "fp2" || lower === "fp3") return lower.toUpperCase();
  if (lower.includes("sprint qualifying") || lower.includes("sprint shootout")) return "SQ";
  if (lower === "sprint") return "Sprint";
  if (qualifying) return `Q${qualifying[1]}`;
  if (lower === "q1" || lower === "q2" || lower === "q3") return lower.toUpperCase();
  if (lower.includes("qualifying")) return "Q";
  if (lower.includes("race")) return "Race";

  return normalized;
}
