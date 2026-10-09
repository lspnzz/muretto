#!/usr/bin/env bash
# Re-record docs/assets/replay.gif, the README's demo of the dashboard replaying
# simulator/fixtures/sample.jsonl. Manual, not CI: needs Docker, Node 20+,
# ffmpeg, and internet (the track map's outline comes from MultiViewer).
#
#   ./scripts/record-demo.sh [out.gif]
#
# Boots the offline compose stack from the working tree, captures exactly one
# fixture loop of the Pit wall with Playwright (scripts/record-demo.mjs), and
# encodes it. Record on macOS for the nicest type: the UI uses system fonts.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/docs/assets/replay.gif}"
PLAYWRIGHT_VERSION=1.60.0
WIDTH=1600                     # captured at 1280x800 CSS px, 2x device scale
MAX_BYTES=$((5 * 1024 * 1024)) # GitHub's image proxy gives up around 5 MB
# Point realtime at the replay, not the live feed. 500 ms/frame makes one loop
# ~26s with every flag state on screen long enough to read.
export F1_DEV_URL=ws://replay:8000/ws
export REPLAY_FRAME_DELAY_MS="${REPLAY_FRAME_DELAY_MS:-500}"

for cmd in docker node npm ffmpeg curl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "record-demo.sh needs $cmd on PATH." >&2
    exit 2
  fi
done

compose() {
  docker compose -f "$ROOT/compose.yaml" --profile dev "$@"
}

# The recording reconfigures realtime and replay, so it owns the stack: never
# repoint (and then tear down) one that someone else is running.
if [ -n "$(compose ps -q)" ]; then
  echo "record-demo.sh boots its own stack; stop the running one first:" >&2
  echo "  docker compose --profile dev down" >&2
  exit 2
fi

TMP="$(mktemp -d)"
cleanup() {
  compose down >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

# wait_for <seconds> <command...> — poll until the command succeeds.
wait_for() {
  local deadline=$(($(date +%s) + $1))
  shift
  until "$@" >/dev/null 2>&1; do
    [ "$(date +%s)" -ge "$deadline" ] && return 1
    sleep 0.5
  done
}

has_session() {
  curl -fsS http://127.0.0.1:4000/api/current | grep -q '"DriverList"'
}

echo "==> offline stack (replay at ${REPLAY_FRAME_DELAY_MS}ms/frame)"
compose up -d --build
wait_for 60 has_session || { echo "realtime never served the fixture" >&2; exit 1; }
wait_for 60 curl -fsS -o /dev/null http://127.0.0.1:3000/ ||
  { echo "dashboard never came up on :3000" >&2; exit 1; }

echo "==> playwright $PLAYWRIGHT_VERSION (temp install; repo manifests untouched)"
npm install --prefix "$TMP/pw" --no-save --no-package-lock --no-audit --no-fund \
  --loglevel=error "playwright@$PLAYWRIGHT_VERSION"
"$TMP/pw/node_modules/.bin/playwright" install --only-shell chromium

mkdir -p "$TMP/frames"
PW_DIR="$TMP/pw" FRAMES_DIR="$TMP/frames" node "$ROOT/scripts/record-demo.mjs"

echo "==> encoding $OUT"
# One palette for the whole loop, weighted to what changes; ordered dither and
# changed-rectangle frames keep a mostly static dashboard small.
ffmpeg -loglevel error -y -f concat -safe 0 -i "$TMP/frames/frames.txt" \
  -vf "scale=$WIDTH:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" \
  -loop 0 "$TMP/demo.gif"

bytes=$(wc -c <"$TMP/demo.gif" | tr -d '[:space:]')
if [ "$bytes" -gt "$MAX_BYTES" ]; then
  echo "FAIL: GIF is $((bytes / 1024)) KB (max $((MAX_BYTES / 1024))); lower WIDTH." >&2
  exit 1
fi
mkdir -p "$(dirname "$OUT")"
mv "$TMP/demo.gif" "$OUT"
echo "==> wrote $OUT ($((bytes / 1024)) KB)"
