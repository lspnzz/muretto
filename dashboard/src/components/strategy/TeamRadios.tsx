"use client";

import { teamRadioCaptures } from "@/lib/ragged";
import { useDataStore } from "@/stores/useDataStore";

const AUDIO_BASE = "https://livetiming.formula1.com/static/";
const SHOWN = 12;

/** Latest team-radio captures, playable from the F1 live-timing CDN. */
export function TeamRadios() {
  const state = useDataStore((s) => s.state);
  const drivers = state.DriverList ?? {};
  const sessionPath = state.SessionInfo?.Path ?? "";
  const captures = teamRadioCaptures(state.TeamRadio).slice(-SHOWN).reverse();

  return (
    <section className="rounded-lg border border-zinc-800 p-4">
      <h2 className="mb-3 text-xs uppercase tracking-wide text-zinc-500">Team radio</h2>
      {captures.length === 0 ? (
        <div className="text-sm text-zinc-600">No team radio captures yet.</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {captures.map((capture) => {
            const driver = drivers[capture.racingNumber];
            const colour = driver?.TeamColour ? `#${driver.TeamColour}` : "#71717a";
            return (
              <li key={`${capture.utc}-${capture.path}`} className="flex items-center gap-2">
                <span className="w-16 shrink-0 font-mono text-xs text-zinc-600">
                  {capture.utc.slice(11, 19)}
                </span>
                <span
                  className="w-10 shrink-0 text-center font-mono text-xs font-bold text-zinc-950"
                  style={{ backgroundColor: colour, borderRadius: 4 }}
                >
                  {driver?.Tla || capture.racingNumber}
                </span>
                <audio
                  controls
                  preload="none"
                  className="h-8 min-w-0 flex-1"
                  src={`${AUDIO_BASE}${sessionPath}${capture.path}`}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
