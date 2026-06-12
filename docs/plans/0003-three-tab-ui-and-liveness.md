> **Status:** approved 2026-06-12, implemented 2026-06-12. See as-built deltas
> at the end.

# 0003 — Three-tab UI, pit-wall circle of doom, and feed liveness

## Context

The dashboard grew organically into one page (leaderboard + sidebar) plus a
`/strategy` page with a decorative radial layout. Three problems:

1. **No information architecture.** Next-race data, live timing, and strategy
   tooling are interleaved; mobile has a private tab system duplicating routes.
2. **The strategy wheel is not the real thing.** It spaces drivers evenly
   around a circle — pretty, but it carries no gap information. The pit-wall
   tool it should replicate (the McLaren "circle of doom", 2001, still on F1
   pit walls in 2025) maps **time gaps** onto a ring: one full turn = one lap
   of the reference car, so pit-loss windows and rejoin traffic are readable
   at a glance.
3. **Stale data shows as live.** Between sessions the F1 feed answers
   subscribe with the *last* session's snapshot. The service holds it (state
   is only reset when a *new* `SessionInfo.Name` streams in —
   `realtime/src/ingest/mod.rs`) and serves it to every client; the dashboard
   renders whatever exists. Deployed result: last weekend's leaderboard
   presented as current.

## Decision

### Tabs (dashboard)

Three routes sharing one persistent shell (`Header` + tab nav + one SSE
connection mounted in the root layout):

| Route | Tab | Contents |
| ----- | --- | -------- |
| `/` | **Overview** | The *only* tab with next-race data: next race card + countdown + weekend session times (`/api/schedule/next`), track conditions (live `WeatherData` when live, else `/api/weather/race` forecast), track status, session info, track map when live. |
| `/strategy` | **Strategy** | Circle of doom (below), tyre stints, race-control feed, team radios (when the feed provides captures). |
| `/timings` | **Timings** | f1-dash-style timing page: session/clock strip, track-status pill + lap count, full leaderboard (tag, DRS/PIT, tyre, info, gap, lap time, sectors + mini segments). |

`MobileRaceTabs` is deleted; the tab nav works at all widths.

### Circle of doom

Faithful to the pit-wall tool (sources and the full spec digest:
[docs/references/strategy-screens.md](../references/strategy-screens.md)):

- **Geometry**: the ring is the time domain — equal arc = equal gap; one turn
  = one reference lap. We pin the **leader at 12 o'clock** (reference-anchored
  variant) instead of anchoring the start/finish line, which would need lap-
  start UTC tracking from the ragged `SessionData` topic; all strategic
  content (windows, traffic) is preserved. Angle: `deg = −360·gapMs/refLapMs`
  (direction of travel clockwise; cars behind trail counter-clockwise).
- **Gaps**: `GapToLeader` when parseable; lapped cars (`"1 L"`) reconstructed
  by the interval chain `gap_i = gap_{i−1} + interval_i`, drawn wrapped and
  dimmed. Reference lap = leader's last lap, falling back to best lap, then
  90 s.
- **Markers**: team-colour ticks crossing a grey annulus on black; TLA labels
  outside; leader emphasised; selected car magenta (the original's own-car
  colour); in-pit cars flagged.
- **Pit stop ghosts**: for the selected car, a cyan ghost marker at
  `gap + pitLoss` and a window arc spanning `[pitLoss−1 s, pitLoss+2 s]`,
  with green-flag and VSC pit-loss values (per-circuit presets, editable) and
  the active scenario auto-picked from `TrackStatus`. Centre panel shows the
  predicted rejoin positions for both scenarios.
- Math lives in `dashboard/src/lib/circleOfDoom.ts`, unit-tested (gap parsing,
  interval chain, angles, rejoin insertion).

### Timings tab

