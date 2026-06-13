#!/usr/bin/env bash
# Offline end-to-end smoke: replay fixture -> realtime -> HTTP/SSE assertions.
# Identical locally and in CI. Protocol details: docs/references/f1-feed.md
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FIXTURE="${1:-$ROOT/simulator/fixtures/sample.jsonl}"
RT_ADDR="127.0.0.1:4000"
REPLAY_PORT=8000 # hardcoded in simulator/src/replay.rs
TMP="$(mktemp -d)"
PIDS=()

if ! command -v cargo >/dev/null 2>&1; then
  echo "smoke.sh needs a Rust toolchain (cargo) on PATH." >&2
  echo "No Rust here? Run the same loop in Docker instead:" >&2
  echo "  F1_DEV_URL=ws://replay:8000/ws docker compose --profile dev up --build" >&2
  echo "  curl -N http://localhost:4000/api/realtime   # expect: event: initial" >&2
  exit 2
fi

cleanup() {
  kill ${PIDS[@]+"${PIDS[@]}"} 2>/dev/null || true
  wait 2>/dev/null || true
  rm -rf "$TMP"
}
trap cleanup EXIT

die() {
  echo "SMOKE FAIL: $*" >&2
  echo "--- replay log ---" >&2
  cat "$TMP/replay.log" >&2 2>/dev/null || true
  echo "--- realtime log ---" >&2
  cat "$TMP/realtime.log" >&2 2>/dev/null || true
  exit 1
}

# wait_for <seconds> <command...> — poll until the command succeeds.
wait_for() {
  local deadline=$(($(date +%s) + $1))
  shift
  until "$@" >/dev/null 2>&1; do
    [ "$(date +%s)" -ge "$deadline" ] && return 1
    sleep 0.5
  done
}

# port_open <port> — pure-bash TCP probe (no nc dependency on CI runners).
port_open() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
}

for port in "$REPLAY_PORT" "${RT_ADDR##*:}"; do
  if port_open "$port"; then
    die "port $port already in use — stop whatever holds it (replay's port is not configurable)"
  fi
done

echo "==> building (debug)"
cargo build -p simulator -p realtime

# Run the built binaries directly: killing a `cargo run` parent can orphan the
# actual server and leave the ports held.
echo "==> replay simulator on :$REPLAY_PORT"
"$ROOT/target/debug/simulator" replay "$FIXTURE" >"$TMP/replay.log" 2>&1 &
PIDS+=($!)
wait_for 30 port_open "$REPLAY_PORT" || die "replay never opened :$REPLAY_PORT"

echo "==> realtime on $RT_ADDR"
F1_DEV_URL="ws://127.0.0.1:$REPLAY_PORT/ws" ADDRESS="$RT_ADDR" RUST_LOG="${RUST_LOG:-realtime=info}" \
  "$ROOT/target/debug/realtime" >"$TMP/realtime.log" 2>&1 &
PIDS+=($!)
wait_for 60 curl -fsS "http://$RT_ADDR/api/health" || die "/api/health never came up"

echo "==> /api/current carries the fixture snapshot (PascalCase keys)"
check_current() {
  curl -fsS "http://$RT_ADDR/api/current" | python3 -c '
import json, sys
d = json.load(sys.stdin)
sys.exit(0 if all(k in d for k in ("SessionInfo", "DriverList", "TrackStatus")) else 1)'
}
wait_for 30 check_current || die "/api/current missing SessionInfo/DriverList/TrackStatus"

echo "==> SSE emits initial then update"
curl -sN --max-time 8 "http://$RT_ADDR/api/realtime" >"$TMP/sse.out" || true
grep -q '^event: initial' "$TMP/sse.out" || die "no 'initial' SSE event"
grep -q '^event: update' "$TMP/sse.out" || die "no 'update' SSE event"

echo "SMOKE PASS"
