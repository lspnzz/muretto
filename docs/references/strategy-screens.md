# Pit-wall strategy screens — circle of doom and timing-page conventions

Reference for the Strategy and Timings tabs (plan
[0003](../plans/0003-three-tab-ui-and-liveness.md)). Everything here is a
*fact sheet* distilled from public sources — implement from it, don't copy
code (f1-dash is AGPL-3.0; muretto is not).

## Circle of doom

Invented 2001 by McLaren's race-strategy analyst as the "McLaren Track
Viewer"; essentially the same screen was visible on McLaren's pit wall at Spa
2025 and is shown by Sky Germany as the "Circle of Doom". Commercial pit-wall
software (Paceteq OneTiming) ships the same display. Name origin: "if a car
is in your pit-stop delta, you are doomed to be passed by them when you pit."

Sources:
- Inventor's account + 2001/2025 screenshots:
  <https://www.reddit.com/r/F1Technical/comments/1mh8gsm/i_designed_an_f1_strategy_display_in_2001_theyre/>
- Paceteq OneTiming manual: <https://support.paceteq.com/onetiming/circle-of-doom>
- Open-source prior art: UF1 Circle-of-Doom
  (<https://github.com/MRAJEKO/UF1-Viewer-with-F1MV/pull/33>),
  mateenunez/f1-telemetry `CircleOfDoom.tsx`, datadr1ven/mtvmvp,
  mpapenbr/iracelog.

### Geometry (time domain, not spatial)

- The ring represents **one lap in time**: equal arc = equal gap, using one
  reference lap time `L` (ms). Direction of travel is clockwise; a car `g` ms
  behind sits `360·g/L` degrees counter-clockwise of the car ahead.
- Two anchoring conventions: track-anchored (start/finish fixed at 12
  o'clock, field rotates — the original; needs lap-start UTC) and
  **reference-anchored** (leader pinned at 12 o'clock — what muretto renders;
  stable and derivable from `TimingData` alone).
- Lapped cars wrap (`mod 360`) — visually correct on-track position. Their
  unwrapped gap is rebuilt via the interval chain
  `gap_i = gap_{i−1} + interval_i` because the feed reports `GapToLeader`
  as `"1 L"` for them.

### Look (from the 2001/2025 screenshots)

Pure black background; one thick light-grey annulus; small **team-colour
ticks** crossing the band (bunched ticks = traffic, that crowding *is* the
information); white TLA labels just outside; selected/own car **magenta**;
**cyan blobs** = pit-exit ghosts; short coloured arc on the band = pit
window; green radial lines = sector splits; centre shows lap counter / clock
in plain white text.

### Pit-loss model

- Ghost marker at `gap + pitLoss`; window arc spans `[pitLoss−1 s,
  pitLoss+2 s]` (asymmetric uncertainty).
- Two scenarios: green-flag and VSC/SC loss; the displayed scenario follows
  `TrackStatus` (4 = SC, 6/7 = VSC). Rejoin prediction = insertion index of
  the ghost gap into the sorted gap list ("Out: P5–P6").
- Per-track pit-lane loss seconds (green / VSC), from formula1.com strategy
  guides via the UF1 implementation — defaults **21 / 15** when unknown:

  Bahrain 22.5/15 · Jeddah 20/11 · Melbourne 19.5/13.5 · Baku 20.5/11 ·
  Miami 17/9 · Imola 26.5/16.5 · Monaco 19.5/12 · Barcelona 22/12.5 ·
  Montreal 18.5/9.5 · Spielberg 20.5/8.5 · Silverstone 20/9 ·
  Hungaroring 19.7/14 · Spa 18.5/11 · Zandvoort 18/12 · Monza 24/17 ·
  Singapore 28.5/15 · Suzuka 22.5/10 · Losail 26.5/15.5 · Austin 20/14 ·
  Mexico City 22/15 · Interlagos 21/11 · Yas Marina 22/15

## Timing-page conventions (f1-dash-style)

Functional facts from the f1-dash look muretto's Timings tab started from
(<https://github.com/slowlydev/f1-dash>, AGPL — facts only, no code). Where
muretto now deliberately diverges, see the deltas at the end of this section
and plan [0004](../plans/0004-timings-tab-restyle.md):

- **Leaderboard grid**, one row per `TimingData.Lines` entry sorted by
  numeric `Position`:
  `5.5rem (tag) · 3.5rem (DRS) · 5.5rem (tyre) · 4rem (info) · 5rem (gap) ·
  5.5rem (lap time) · auto (sectors)`.
- **Driver tag**: team-coloured pill, big position number, white chip with
  the TLA in team colour. `TeamColour` is hex without `#`.
- **DRS box** doubles as PIT indicator: off `zinc-700`, eligible `zinc-400`
  (CarData channel 45 = 8), open `emerald-500` (channel 45 > 9), PIT
  `cyan-500`. Channels: 0 RPM, 2 speed km/h, 3 gear, 4 throttle, 5 brake.
- **Colour semantics**: overall fastest `violet`, personal best `emerald`,
  set-but-not-best `amber`/`yellow`, no value `zinc-500`, pit-lane segment
  `blue`. Segment `Status` codes: 0 unset, 2048 yellow, 2049 personal best,
  2051 overall best, 2052 treat as yellow, 2064 pit lane.
- **Gap column**: interval to car ahead on top (`emerald` while `Catching`),
  gap to leader below; both arrive preformatted (`"+1.234"`, `"1 L"`).
  Qualifying uses `Stats[SessionPart−1].TimeDiffToFastest` /
  `TimeDifftoPositionAhead` (feed typo is real).
- **Tyres**: last entry of `TimingAppData.Lines[nr].Stints` is the current
  stint; pit count = stints − 1; `New: "FALSE"` ⇒ used set (asterisk).
  Compound colours: SOFT `#F12F32`, MEDIUM `#FBCC1C`, HARD white,
  INTERMEDIATE `#128330`, WET `#1F6DA1`.
- **Track status pill** (`TrackStatus.Status`): 1 clear/emerald, 2/3/4/6/7
  amber (4 = safety car, 6/7 = VSC), 5 red.
- **Track-map flag layer**: whole-track states come from `TrackStatus`
  (SC/VSC/red tint the outline and show a badge); *where* a yellow lives only
  exists in `RaceControlMessages` — `lib/flags.ts` replays that log (`YELLOW`/
  `DOUBLE YELLOW` set a marshal sector, `CLEAR` clears it, track-scoped
  `GREEN`/`CLEAR` wipes) and paints the matching `marshalSectors` segments
  (see [multiviewer-circuits](multiviewer-circuits.md)). Double yellow
  pulses.
- **Fastest-lap holder** (row highlight + violet best lap): the driver whose
  `TimingStats.Lines[nr].PersonalBestLapTime.Position == 1` — `TimingStats`
  is a ragged topic, read it defensively.
- **Team radio**: `TeamRadio.Captures` (array in snapshots, index-keyed map
  in deltas); audio URL =
  `https://livetiming.formula1.com/static/{SessionInfo.Path}{capture.Path}`.
- `SessionStatus.Status` lifecycle: `Inactive → Started → Finished →
  Finalised → Ends` (`Aborted` = red flag, still live).

## Official timing-screen facts (FOM / F1 app)

Independently verified 2026-06 (Paceteq OneTiming
[Page 1](https://support.paceteq.com/onetiming/page-1) /
[Page 2](https://support.paceteq.com/onetiming/page-2), FOM's live-timing
web product at f1academy.com/livetiming, the
[F1 app store screenshots](https://apps.apple.com/us/app/formula-1/id835022598)):

- **FOM "Page 1" classification columns**: P · car № · name · Gap ·
  Interval · S1 S2 S3 · Best · Time (last lap) · Lap · Pit. "Page 2" is the
  chronological lap log (newest first). Trackside screens rotate pages.
- **Palette** (FOM CSS): black background, white text, purple `#6A00EB`
  overall best, green personal best, yellow set-but-slower, cyan `#38FFF5`
  highlights, grey dimmed. White = most recently completed value.
- **Texture**: thin rules between rows, *no* zebra striping; not monospace
  (Open Sans 600) — right-aligned numeric columns make the terminal look.
- **F1 app leaderboard row**: position in a white rounded chip (black
  number) → thin vertical team-colour bar → white bold TLA. Racing numbers
  do **not** appear in rows — team-coloured italic numbers are a broadcast
  graphics convention.

### Muretto deltas (2026 restyle, plan [0004](../plans/0004-timings-tab-restyle.md))

- **No DRS column.** 2026 cars have no DRS, and the feed offers no
  replacement signal — `CarData` channels remain 0/2/3/4/5/45 with nothing
  for energy deployment or the manual-override mode. No info column either:
  pit state (`InPit`/`PitOut`) rides the gap column in cyan.
- **Driver cell: position + three-letter name code**, deliberately diverging
  from both FOM screens (tower and app identify drivers by TLA): white
  position number (leader's on the F1-red `#e10600` box), then the first
  three letters of the display name in team colour. No racing number anywhere.
- **Track map spans the container above the leaderboard**, in its own
  panel; the projection letterboxes the circuit (uniform scale, centered)
  so the wide canvas never distorts it. Flag states replace the map title as
  plain coloured text, with no badge inside the SVG. No separate session
  strip: the leaderboard panel's title line carries the session name, running
  clock, and track-status dot. The panel uses FOM-style thin row rules and
  monospace timing figures, in the same panel grammar as the other tabs.
- **Timing cells are split for scan speed**: current tyre age sits inside the
  compound-coloured tyre ring, pit count has its own column, last lap and best
  lap have separate columns, and sectors show only the current sector time.
