// Time-indexed snapshot buffer powering the replay-delay feature: keep recent
// merged-state snapshots and render the one that was current `delay` ms ago.

export type Frame<T> = { t: number; snapshot: T };

/** The newest snapshot at or before `targetT` (or the oldest if none qualify). */
export function pickFrame<T>(buffer: Frame<T>[], targetT: number): T | null {
  if (buffer.length === 0) return null;
  let chosen = buffer[0];
  for (const frame of buffer) {
    if (frame.t <= targetT) chosen = frame;
    else break;
  }
  return chosen.snapshot;
}

/**
 * Drop snapshots older than the delay window, but keep the last one just past
 * the cutoff so a fully-delayed view still has a base frame to show.
 */
export function trimBuffer<T>(buffer: Frame<T>[], now: number, maxAgeMs: number): Frame<T>[] {
  const cutoff = now - maxAgeMs;
  let start = 0;
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i].t < cutoff) start = i;
    else break;
  }
  return buffer.slice(start);
}
