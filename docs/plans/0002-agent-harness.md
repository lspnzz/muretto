> **Status:** approved 2026-06-12, implemented 2026-06-12. See as-built deltas
> at the end.

# 0002 — Agent harness: docs, gates, and feedback loops

## Context

muretto is built agent-first (see [0001](0001-typed-rebuild-and-self-hosting.md))
but wasn't *configured* agent-first in the sense of OpenAI's
[harness-engineering article](https://openai.com/index/harness-engineering/):
no agent entry-point file, a one-file `docs/` tree, no custom lint guardrails
encoding known footguns, no doc-freshness enforcement, and a CI that never
actually ran the binaries.

This plan fills those gaps **right-sized for a solo two-service repo**, reusing
what already works: the ts-rs bindings drift gate, the replay simulator, and
0001's status-header convention.

## Scope — and what we deliberately skip

| Skipped (from the article) | Why |
| -------------------------- | --- |
| Doc-gardening agent fleet  | A weekly CI link-check catches rot at this scale |
| `QUALITY_SCORE.md` grades  | No team to coordinate; clippy/eslint already gate quality |
| Per-worktree observability stacks | `RUST_LOG` + the smoke script's log dump suffice |
| Agent self-merge policy    | Solo repo; PRs are already short-lived |

## Changes

1. **Knowledge base** — `docs/README.md` (index + conventions),
   `docs/design/core-beliefs.md` (invariants with *enforced-by* pointers),
   `docs/references/f1-feed.md` and `docs/references/multiviewer-circuits.md`
   (external-system references with wire shapes and code pointers). Fix the
   stale "zlib" comment in `realtime/src/config.rs` while we're at it.
2. **Agent entry point** — `AGENTS.md` (~90 lines, table-of-contents style:
   link, don't copy), `CLAUDE.md` = `@AGENTS.md`, README pointers.
3. **Lint gates** — `clippy.toml` banning `ZlibDecoder` with a teaching
   `reason`; `[workspace.lints.clippy] unwrap_used = "warn"` (deny in CI via
   the existing `-D warnings`); `scripts/checks.sh` gating AGENTS.md ≤ 120
   lines and source files ≤ 600 lines.
4. **Feedback loop** — `scripts/smoke.sh`: offline end-to-end (replay fixture →
   realtime → assert `/api/health`, `/api/current` keys, SSE `initial` +
   `update`), identical locally and in CI; `.claude/skills/run-stack/SKILL.md`
   so agents know how to drive the full stack.
5. **CI wiring** — reusable `docs-checks.yml` (hygiene gates + lychee links,
   offline on PRs); `ci.yml` gains `docs` and `smoke` jobs; `maintenance.yml`
   re-checks external links weekly.

## Decision log

| Decision | Choice |
| -------- | ------ |
| Agent entry point | `AGENTS.md` as the canonical map; `CLAUDE.md` is a one-line `@AGENTS.md` import |
| Division of labor | README = human story (deploy, cost); AGENTS.md = agent map; link, don't copy — only the core commands are duplicated, and CI backs those |
| Link checker | lychee, `--offline` on PRs (deterministic); external links weekly |
| ESLint guardrails | Skipped — hand-written type drift is already caught by ts-rs export + drift gate + tsc; a name-pattern lint would be a fake guardrail |
| File-size gate | 600 lines (largest file today is 430), generated `dashboard/src/types/` exempt |
| Task runner | Plain `scripts/*.sh`; two scripts don't justify just/make |
| unwrap policy | `unwrap_used = "warn"` + `allow-unwrap-in-tests`; warn locally, deny in CI |
| Topic list | `realtime/src/config.rs` `TOPICS` stays canonical; docs annotate semantics only |

## Verification

Green path: `cargo fmt --all --check`, `cargo clippy --workspace --all-targets
-- -D warnings`, `cargo test --workspace`, `git diff --exit-code
dashboard/src/types`, `./scripts/checks.sh`, `./scripts/smoke.sh`, lychee over
all markdown, and the dashboard suite (`lint`/`typecheck`/`test`/`build`).

Induced failures (each gate proven to bite, then reverted): swap
`DeflateDecoder` → `ZlibDecoder` (clippy ban + fixture test), add a non-test
`.unwrap()` (clippy `-D warnings`), bloat AGENTS.md past 120 lines
(`checks.sh`), break a relative doc link (lychee), run smoke against a
nonexistent fixture (fails fast, dumps logs).

## As-built deltas

- `allow-unwrap-in-tests` exempts `#[test]` functions but **not helper
  functions in integration-test files**: a helper in `realtime/tests/merge.rs`
  tripped the lint and now uses `expect` with messages — deliberate, since the
  lint stays meaningful in helpers (panicking helpers give confusing test
  failures).
- `smoke.sh` probes ports with bash's `/dev/tcp` instead of `nc` (not reliably
  present on GitHub runner images), and fails with guidance — including a
  Docker compose alternative — when `cargo` isn't on PATH (this repo's dev
  machine has no local Rust/Node toolchains; everything runs via Docker/CI).
- Two stale-comment fixes rode along: `realtime/src/config.rs` (claimed `.z`
  topics are "zlib-compressed") and `realtime/src/model/state.rs` (its
  "pragmatism guard" reference now points at the actual doc).
- Verification on the toolchain-less dev machine ran inside containers
  (`rust:1`, `node:22`, `lycheeverse/lychee`, `rhysd/actionlint`); CI runs the
  same gates natively.
