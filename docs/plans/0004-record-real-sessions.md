> **Status:** approved 2026-06-12, implemented 2026-06-12 (tooling; the first
> real capture happens at the next live session — runbook and follow-ups
> below).

# 0004 — Record real sessions for replay and tests

## Context

Everything in this repo is verified offline against recorded data (belief 7),
but the only checked-in recording is `simulator/fixtures/sample.jsonl` — a
synthetic five-driver session. The recorder existed
(`simulator save <file>`) but was built for a supervised capture: one socket
drop, one half-open wifi path, or one `docker stop` and the recording ends
silently, mid-session, with a truncated tail. It also blended sessions: left
running across a weekend it would append qualifying onto practice in one
file, which the replay path (and ingest's sessions-never-blend rule) can't
represent.

Goal: capture the next live session unattended, end-to-end, so that we can
(1) replay it through the real stack and (2) keep a slice of it as a pinned
test fixture.

## What was built

- **Recorder hardening** (`simulator/src/save.rs`): reconnect with retry on
  drop/error and after 90s of silence; on reconnect the fresh snapshot is
  appended as one synthetic legacy feed frame (full per-topic state,
  `SessionInfo` excluded so a replay doesn't loop) — recordings stay
  gap-tolerant. A `SessionInfo` update carrying a `Name` — ingest's own
  new-session rule, via the now-public `signalr::parse_feed` — rotates to a
  numbered sibling file (`x.data.2.jsonl`). SIGINT/SIGTERM flush before exit
  so Ctrl-C and `docker stop` keep the tail.
- **`simulator trim <in> <out> <frames>`**: snapshot + first N lines → a
  small fixture suitable for committing. Head slices only, by design.
- **`scripts/record.sh [name]`** → `recordings/<name>.data.jsonl`
  (gitignored): cargo when available, otherwise the simulator Docker image
  (rustls + webpki roots, so the plain Alpine image dials TLS fine).
- **Fixture auto-pinning**: `every_checked_in_fixture_replays_cleanly` in
  `realtime/tests/merge.rs` decodes and folds every `simulator/fixtures/*.jsonl`
  through `State::apply` — both wire shapes — so a new fixture is covered the
  moment it lands.
- Docs: the recording section of
  [references/f1-feed.md](../references/f1-feed.md) is the canonical how-to.

## Race-day runbook

1. Any time before the session: `./scripts/record.sh <gp-name>` (≈10–30 min
   early is plenty; pre-session frames are cheap and the recorder rotates
   when the real session is announced).
2. Leave it running. Reconnects, rotation, and flush-on-signal are automatic;
   `count` log lines every 100 frames confirm liveness.
3. After the session: Ctrl-C (or `docker stop`). Expect one `.data.jsonl`
   file per session that ran while recording.
4. Sanity-check the capture offline: `./scripts/smoke.sh recordings/<file>`
   (in Docker if no local toolchain — see the run-stack skill).

## Keeping it for tests

**Decision (2026-06-12): one-time capture, fixture-as-artifact.** There is no
recording archive and no external storage — nothing to bloat. The raw capture
is a plain local file, O(100MB+) per race, gitignored (`recordings/`,
`*.data.*`), and **disposable**: once a head slice is trimmed and committed,
delete it. The committed fixture in git is the single durable artifact.

```bash
cargo run -p simulator -- trim recordings/<gp>.data.jsonl \
  simulator/fixtures/<gp>-head.jsonl 300
rm recordings/<gp>.data.jsonl   # the fixture is the artifact
```

The fixture sweep test pins it automatically; keep slices small (sub-MB) so
the repo stays light.

## Follow-ups after the first real recording

- [ ] Trim and commit the first real-session fixture; eyeball size.
- [ ] Add a few value-level assertions for it in `realtime/tests/merge.rs`
      (driver count, a known lap time) alongside the generic sweep.
- [ ] Delete the raw capture. If a future need for full-race replays or
      mid-session slices appears (the latter needs state folding to
      synthesize snapshots), that's a new plan — not a storage system bolted
      onto this one.

## As-built deltas

None yet — this section gets honest after the first real weekend capture.
