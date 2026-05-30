> **Status:** approved 2026-05-30, implemented. This is the *initial* plan as approved —
> kept for the rationale ("why"). For the as-built state see the [README](../../README.md).
> Known deltas from this plan: Next.js **15** (not 16); the workspace splits the merge logic
> into `muretto-merge` (trait) + `merge-derive` (proc-macro) rather than a single sub-crate;
> ts-rs output is routed via `TS_RS_EXPORT_DIR` (in `.cargo/config.toml`) instead of per-type
> `export_to`; telemetry channels stay numeric on the wire with the dashboard naming them via a
> helper (rather than a serde serialize-rename); and the **SVG track map / weather panels are
> not yet built** (they need real `Position` data + an external circuit-geometry API).

# muretto — a typed, self-hostable F1 live-timing dashboard

## Context

`muretto` is a fresh rebuild (empty repo) of the F1 live-timing dashboard concept from
[slowlydev/f1-dash](https://github.com/slowlydev/f1-dash), applying the architectural
changes from the prior review and simplifying the serving infrastructure for self-hosting.

The original works well but has three structural weaknesses we're deliberately fixing:

1. **Untyped backend.** The realtime service carries F1 data as `serde_json::Value` end-to-end
   and never uses Rust's type system — paying Rust's cost without its payoff. The frontend
   re-declares all types by hand (360 lines of TS) which drifts from the backend.
2. **Over-built service split.** Two Rust services (`realtime` + `api`); the `api` service is
   one cached iCal endpoint. The schedule feature isn't core to live timing.
3. **Heavy ops.** k8s manifests, multi-replica deploys with in-memory state (inconsistent
   across replicas), debug logging in prod — far more than a self-hosted hobby app needs.

**Decisions locked with the user:**
- Backend: **typed Rust** — deserialize the feed into real structs, generate TS types from them.
- Frontend: **fresh rebuild** of the Next.js dashboard (keep the good ideas, none of the old code).
- Schedule service (iCal): **dropped entirely** — not core to live timing.
- Hosting: **dockerize everything as portable plain images**, deploy to **Railway** first, but
  with zero Railway-specific APIs so it ports to a VM / Render / Fly / Cloud Run unchanged.
- **Cost-awareness is a requirement** — see the Hosting & Cost section.

**Outcome:** one typed Rust realtime service + one Next.js dashboard, type-safe across the
boundary via codegen, tested where it matters (merge/decompress), deployable with
`docker compose up` locally and on Railway, portable anywhere.

---

## Architecture

```
F1 SignalR feed (livetiming.formula1.com)
        │  persistent ws, ~17 topics, initial snapshot + partial updates
        ▼
┌─────────────────────────────────────────┐
│ realtime (Rust, single binary)           │
│  signalr ── ingest ── model(State) ── sse│
│  Arc<RwLock<State>>  +  broadcast<Update> │
└─────────────────────────────────────────┘
        │  SSE: one "initial" event (full typed State) then "update" deltas
        ▼
┌─────────────────────────────────────────┐
│ dashboard (Next.js 16 / React 19)        │
│  EventSource → buffer(+delay) → Zustand   │
│  types/ ← generated from Rust by ts-rs    │
└─────────────────────────────────────────┘
```

No database. No schedule service. State lives in memory in one process (correct for a single
always-on instance; we explicitly do **not** run multiple replicas of the realtime service).

---

## Backend: typed Rust realtime service

### Crate layout (one binary crate + one proc-macro sub-crate — not a 5-crate workspace)

```
Cargo.toml                     # workspace: realtime + merge-derive
merte-derive/  (proc-macro)    # #[derive(Merge)] — generates BEHAVIOR, not parallel types
realtime/
  src/
    main.rs                    # spawn ingest task, build axum router, graceful shutdown
    config.rs                  # endpoint URLs, topic list, env (ADDRESS, ORIGIN, RUST_LOG, F1_DEV_URL)
    signalr/                   # hand-rolled SignalR 1.5 client (negotiate → ws connect → subscribe → loop)
    ingest/
      mod.rs                   # boundary: raw msg → decompress → normalize → State::apply → broadcast
      decompress.rs            # base64 + flate2::DeflateDecoder for *.z  (NOT ZlibDecoder)
    model/
      state.rs                 # the canonical typed State tree (also the ts-rs export source)
      driver.rs timing.rs car_data.rs position.rs weather.rs session.rs race_control.rs
      merge.rs                 # Merge trait + leaf impls + hand-written keyed-collection merges
      de.rs                    # deserializer accepting array-OR-index-keyed-object for INITIAL
    server/
      sse.rs broadcast.rs      # axum SSE handler + tokio::broadcast wiring
    bindings.rs                # #[cfg(test)] ts-rs export test
  tests/fixtures/              # real captured INITIAL + PARTIAL frames for golden tests
```

### Core design (the part that makes "typed Rust" actually work)

- **Typed canonical `State`, partials merged as `Value` via a `Merge` trait.** We never build a
  parallel `Partial<T>` type tree. The INITIAL snapshot deserializes into typed `State`; each
  PARTIAL arrives as `serde_json::Value` and is folded in field-by-field by `Merge`.
  - `#[derive(Merge)]` handles ~80% of structs (dispatches each present object key to its field).
  - Keyed collections (`DriverList`, `TimingData.Lines`, `CarData`, `Position`) get **hand-written**
    `Merge` for add / deep-update / remove semantics.
- **Arrays-as-objects → `IndexMap<String, T>`** (insertion-ordered so the leaderboard is stable).
  Merge: present+non-null & new key = insert; present & existing = recurse; present+`null` = remove.
  A custom deserializer (`model/de.rs`) normalizes both array and index-keyed-object INITIAL shapes.
- **Decompress at the ingest boundary.** `CarData.z`/`Position.z` are base64'd raw **DEFLATE**
  (use `flate2::read::DeflateDecoder`, not `ZlibDecoder` — classic gotcha). Decompress, re-key
  (`CarData.z`→`CarData`), then feed the same merge pipeline. Nothing downstream sees `.z`.
- **Name the telemetry channels exactly once.** `CarData` channels `0/2/3/4/5/45` →
  `rpm/speed/gear/throttle/brake/drs` via `#[serde(rename="0")]` (wire) + `#[ts(rename="rpm")]`
  (frontend). This is the single highest-value typing decision — kills the magic-number tribal knowledge.
- **Pragmatism guard (don't over-type):** keep loose `Value`-tailed types for the SignalR envelope,
  `RaceControlMessages`/`TeamRadio`/`StatusSeries` (ragged append-logs), and the broadcast delta
  payload (`Update { topic, patch: Value }`). No `deny_unknown_fields` on inbound types — F1 adds
  fields mid-season and ingest must survive it. Strictness lives only on the outbound/exported types.
- **Lifecycle:** `Arc<RwLock<State>>` + `tokio::broadcast::Sender<Arc<Update>>`. Ingest task owns the
  ws connection, supervised with auto-restart on disconnect + new-session detection (as the original).
  SSE handler: on connect, send full `State` as `initial`, then stream `update` deltas.
  **Graceful shutdown** via `tokio_util::CancellationToken` + axum `with_graceful_shutdown`
  (the original lacked this — rollouts cut streams abruptly).
- **Robustness fixes carried in from the review:** bump the broadcast buffer well above the
  original's 16, and on subscriber `Lagged` send a fresh full snapshot instead of silently dropping.

### Rust → TypeScript codegen: `ts-rs`

- `#[derive(TS)]` + `#[ts(export, export_to = "../dashboard/src/types/")]` on every outbound type.
- Export runs as a `cargo test`, so codegen is part of the test suite.
- **Anti-drift CI gate:** `cargo test && git diff --exit-code dashboard/src/types/` — stale bindings = red build.
- PascalCase end-to-end (matches the feed), except the renamed channel fields. The dashboard imports
  `from "@/types"`; **no hand-written TS state types exist.**

### Tests (highest-value surface)

- `decompress`: round-trip, real captured `.z` golden fixture, malformed input → `Err` not panic.
- `merge`: scalar replace; nested partial leaves siblings untouched; keyed add/update/remove; `Option`
  clear-on-null; array-or-object INITIAL equivalence; and a **golden INITIAL→PARTIAL-sequence**
  integration test against real captured frames.
- `bindings`: the export test + the CI diff gate.

---

## Frontend: Next.js dashboard (fresh rebuild)

Keep the genuinely good ideas from the original, drop the rest:

- **Stack:** Next.js 16 (App Router) / React 19 / Zustand / Tailwind 4 — same modern baseline.
- **Transport:** `EventSource` to `/api/realtime` (SSE) — correct unidirectional choice. Docs will
  say SSE, not "websocket" (the original's docs were wrong).
- **Keep:** the time-indexed buffer + user-tunable replay **delay** (the cleverest part of the
  original), pako decompression on the client *only if* we keep `.z` on the wire — but since the
  backend now decompresses at ingest, **the client no longer needs pako**; it receives plain typed JSON.
  This is a simplification win: delete client-side inflate, named channels arrive ready to render.
- **Types:** import generated `@/types/*` from ts-rs. Delete the 360-line hand-written type file concept.
- **Components:** leaderboard, track map (SVG), driver rows, race control, weather — rebuilt against
  the typed store. Add the error/loading states the original left as TODOs.
- **Tests:** unit-test the client buffer/merge/delay logic (the other untested-but-critical pure
  functions) with Vitest.
- **Schedule pages removed** (service dropped). Map/weather external APIs (multiviewer, rainviewer)
  optional — can be added later; not required for core live timing.

---

## Hosting, deployment & cost

### Portable Docker, Railway first

- **Two images, plain Dockerfiles, zero platform APIs:**
  - `realtime`: multi-stage `rust:alpine` build → tiny static musl binary on a scratch/alpine runtime.
  - `dashboard`: `node:alpine` deps → Next.js standalone build → `node server.js` runtime.
- **`compose.yaml`** at the repo root runs both + optional **Caddy** (auto-TLS reverse proxy) — this
  is *both* the local-dev story (`docker compose up`) *and* the drop-in for any VM. Railway reads the
  same Dockerfiles. Because nothing uses Railway primitives, porting = run the same compose elsewhere.
- **Config via env only** (`ADDRESS`, `ORIGIN`, `NEXT_PUBLIC_LIVE_URL`, `RUST_LOG`) so it moves cleanly.
- **No k8s, no manifests, no multi-replica.** One realtime instance (required — in-memory state),
  one (or more, stateless) dashboard instances.

### Cost awareness (verify current numbers before committing — platform pricing shifts)

What actually costs money here:

| Item | Driver | Rough cost |
|---|---|---|
| **realtime container** (always-on) | tiny: ~64–128 MB RAM, near-idle CPU between updates | low — a few $/mo of usage |
| **dashboard container** (always-on) | Next.js standalone, ~256–512 MB RAM | the larger of the two |
| **Egress / bandwidth** ⚠️ | SSE streams continuously to **every** viewer for the whole session; scales with viewers × session-hours × data rate | **the variable to watch** |
| Database | none | **$0** |
| F1 data feed | public livetiming feed | **$0** |
| Domain | annual | ~$10–15/yr |

- **Railway:** Hobby plan ~$5/mo including ~$5 usage credit; compute billed by RAM+CPU-minutes, egress
  billed per GB. Two always-on services + SSE egress means a live race weekend with many viewers is the
  cost spike — **bandwidth, not compute, is the risk.** Expect roughly low-double-digit $/mo at hobby
  scale, more if it gets popular. (Confirm Railway's current per-GB egress and per-GB-min rates.)
- **Portability hedge (recommended to keep in back pocket):** a flat-rate small VM (e.g. Hetzner
  CX22 ~€4/mo, or a $6 DigitalOcean droplet) running the same compose has **predictable flat cost
  regardless of viewer count** — which de-risks the egress variable entirely. Same images, no rewrite.
- **Optional split:** dashboard on Vercel Hobby (free, Next.js-native) + realtime container on
  Railway/VM. Cheapest if hobby-use terms fit, but two places to manage.

We'll ship portable images so any of these is a config change, not a rebuild.

---

## CI/CD (the original had none worth the name)

A `.github/workflows/ci.yml` PR-validation workflow:
- Rust: `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test`.
- **Bindings drift gate:** `git diff --exit-code dashboard/src/types/` after tests.
- Frontend: `eslint`, `tsc --noEmit`, `vitest`, `next build`.
- Docker: build both images (cache via `type=gha`); push on tag/main only.

---

## Milestones (suggested build order)

1. **Repo scaffold** — workspace, both Dockerfiles, `compose.yaml` + Caddy, CI skeleton, READMEs.
2. **SignalR client + ingest boundary** — connect, subscribe, decompress; prove raw frames flow
   (record a fixture session for tests while we're here).
3. **Typed model + Merge + ts-rs** — `State` tree, `Merge` trait/derive, keyed-collection merges,
   codegen wired, the merge/decompress unit + golden tests. **This is the core/riskiest milestone.**
4. **SSE server + graceful shutdown** — broadcast, initial+delta protocol, lag-recovery snapshot.
5. **Dashboard** — EventSource client, buffer+delay, Zustand store off generated types, leaderboard
   + track map + driver rows + race control, error/loading states, Vitest on the client buffer.
6. **Deploy** — push images, stand up on Railway, point a domain, smoke-test a live session;
   document the VM-compose fallback.

## Verification

- **Unit/integration:** `cargo test` (merge, decompress, golden INITIAL→PARTIAL, bindings export);
  `vitest` (client buffer/delay).
- **Local end-to-end without a live race:** port the original's record/replay idea — a small
  `simulator` mode (or a checked-in fixture replay server) serves recorded frames so the full stack
  can be driven any day. Run `docker compose up`, open the dashboard, confirm leaderboard + telemetry
  render and the delay slider rewinds.
- **Live:** during a session, confirm SSE `initial` then `update` deltas, multiple browser tabs stay
  consistent, and a forced reconnect re-syncs cleanly.
- **Drift:** change a Rust struct, run `cargo test`, confirm the TS bindings regenerate and the CI
  diff gate would catch a stale commit.
- **Portability:** confirm the same images run via `docker compose up` on a plain VM, not just Railway.