Re-implemented from a **spec of facts** (column grid, colour semantics,
segment status codes 2048/2049/2051/2064, DRS channel-45 thresholds) — *not*
from f1-dash source: f1-dash is AGPL-3.0 and muretto is not, so no code or
JSX is copied. Ragged `TimingStats` (fastest-lap holder, best sectors) is read
through defensive accessors and stays loose JSON (core belief 8).

### Liveness (the stale-data fix)

Two layers:

1. **Realtime** stamps `State.last_feed_event_ms` (epoch ms, synthetic — not
   a feed topic) every time a *streamed* frame is applied, except
   `Heartbeat` (it proves the socket, not the session). Deliberately **not**
   stamped when seeding from the subscribe snapshot: a snapshot is history,
   only streaming frames prove the feed is alive. The field rides full
   snapshots only (per-topic deltas are untouched → no egress cost, core
   belief 6).
2. **Dashboard** derives `liveness ∈ {live, ended, stale, none}` in
   `lib/liveness.ts` from: `SessionStatus` (`Finished|Finalised|Ends` ⇒
   ended), freshness (`max(client last-update receipt, LastFeedEventMs)`
   within 2 min ⇒ data flowing), and `SessionInfo` presence. Strategy and
   Timings gate their live widgets on it and otherwise show an explicit
   "no live session" state pointing at the Overview tab; the header shows
   LIVE / session-ended / no-session / offline truthfully.

Replay keeps working unchanged: the simulator streams frames, so freshness
holds and the fixture session renders live — invariant 7 stays intact.

### Fixture

`simulator/fixtures/sample.jsonl` grows from 2 to ~5 drivers and gains
`SessionStatus`, `ExtrapolatedClock`, full `TimingData` lines (sectors,
segments, last/best laps, intervals), `TimingAppData` stints, `TimingStats`,
`TeamRadio` captures and more race-control traffic, so all three tabs render
offline. Smoke assertions (SessionInfo/DriverList/TrackStatus + SSE
initial/update) are unchanged.

## Consequences

- `State` gains one synthetic field; TS bindings regenerate (CI drift gate
  re-anchors).
- AGENTS.md fixture note updates (five drivers, not two).
- New reference doc `docs/references/strategy-screens.md` so the next agent
  doesn't re-research the pit-wall spec.
- The old `StrategyWheel`/`MobileRaceTabs` components are removed.

## As-built deltas

- `last_feed_event_ms` is `Option<i64>` with `#[ts(type = "number | null")]`
  so the client compares plain numbers (ts-rs would otherwise widen 64-bit
  ints).
- Timings tab omits f1-dash's optional car-metrics column — it is off by
  default upstream, so the default looks match (DRS still reads CarData
  channel 45). Favourite-driver / quali-danger row highlights are also
  omitted (no settings store), and the no-data case is covered by the
  liveness placeholder rather than skeleton rows.
- Circle of doom: leader-anchored as planned, which also means **no
  sector-split lines or start/finish mark** — both are track-fixed and have
  no stable angle when the leader is pinned. TLA labels render horizontal
  (not tangent-rotated); in-pit cars move to an inner ring; pit-window arcs
  render only for the selected car, both scenarios at once with the inactive
  one dimmed. Pit-loss presets key on `Circuit.ShortName` (lowercase
  contains-match), 21 s / 15 s fallback.
- Ended-session grace: `SessionStatus` ended **and** data younger than 3 h ⇒
  "ended" (final state stays visible, badged); older ⇒ "stale" (hidden).
  Pure freshness gating would have yanked results at the chequered flag.
- Fixture adds VER/NOR/ALO with timing-only data (no `CarData.z`/`Position.z`
  entries for them — hand-crafting deflate blobs isn't worth it; telemetry
  cells render blank for those rows, which the components must tolerate
  anyway).
- `WeatherPanel`/`RaceControl`/`LeaderBoard`/`DriverRow`/
  `UpcomingRacePlaceholder` were absorbed into the new tab components, not
  kept alongside them.
