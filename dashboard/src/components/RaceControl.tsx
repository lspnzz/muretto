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
    <aside className="w-80 shrink-0 border-l border-zinc-800">
      <h2 className="px-3 py-2 text-xs uppercase tracking-wide text-zinc-500">Race control</h2>
      {recent.length === 0 ? (
        <div className="px-3 py-2 text-sm text-zinc-600">No messages yet.</div>
      ) : (
        <ul className="space-y-1 px-3 pb-3">
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
    </aside>
  );
}
