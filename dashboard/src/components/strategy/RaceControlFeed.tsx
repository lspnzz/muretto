"use client";

import { useDataStore } from "@/stores/useDataStore";
import type { Message } from "@/types";

const SHOWN = 20;

const FLAG_DOT: Record<string, string> = {
  GREEN: "bg-emerald-500",
  YELLOW: "bg-amber-400",
  "DOUBLE YELLOW": "bg-amber-400",
  RED: "bg-red-500",
  BLUE: "bg-blue-500",
  "BLACK AND WHITE": "bg-zinc-200",
  CHEQUERED: "bg-zinc-200",
};

export function RaceControlFeed({ fill = false }: { fill?: boolean }) {
  const messages = useDataStore((s) => s.state.RaceControlMessages?.Messages);
  const list: Message[] = messages
    ? Object.values(messages).filter((m): m is Message => Boolean(m))
    : [];
  const recent = list.slice(-SHOWN).reverse();

  return (
    <section
      className={`rounded-lg border border-zinc-800 p-4 ${fill ? "xl:flex xl:h-full xl:min-h-0 xl:flex-col" : ""}`}
    >
      <h2 className="mb-3 text-xs uppercase tracking-wide text-zinc-500">Race control</h2>
      {recent.length === 0 ? (
        <div className="text-sm text-zinc-600">No race-control messages.</div>
      ) : (
        <ul className={`flex flex-col gap-2 ${fill ? "xl:min-h-0 xl:flex-1 xl:overflow-y-auto" : ""}`}>
          {recent.map((msg, i) => {
            const dot = msg.Flag && msg.Flag !== "CLEAR" ? FLAG_DOT[msg.Flag] : undefined;
            return (
              <li key={`${msg.Utc}-${i}`} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 w-16 shrink-0 font-mono text-xs text-zinc-600">
                  {msg.Utc?.slice(11, 19)}
                </span>
                {msg.Lap != null && (
                  <span className="mt-0.5 shrink-0 font-mono text-xs text-zinc-700">
                    L{msg.Lap}
                  </span>
                )}
                <span className="min-w-0 text-zinc-300">
                  {dot && (
                    <span
                      className={`mr-1.5 inline-block h-2 w-2 rounded-full align-baseline ${dot}`}
                      aria-hidden
                    />
                  )}
                  {msg.Message}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
