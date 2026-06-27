> **Status:** approved 2026-06-27, implemented 2026-06-27. As-built deltas at
> the end.

# 0007 — Merge Strategy + Timings into one "Pit wall" tab

## Context

The dashboard had four tabs (Overview, Strategy, Timings, Driver). Strategy and
Timings answered the same question from two screens: Strategy held the circle of
doom plus the tyre/race-control/radio rail; Timings held the track map and the
full leaderboard. During a race you watch both at once — the track map and ring
inform the call, the tower and feeds are the evidence — and tab-switching loses
the glance. The pieces also overlap (both lean on `Position`, `TimingData`,
`TrackStatus`), so one screen is the honest shape.

## Decision

- **One tab `/pitwall`** ("Pit wall" in the header nav, now a 3-column grid on
  mobile). Same liveness gating as before (`showsLiveData` → `NoLiveSession`,
  `SessionEndedBanner` when ended).
- **Broadcast-wall layout** (`components/pitwall/PitWallTab.tsx`):
  - **Main column** — top row pairs the track map (wide strip) and the circle of
    doom; the timing tower sits below them.
  - **Right rail** — tyre stints, race control, team radio, as on the old
    Strategy aside.
- **Fit-to-viewport on wide screens (`xl`)**: the whole tab fills the viewport
  (`xl:h-full`, resolved against the `flex-1 overflow-y-auto` `<main>` in the
  layout). The top row is height-bounded (`xl:h-[clamp(15rem,40vh,27rem)]`) and
  the track map / ring **letterbox to fit** that height instead of scrolling.
  The timing tower (`xl:flex-1`) and the right rail (`xl:overflow-y-auto`) take
  the remaining space and scroll their own overflow. Narrow screens (`< xl`)
  stack everything into one scrolling column — the previous behaviour.
- **Old URLs redirect.** `/strategy` and `/timings` `redirect("/pitwall")` so
  bookmarks and the existing smoke/verify flows keep working.

## Components

- New: `pitwall/PitWallTab.tsx`, `app/pitwall/page.tsx`.
- Reused unchanged in role: `TrackMap`, `CircleOfDoom`, `TyreStints`,
  `RaceControlFeed`, `TeamRadios`, `TimingTower` — no logic moved, only layout.
- `TrackMap` and `CircleOfDoom` gain an opt-in `fit` prop that swaps their
  fixed SVG sizing for height-filling, letterboxed SVG **only at `xl`**. Default
  off, so the Driver tab's `TrackMap` is untouched.
- `TimingTower` now fills its cell (`flex min-h-0 flex-col xl:h-full`), scrolls
  its rows (`overflow-auto xl:flex-1`), and pins the column header
  (`sticky top-0 bg-black`) so it survives the scroll.
- `RaceControlFeed` drops its internal `max-h-80` scroll — the rail owns the
  scroll now, so the feed flows within it.
- Removed: `strategy/StrategyTab.tsx`, `timings/TimingsTab.tsx` (the merged tab
  composes their children directly).

## Verification

- `(cd dashboard && npm run lint && npm run typecheck && npm test && npm run build)`.
- Offline stack (run-stack skill): the five-driver fixture (HAM, LEC, VER, NOR,
  ALO) renders the merged wall — map + ring fixed, tower + rail scrolling — and
  `/strategy` and `/timings` land on it.

## As-built deltas

- **Track map**: thicker outline (1.5 → 2) and perpendicular ticks at the two
  timing-sector boundaries — anchored on the same even 3-split the
  fastest-sector overlay uses, so ticks mark where the coloured segments begin.
- **Fastest-lap tyre**: the timing tower's best-lap cell is prefixed with a
  compound dot + tyre age for the lap the best time was set on. Needed a new
  `Stint.start_laps` field (Rust model + regenerated types) and
  `lib/fastestLap.ts`, which maps the best-lap lap number (ragged
  `TimingStats.PersonalBestLapTime.Lap`) onto the stint via laps actually run
  (`TotalLaps − StartLaps`). The offline fixture was enriched to carry both.
