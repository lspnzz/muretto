# Core beliefs

The invariants behind muretto's design. Each entry says what we believe, why,
and how it's enforced — honestly marked **review-only** where no machine checks
it. Changing one of these is an architecture decision: write a plan
([conventions](../README.md)) rather than slipping it into a feature PR.

## 1. Typed end-to-end; frontend types are generated, never written

The Rust `State` tree is the single source of truth; the dashboard's
`src/types/` is generated from it by ts-rs. Hand-editing those files or
re-declaring feed types in TypeScript reintroduces the drift the project
exists to fix (the original f1-dash carried 360 lines of hand-copied TS).

**Enforced by:** `realtime/tests/export_bindings.rs` regenerates on every
`cargo test`; CI fails on `git diff --exit-code dashboard/src/types`.

## 2. The feed is partial-update + merge

The F1 feed sends one full snapshot, then deep partials: scalars/`Vec`s
replace, objects merge per key, `null` deletes, and keyed collections
add/update/remove per entry. All folding goes through the `Merge` trait —
never hand-rolled object spreads.

**Enforced by:** `muretto-merge` unit tests and `realtime/tests/merge.rs`;
semantics documented in [references/f1-feed.md](../references/f1-feed.md).

## 3. `.z` topics are raw DEFLATE, not zlib

`CarData.z` and `Position.z` are base64'd **raw DEFLATE** streams (no zlib
header). Reaching for `ZlibDecoder` compiles fine and fails on every frame.

**Enforced by:** `clippy.toml` bans `ZlibDecoder` with a teaching message, and
a fixture-pinned round-trip test in `realtime/src/ingest/decompress.rs`.

## 4. Exactly one always-on realtime instance

The realtime service holds the feed connection and all state in memory — no
database. Running replicas gives each its own divergent state behind a load
balancer (a structural bug in the original). Scale by hedging bandwidth, not
by adding replicas.

**Enforced by:** review-only. Stated in the README deploy notes; no platform
config here can stop someone scaling a service.

## 5. Portable images, zero platform APIs

Both services are plain Docker images. Anything Railway-specific is limited to
reading env vars (`PORT`, `RAILWAY_ENVIRONMENT_ID`); the same artifacts must
run on a VM, Render, Fly, or Cloud Run unchanged. `compose.yaml` is the
canonical deployment description.

**Enforced by:** review-only. The Docker CI job proves the images build, not
that they're portable.

## 6. Egress is the cost variable

Compute is a few dollars a month; SSE streaming to every viewer for a whole
session is the bill to watch. So: deltas on the wire (never repeated
snapshots), `skip_serializing_if` on every optional field, and think twice
before adding per-client payload.

**Enforced by:** review-only. See the README cost table.

## 7. Simulator-first: a live race is never required

Every behavior must be reproducible on a weekday via `simulator replay` +
`F1_DEV_URL`. If a change can only be verified during a session weekend, it
can't be verified.

**Enforced by:** `scripts/smoke.sh` runs the replay → realtime → SSE loop in
CI on every PR.

## 8. The pragmatism guard: ragged topics stay loose JSON

`TimingStats`, `TopThree`, `SessionData`, `TeamRadio`, and
`ChampionshipPrediction` are kept as `serde_json::Value` **on purpose**: their
shapes are inconsistent across session types, and a strict type would turn
unknown feed fields into ingest failures. Don't "finish the typing" without a
plan that owns the risk.

**Enforced by:** the field comments in `realtime/src/model/state.rs` point
here; review-only beyond that.

## 9. Legibility budgets: small files, small map

Source files stay under 600 lines and [AGENTS.md](../../AGENTS.md) stays under
120 — past those sizes, a reader (human or agent) can no longer hold the unit
in one pass. Split modules instead of growing them; move AGENTS.md detail into
`docs/`.

**Enforced by:** `scripts/checks.sh` in the CI docs job.
