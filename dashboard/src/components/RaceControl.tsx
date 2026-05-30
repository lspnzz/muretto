"use client";

import { useDataStore } from "@/stores/useDataStore";
import type { Message } from "@/types";

export function RaceControl() {
  const messages = useDataStore((s) => s.state.RaceControlMessages?.Messages);
  const list: Message[] = messages
    ? Object.values(messages).filter((m): m is Message => Boolean(m))
    : [];
  const recent = list.slice(-15).reverse();

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <h2 className="border-b border-zinc-900 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500">
        Race control
      </h2>
      {recent.length === 0 ? (
        <div className="px-3 py-2 text-sm text-zinc-600">No messages yet.</div>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3 pt-2">
          {recent.map((msg, i) => (
            <li key={`${msg.Utc}-${i}`} className="text-sm text-zinc-300">
              <span className="mr-2 font-mono text-xs text-zinc-600">
                {msg.Utc?.slice(11, 19)}
              </span>
              {msg.Message}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
