"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useLiveness } from "@/hooks/useLiveness";
import { showsLiveData, type Liveness } from "@/lib/liveness";
import { useDataStore } from "@/stores/useDataStore";
import { DelayControl } from "./DelayControl";

const TABS = [
  { href: "/", label: "Overview" },
  { href: "/pitwall", label: "Pit wall" },
  { href: "/driver", label: "Driver" },
] as const;

export function Header() {
  const state = useDataStore((s) => s.state);
  const connected = useDataStore((s) => s.connected);
  const liveness = useLiveness();
  const pathname = usePathname();

  const session = state.SessionInfo;
  const lap = state.LapCount;
  const showLive = showsLiveData(liveness);
  const title = showLive ? session?.Meeting?.Name?.trim() : undefined;
  const detail = showLive ? sessionCode(session?.Name || session?.Type) : "";

  return (
    <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-zinc-800 px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="text-lg font-semibold">muretto</span>
        <StatusBadge connected={connected} liveness={liveness} />
        {title && (
          <div className="hidden min-w-0 items-baseline gap-2 text-sm md:flex">
            <span className="truncate font-medium text-zinc-300">{title}</span>
            {detail && (
              <span className="shrink-0 font-mono text-xs uppercase tracking-wide text-zinc-500">
                {detail}
              </span>
            )}
          </div>
        )}
      </div>

      <nav className="order-last w-full sm:order-none sm:ml-auto sm:w-auto" aria-label="Dashboard views">
        <div className="grid grid-cols-3 gap-1 rounded-md border border-zinc-800 bg-zinc-950 p-1 sm:flex">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "rounded-sm px-3 py-1.5 text-center text-sm transition-colors",
                  active
                    ? "bg-zinc-100 font-medium text-zinc-950"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200",
                ].join(" ")}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {showLive && lap && lap.TotalLaps > 0 && (
        <div className="text-sm tabular-nums text-zinc-400">
          Lap {lap.CurrentLap}/{lap.TotalLaps}
        </div>
      )}

      <SettingsMenu />
    </header>
  );
}

function StatusBadge({ connected, liveness }: { connected: boolean; liveness: Liveness }) {
  const badge = !connected
    ? { dot: "bg-red-500", text: "offline" }
    : liveness === "live"
      ? { dot: "bg-green-500", text: "LIVE" }
      : liveness === "ended"
        ? { dot: "bg-zinc-500", text: "session ended" }
        : liveness === "stale"
          ? { dot: "bg-amber-400", text: "no live session" }
          : { dot: "bg-zinc-600", text: "no session" };

  return (
    <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
      <span className={`inline-block h-2 w-2 rounded-full ${badge.dot}`} aria-hidden />
      {badge.text}
    </span>
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
    <div ref={menuRef} className="relative ml-auto sm:ml-0">
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
