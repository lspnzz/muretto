> **Status:** approved 2026-06-12, implemented 2026-06-12. As-built deltas at
> the end.

# 0004 — Timings tab restyle: pit-wall layout, F1-app driver cells, no DRS

## Context

The Timings tab landed in plan
[0003](0003-three-tab-ui-and-liveness.md) as a faithful f1-dash replica:
full-width loose grid, team-coloured driver pills, a DRS box per row, track
map bolted on the right at 2xl. Three problems:

1. **It reads as a different app.** Overview and Strategy share a container
   width (`max-w-6xl`/`7xl`), bordered panels, and uppercase section
   headers; Timings had none of that grammar.
2. **DRS is dead.** 2026 cars carry no DRS, and the feed offers no
   replacement signal — `CarData` channels remain `0/2/3/4/5/45` (RPM,
   speed, gear, throttle, brake, DRS) with nothing for energy deployment or
   manual-override mode. The box burned a column on a constant.
3. **The map was an afterthought.** Pit-wall software (Paceteq OneTiming)
   treats the track map as a first-class tile composed alongside the timing
   tables; ours hid below/right of the tower and only at 2xl.

## Decision

- **Shared design language**: `max-w-7xl` container, `rounded-lg border
  border-zinc-800` panels, `text-xs uppercase tracking-wide` section
  headers — the grammar of the other two tabs.
- **Track map left, leaderboard right** at `xl`; the map panel is sticky so
  it stays in view while scrolling a 20-car tower. On smaller widths the
  leaderboard leads (DOM order) and the map follows (`xl:order-first`).
- **Drop the DRS column outright**; no energy/override column exists to
  replace it (see Context). The grid-delta/status info column goes too —
  pit state moves into the gap column, cyan per the pit-lane convention.
- **Driver cell restyled after the broadcast world-feed tower**: white
  position number (leader's on the F1-red `#e10600` box), TLA in team
  colour — replacing the f1-dash coloured pill.
- **No session strip above the panels.** The leaderboard panel's title line
  carries the session name, running clock, and track-status dot; meeting
  name and lap counter already live in the app header, weather on Overview.
- **Tighter grid** (`6.5rem 4.25rem 4.75rem 5.25rem auto`), monospace
  timing figures, FOM-style thin rules between rows (no zebra), smaller
  sector mini-segments. Colour semantics (violet/emerald/amber, segment
  status codes) unchanged.

## Consequences

- `lib/selectors.ts` loses the now-unused `telemetry()` accessor. `CarData`
  stays in `State`: the wire shape is a feed fact, not a UI choice, and the
  service still folds it.
- `docs/references/strategy-screens.md` gains a muretto-deltas note so the
  f1-dash fact sheet stays honest about where the tab now diverges.
- `TrackMap` owns its panel chrome (border/header) instead of borrowing a
  wrapper from the tab, since the Timings tab is its only consumer.

## As-built deltas

- The first cut kept a session strip (clock, weather gauges, glowing
  track-status pill), an info column (grid delta + status word), and styled
  the driver cell after the F1 *app* row (white position chip + colour
  bar + white TLA). Review against a trackside photo of the broadcast
  tower replaced all three: broadcast driver cell, no strip, no info
  column — that is the Decision above.
- The racing number (team-coloured italic, kept at first per the original
  ask) was dropped in final review — rows now match the broadcast tower
  exactly.
- Verified offline against the replay fixture (five-driver leaderboard;
  map dots for HAM/LEC only, as the fixture carries no `Position.z` for
  the rest).
