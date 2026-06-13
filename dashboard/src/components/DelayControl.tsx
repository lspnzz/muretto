"use client";

import { useState } from "react";

import { sessionStartedUtcMs } from "@/lib/ragged";
import {
  clampDelay,
  delayFromSessionStart,
  delayFromTvRemaining,
  parseRemainingInput,
  parseWallClockInput,
} from "@/lib/sync";
import { useDataStore } from "@/stores/useDataStore";

type Note = { text: string; error: boolean };

/**
 * Replay-delay control, anchored to the broadcast instead of raw seconds:
 * mark the race start as it happens on TV, or type the TV's session clock,
 * and the matching delay is derived. The slider stays for fine-tuning.
 */
export function DelayControl() {
  const delayMs = useDataStore((s) => s.delayMs);
  const maxDelayMs = useDataStore((s) => s.maxDelayMs);
  const setDelayMs = useDataStore((s) => s.setDelayMs);
  const [note, setNote] = useState<Note | null>(null);

  function apply(rawDelayMs: number) {
    setDelayMs(clampDelay(rawDelayMs, maxDelayMs));
    if (rawDelayMs > maxDelayMs) {
      setNote({ error: true, text: `TV lags more than the ${maxDelayMs / 1000}s buffer — capped` });
    } else if (rawDelayMs < 0) {
      setNote({ error: true, text: "that would put the TV ahead of the feed — set to live" });
    } else {
      setNote({ error: false, text: `synced — delay ${(rawDelayMs / 1000).toFixed(1)}s` });
    }
  }

  function fail(text: string) {
    setNote({ error: true, text });
  }

  return (
    <div className="flex flex-col gap-3 text-sm text-zinc-400">
      <p className="text-[10px] uppercase tracking-wide text-zinc-600">Sync to broadcast</p>
      <RaceStartSync apply={apply} fail={fail} />
      <TvClockSync apply={apply} fail={fail} />

      <label className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1 border-t border-zinc-900 pt-3 sm:flex">
        <span>delay</span>
        <input
          type="range"
          min={0}
          max={maxDelayMs}
          step={500}
          value={delayMs}
          onChange={(e) => {
            setDelayMs(Number(e.target.value));
            setNote(null);
          }}
          className="order-last col-span-2 w-full min-w-0 accent-zinc-300 sm:order-none sm:col-span-1 sm:flex-1"
        />
        <span className="w-12 justify-self-end text-right tabular-nums text-zinc-300">
          {(delayMs / 1000).toFixed(1)}s
        </span>
      </label>

      {note && (
        <p aria-live="polite" className={`text-xs ${note.error ? "text-amber-400" : "text-emerald-400"}`}>
          {note.text}
        </p>
      )}
    </div>
  );
}

type SyncRowProps = { apply: (rawDelayMs: number) => void; fail: (text: string) => void };

/**
 * Race-day anchor: the feed flips `SessionStatus` to "Started" at lights out
 * (verified against the 2024 livetiming archive), so "lights out on my TV at
 * T" pins the delay to `T − feed start`. Falls back to the start recorded in
 * `SessionData` when the flip predates this browser session.
 */
function RaceStartSync({ apply, fail }: SyncRowProps) {
  const sessionStartedAt = useDataStore((s) => s.sessionStartedAt);
  const sessionData = useDataStore((s) => s.state.SessionData);
  const [text, setText] = useState("");

  function applyTvStart(tvStartMs: number) {
    const startedAt = sessionStartedAt?.at ?? sessionStartedUtcMs(sessionData);
    if (startedAt === null) return fail("no session start in the feed yet");
    apply(delayFromSessionStart(startedAt, tvStartMs));
  }

  return (
    <form
      className="flex flex-col gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        const tvStart = parseWallClockInput(text, Date.now());
        if (tvStart === null) return fail("race start time looks off — use 15:03:07");
        applyTvStart(tvStart);
      }}
    >
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0">race start</span>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="15:03:07"
          aria-label="Race start time as shown on your TV"
          className="w-full min-w-0 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 font-mono text-xs tabular-nums text-zinc-200 placeholder:text-zinc-700"
        />
        <SyncButton type="submit" label="set" />
        <SyncButton
          label="now"
          onClick={() => {
            const now = Date.now();
            setText(new Date(now).toTimeString().slice(0, 8));
            applyTvStart(now);
          }}
        />
      </div>
      <p className="text-[11px] text-zinc-600">press “now” at lights out on your TV</p>
    </form>
  );
}

/** Timed-session anchor: the TV clock trails live by exactly the delay. */
function TvClockSync({ apply, fail }: SyncRowProps) {
  const liveClock = useDataStore((s) => s.liveClock);
  const [text, setText] = useState("");

  return (
    <form
      className="flex flex-col gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        const tvRemaining = parseRemainingInput(text);
        if (tvRemaining === null) return fail("time left looks off — use 12:34 or 1:02:03");
        const raw = delayFromTvRemaining(liveClock, tvRemaining, Date.now());
        if (raw === null) return fail("session clock isn’t running right now");
        apply(raw);
      }}
    >
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0">time left</span>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="12:34"
          aria-label="Session time left as shown on your TV"
          className="w-full min-w-0 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 font-mono text-xs tabular-nums text-zinc-200 placeholder:text-zinc-700"
        />
        <SyncButton type="submit" label="set" />
      </div>
      <p className="text-[11px] text-zinc-600">the session clock shown on TV, at this moment</p>
    </form>
  );
}

function SyncButton({
  label,
  type = "button",
  onClick,
}: {
  label: string;
  type?: "button" | "submit";
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className="shrink-0 rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
    >
      {label}
    </button>
  );
}
