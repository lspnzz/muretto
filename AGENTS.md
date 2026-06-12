# muretto — agent map

The [README](README.md) tells the human story (architecture, deploy, cost).
This file is the table of contents for *working* in the repo: link, don't
copy. If you change how something works, update the doc this file points to.

## What this is

Real-time Formula 1 timing. One Rust service holds a persistent connection to
F1's SignalR feed, folds partial updates into a typed `State`, and streams
deltas to browsers over SSE; a Next.js dashboard renders it using TypeScript
types **generated from the Rust model**. No database; state lives in memory.

## Repo map

| Path | What it is |
| ---- | ---------- |
| `realtime/` | the service: SignalR client → ingest → typed `State` → SSE |
| `muretto-merge/` | `Merge` trait — folds deep-partial JSON into typed values |
| `merge-derive/` | `#[derive(Merge)]` proc-macro |
| `simulator/` | record/replay tool — develop with no live race |
| `dashboard/` | Next.js UI; `src/types/` is **generated, never edited** |
| `docs/` | knowledge base — [index](docs/README.md) |
| `scripts/` | `smoke.sh` (offline e2e), `checks.sh` (hygiene gates), `record.sh` (capture a live session) |
| `.github/workflows/` | CI, docs gates, weekly link maintenance |

## Commands

```bash
cargo test --workspace        # tests + regenerates dashboard/src/types
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all
(cd dashboard && npm run lint && npm run typecheck && npm test && npm run build)
./scripts/smoke.sh            # offline end-to-end: replay → realtime → SSE
./scripts/checks.sh           # the doc/size gates CI runs
```

Full stack with the UI, offline: [.claude/skills/run-stack/SKILL.md](.claude/skills/run-stack/SKILL.md).

## Invariants

One line each — the *why* lives in [core-beliefs](docs/design/core-beliefs.md):

1. Dashboard types are generated; never hand-edit `dashboard/src/types/`.
2. All feed folding goes through `Merge`, never hand-rolled object spreads.
3. `.z` topics are raw DEFLATE — `DeflateDecoder`, never `ZlibDecoder`.
4. Exactly one always-on realtime instance; never scale replicas.
5. Plain portable Docker images; zero platform-specific APIs.
6. Egress is the cost variable: deltas on the wire, never repeated snapshots.
7. Every change must be verifiable offline via the simulator.
8. Ragged topics stay `serde_json::Value` on purpose — don't "finish" them.
9. Source files ≤ 600 lines; this file ≤ 120. Both CI-enforced.

## Docs

- [docs/README.md](docs/README.md) — index and conventions
- [docs/design/core-beliefs.md](docs/design/core-beliefs.md) — the invariants, with why
- [docs/references/f1-feed.md](docs/references/f1-feed.md) — feed protocols, frame shapes, the deflate gotcha
- [docs/references/multiviewer-circuits.md](docs/references/multiviewer-circuits.md) — track-map geometry API
- [docs/references/strategy-screens.md](docs/references/strategy-screens.md) — circle of doom + timing-page conventions
- [docs/plans/](docs/plans/) — `NNNN-slug.md` with status header and as-built deltas

Multi-session work starts with a plan; landing cold in `realtime/` starts with
the reference docs.

## Gates that fail your PR

- `cargo fmt --check`; `clippy -D warnings`, which includes the `ZlibDecoder`
  ban (clippy.toml) and `unwrap_used` — **warn locally, denied in CI**.
- Bindings drift: CI reruns the ts-rs export and fails if
  `dashboard/src/types` is dirty — commit the regenerated files.
- Dashboard: `eslint --max-warnings=0`, `tsc --noEmit`, vitest, `next build`.
- Docs: lychee relative-link check; `checks.sh` size gates (see invariant 9).
- `smoke.sh`: the offline stack must boot and stream.

## Verifying a change

- **Model / `State`** → `cargo test --workspace`, commit the regenerated types.
- **Ingest / signalr / server** → `./scripts/smoke.sh`.
- **UI** → run the full stack (run-stack skill); the fixture renders a
  five-driver race (HAM, LEC, VER, NOR, ALO) across all three tabs.
- **Docs** → `./scripts/checks.sh`; CI also link-checks.
