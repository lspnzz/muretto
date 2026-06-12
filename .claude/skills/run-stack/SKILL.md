---
name: run-stack
description: Launch the full muretto stack offline (replay simulator + realtime + dashboard) and verify changes end-to-end against recorded F1 data. Use when asked to run the app, verify realtime/SSE behavior, or check a dashboard change — no live race needed.
---

# Run the muretto stack (offline — no live race needed)

## Fast check, no UI

```bash
./scripts/smoke.sh   # builds, boots replay + realtime, asserts health/current/SSE
```

## Full stack with the dashboard (needs Rust + Node)

```bash
cargo run -p simulator -- replay simulator/fixtures/sample.jsonl   # 1: ws on :8000
F1_DEV_URL=ws://localhost:8000/ws ADDRESS=127.0.0.1:4000 \
  cargo run -p realtime                                            # 2: API on :4000
cd dashboard && npm run dev                                        # 3: UI on :3000
```

`REALTIME_URL` already defaults to `http://localhost:4000` in the dashboard's
proxy route, so step 3 needs no env. Open http://localhost:3000.

## No Rust/Node on this machine? Docker variant

```bash
F1_DEV_URL=ws://replay:8000/ws docker compose --profile dev up --build
# realtime on host :4000, dashboard on host :3000
```

## What healthy looks like

- `curl http://127.0.0.1:4000/api/health` → `{"ok":true}`
- `curl http://127.0.0.1:4000/api/current` → PascalCase `State` JSON with
  `SessionInfo`, `DriverList`, `TrackStatus`
- `curl -N http://127.0.0.1:4000/api/realtime` → `event: initial` immediately,
  then `event: update` at ~10 Hz
- Dashboard shows a two-driver leaderboard (HAM, LEC). The fixture is 6 frames;
  replay closes at EOF and realtime reconnects ~2s later, so it loops forever.

## Gotchas

- Replay binds `0.0.0.0:8000`, hardcoded — free that port first (`smoke.sh`
  checks and tells you).
- `simulator/fixtures/sample.jsonl` is tiny and synthetic. Record a real
  session (live weekends only): `cargo run -p simulator -- save <file>`.
- The browser consumes SSE via the dashboard's own proxy route
  (`/api/realtime` on :3000), not realtime directly — check that path when
  debugging the UI, and the feed wire format in `docs/references/f1-feed.md`.
