# muretto

Real-time Formula 1 timing & telemetry. A typed, self-hostable rebuild inspired by
[f1-dash](https://github.com/slowlydev/f1-dash) — same idea, different engineering choices:
the backend is **typed end-to-end** and the frontend types are **generated from it**, so the
two can't drift; ops is a single always-on container, not Kubernetes.

> Unofficial and not associated with Formula 1. F1, FORMULA 1 and related marks are trade
> marks of Formula One Licensing B.V.

## Architecture

```
F1 SignalR feed ──► realtime (Rust)                       ──► dashboard (Next.js)
                    signalr → ingest → State → SSE             EventSource → buffer(+delay) → UI
                    Arc<RwLock<State>> + broadcast             types/ generated from Rust (ts-rs)
```

- **realtime** (Rust): holds one persistent connection to F1's SignalR feed, decompresses
  telemetry, folds partial updates into a single typed `State`, and fans deltas out to every
  browser over Server-Sent Events. In-memory; no database.
- **dashboard** (Next.js): consumes the SSE stream, buffers it with a tunable replay delay,
  renders the leaderboard / track map / telemetry. Imports TypeScript types **generated from
  the Rust model** — change a struct and the frontend types regenerate (CI fails on drift).
  The track map uses MultiViewer's public circuit geometry API and overlays live `Position`
  coordinates from the F1 feed when F1 provides that topic.
- **simulator**: records a live session and replays it over WebSocket, so you can develop
  any day of the week with no live race.

There is intentionally **no schedule service** and **no Kubernetes** — see the design notes.

## Workspace

| Crate / dir        | What it is                                                        |
| ------------------ | ----------------------------------------------------------------- |
| `realtime/`        | the service (signalr client, ingest, typed model, SSE server)     |
| `muretto-merge/`   | the `Merge` trait + leaf impls (folds JSON partials into typed values) |
| `merge-derive/`    | `#[derive(Merge)]` proc-macro                                      |
| `simulator/`       | record / replay tool for offline dev                              |
| `dashboard/`       | Next.js frontend (types under `dashboard/src/types` are generated) |

## Docs

[AGENTS.md](AGENTS.md) is the working map of the repo (commands, invariants, gates) — for
agents and humans alike. The knowledge base under [docs/](docs/README.md) holds the design
beliefs, external-system references (F1 feed wire format, MultiViewer API), and numbered
plans with their decision logs.

## Develop

Prerequisites: Rust (stable) and Node 20+.

```bash
# Backend tests (also regenerates the TypeScript bindings)
cargo test --workspace

# Run the stack offline against a recorded session:
cargo run -p simulator -- replay simulator/fixtures/sample.jsonl     # terminal 1
F1_DEV_URL=ws://localhost:8000/ws ADDRESS=127.0.0.1:4000 \
  cargo run -p realtime                                              # terminal 2
curl -N http://127.0.0.1:4000/api/realtime                          # see the SSE stream

# Capture the next live session for later replay/debugging:
./scripts/record-next-session.sh
./scripts/smoke.sh simulator/recordings/live-YYYYMMDDTHHMMSSZ.jsonl

# Or the whole thing in Docker (offline):
F1_DEV_URL=ws://replay:8000/ws docker compose --profile dev up
```

Against the live feed, drop `F1_DEV_URL` (only works during a session weekend).

### Endpoints (realtime)

| Path             | Purpose                                  |
| ---------------- | ---------------------------------------- |
| `/api/realtime`  | SSE: `initial` snapshot then `update` deltas |
| `/api/current`   | current full state as JSON               |
| `/api/health`    | liveness                                 |

### Config (env)

`ADDRESS` (full bind address override), `PORT` (binds `0.0.0.0:$PORT` locally and
`[::]:$PORT` on Railway when `ADDRESS` is unset; default port 80), `ORIGIN`
(`;`-separated CORS origins), `RUST_LOG`, `F1_DEV_URL`
(replay endpoint), and on the dashboard `REALTIME_URL`.

## Deploy

Everything is a plain Docker image with **no platform-specific APIs**, so the same artifacts
run on Railway, a VM, Render, Fly, or Cloud Run.

- **Railway (first target):** create two services from this repo.
  - `realtime`: keep the service root at `/` and use the root `railway.toml`. It selects
    `realtime/Dockerfile`, watches only the Rust/shared backend paths, and healthchecks
    `/api/health`.
  - `dashboard`: set the service root directory to `/dashboard` and set the config path to
    `/dashboard/railway.toml`. It uses `dashboard/Dockerfile`, watches `/dashboard/**`, and
    healthchecks `/`.
  - Set `REALTIME_URL` on the dashboard to the realtime service URL. This can be Railway's
    private service URL or the realtime public HTTPS URL; it is read at runtime by the dashboard
    server, not baked into the browser bundle. Set `ORIGIN` on `realtime` to the dashboard HTTPS
    URL if you also expose realtime directly to browsers with strict CORS.
  - The realtime service must be a **single always-on instance** (it holds the feed connection and
    in-memory state — do **not** scale it to multiple replicas).
- **Any VM:** `docker compose --profile tls up -d` with `DOMAIN`/`EMAIL` set — Caddy fetches
  TLS automatically and reverse-proxies the dashboard and the SSE API.

### Cost awareness

No database and no paid data feed, so the cost is just compute + bandwidth:

| Item                       | Driver                                                        | Rough cost |
| -------------------------- | ------------------------------------------------------------- | ---------- |
| realtime container         | tiny (~64–128 MB RAM, near-idle CPU), always on               | a few $/mo |
| dashboard container        | Next.js standalone (~256–512 MB RAM), always on               | the larger of the two |
| **egress / bandwidth** ⚠️  | SSE streams continuously to **every** viewer for a whole session | **the variable to watch** |
| database / data feed       | none                                                          | $0         |
| domain                     | annual                                                        | ~$10–15/yr |

- On **Railway** (usage-based: RAM+CPU-minutes + per-GB egress) expect roughly low-double-digit
  $/mo at hobby scale; a popular race weekend spikes **bandwidth**, not compute. Verify Railway's
  current per-GB egress rate before committing.
- A **flat-rate VM** (e.g. Hetzner CX22 ~€4/mo, or a $6 droplet) running the same compose has
  **predictable cost regardless of viewers** — the simplest hedge against the egress variable.

## CI

`cargo fmt`/`clippy`/`test`, a **bindings-drift gate** (`git diff` on the generated types after
tests), frontend lint/typecheck/test/build, Docker builds for both images, an **offline
end-to-end smoke test** (`scripts/smoke.sh`: replay fixture → realtime → SSE assertions), and
**docs gates** (`scripts/checks.sh` size limits + lychee relative-link check). A weekly
scheduled job re-checks external links.
