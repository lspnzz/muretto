> **Status:** approved 2026-06-12, implemented 2026-06-12, **removed
> 2026-06-28**. As-built deltas at the end.

# 0005 — Driver tab: car telemetry, sector breakdown, focused track map

## Context

Three tabs exist (Overview, Strategy, Timings); none answers "how is *this*
driver doing right now". A data investigation (2026-06-12, online against
FastF1 master, f1-dash, and community channel references) pinned down what a
per-driver view can honestly show:

- `CarData` still carries only channels `0/2/3/4/5/45` (RPM, speed, gear,
  throttle, brake, DRS). FastF1's parser notes *"drs is no longer included
  in 2026"* — channel 45 is dead weight, with no replacement.
- **No public energy data.** Battery SOC / MGU-K deployment live only in
  FIA/team telemetry; third-party "energy dashboards" *model* SOC from the
  public throttle/brake/speed channels. We don't fake gauges we can't feed.
- Race Control publishes track-wide **`OVERTAKE ENABLED` / `OVERTAKE
  DISABLED`** and **`STRAIGHT MODE - NORMAL GRIP / LOW GRIP / DISABLED`**
  messages (2026 regs; observed in pre-season testing, community-documented,
  still experimental). These ride `RaceControlMessages`, already subscribed.

## Decision

- **Fourth tab `/driver`** ("Driver" in the header nav, now a 4-column grid
  on mobile). Same liveness gating as Timings.
- **One driver selected at a time**: a position-ordered chip strip
  (`DriverSelector`); default is the leader, selection survives re-renders
  and falls back to the leader if the driver disappears (session change).
- **Left panel — telemetry** (`TelemetryPanel`): gear / speed / RPM
  readouts, throttle and brake bars, and a rolling trace (speed line over
  throttle/brake strips) accumulated client-side from `CarData` batches —
  Utc-deduped ring buffer, reset on driver switch or delay rewind
  (`lib/telemetry.ts`, pure + unit-tested). An overtake / straight-mode
  badge parsed from `RaceControlMessages` (`lib/raceControl.ts`, tested)
  renders **only when such a message exists** — no misleading "off" default
  for an experimental signal. No DRS anywhere; no invented energy gauges.
- **Right panel — sector-by-sector + map** (`SectorBreakdown`): gap /
  interval / lap counts, last + best lap, one block per sector (value,
  personal/overall-best colouring, session-best from `TimingStats`, segment
  dots at detail size), speed traps I1/I2/FL/ST, current stint line.
  `TrackMap` below gains an optional `highlight` prop — selected car keeps
  its dot + label, the rest dim and drop labels; Timings' no-prop usage
  renders exactly as before.
- **Colour semantics unchanged** (violet overall / emerald personal / amber
  set — docs/references/strategy-screens.md); segment status→class mapping
  is exported from `SectorsCell` rather than duplicated.
- **Model fix found en route:** `Speeds` serialized `Fl`/`St`, but the wire
  sends `FL`/`ST` — speed traps could never populate. Explicit serde renames
  added; types regenerated (the only Rust change).
- **Fixture enrichment** (offline verifiability, belief 7): `CarData` now
  covers all five drivers with values that vary frame to frame (extra feed
  frames so the gauge animates through the replay loop; snapshot keeps HAM
  speed 280 — pinned by `decompress.rs`); snapshot `TimingData` lines gain
  `Speeds`; an `OVERTAKE ENABLED` race-control message (appended after the
  flag sequence, index 13) exercises the badge. run-stack SKILL.md and
  f1-feed.md frame counts updated.

## Consequences

- `CarData` has a dashboard consumer again (plan 0004 removed the unused
  `telemetry()` accessor; this tab adds `lib/telemetry.ts` in its place).
- Egress unchanged: the service already streamed every topic this tab reads.
- The overtake badge depends on message strings not yet seen in a points
  session; if FOM words them differently, `lib/raceControl.ts` is the one
  place to adjust.

## As-built deltas

- The telemetry panel reads its displayed sample from the **trace tail**
  (falling back to `latestSample` on first paint) so a driver absent from a
  single batch keeps the last reading instead of flashing the empty state.
- The fixture-replay test (`realtime/tests/merge.rs`) pinned the old final
  CarData values; its assertions were updated for the enriched recording and
  strengthened: last batch carries all five cars, `Speeds.st` proves the
  `"ST"` wire key, and the `OVERTAKE ENABLED` message is asserted.
- `docs/references/f1-feed.md`'s stale fixture description (2 drivers,
  6 lines) was refreshed alongside the SKILL.md frame count.
- Post-review (2026-06-12): the first telemetry cut (readout boxes +
  horizontal pedal bars) read as disconnected widgets. Replaced with a
  broadcast-style **halo gauge** — throttle climbs the left band, brake the
  right, a thin outer arc tracks speed along a 0–360 scale, speed/RPM
  centred, gear in the bottom gap — in muretto's palette (emerald/red/zinc)
  rather than the F1 app's blue. A third pass fixed the instrument's
  hierarchy after checking the original design (and the f1-dash / community
  recreations): in the F1 app widget the **thick band is the speedometer** —
  its tip reads against the 0–360 numerals — so the gauge now sweeps speed
  along the band (zinc) with the pedals demoted to slim inner arcs
  (throttle left/emerald, brake right/red) under their curved captions;
  polish round: squared arc ends, numerals given more clearance.
  A second review pass dropped the rolling
  trace sparkline entirely (frameless shapes were unreadable at that size;
  the gauge is the instrument) — the sample buffer survives only to hold the
  last reading across a batch that skips the driver — and the telemetry
  panel now stretches to the right column's height with the gauge centred.
- Verified offline end-to-end: cargo fmt/test/clippy (rust:1 container),
  dashboard lint/typecheck/vitest/build (node:22 container), then the
  compose stack in a browser — selection switch (HAM→LEC) moves telemetry,
  sector panel, and map highlight together; the trace shows LEC's
  lift-and-brake event; OT badge and FL/ST traps populate; mobile stacks
  selector → telemetry → timing → map.
- **Removed 2026-06-28.** The `/driver` route and `components/driver/`
  (`DriverTab`, `DriverSelector`, `TelemetryPanel`, `SectorBreakdown`) are
  gone; the header nav is back to two tabs (Overview, Pit wall). Feature-only
  modules `lib/telemetry.ts` and `lib/raceControl.ts` (overtake/straight-mode
  badges) and their tests were deleted with it. `TrackMap` lost its
  `highlight` prop (it had no other caller); the `SectorsCell` semantics
  helpers and `orderedStints`, once exported for this tab, are internal again.
