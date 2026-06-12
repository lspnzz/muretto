#!/usr/bin/env bash
# Record a live F1 session to recordings/<name>.data.jsonl (gitignored).
#
#   ./scripts/record.sh            # -> recordings/session-<utc timestamp>.data.jsonl
#   ./scripts/record.sh montreal   # -> recordings/montreal.data.jsonl
#
# Start it any time before the session; the recorder reconnects through drops,
# rotates to montreal.data.2.jsonl etc. when the feed announces a new session,
# and flushes on Ctrl-C / docker stop. Uses cargo when present, otherwise the
# simulator Docker image. Turning a recording into a committed test fixture:
# docs/references/f1-feed.md ("Recording and replaying sessions").
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAME="${1:-session-$(date -u +%Y%m%d-%H%M%S)}"
DIR="$ROOT/recordings"
FILE="$DIR/$NAME.data.jsonl"

mkdir -p "$DIR"
if [ -e "$FILE" ]; then
  echo "refusing to overwrite $FILE" >&2
  exit 1
fi

if command -v cargo >/dev/null 2>&1; then
  exec cargo run -p simulator -- save "$FILE"
fi

echo "==> no cargo on PATH; recording via Docker (first build takes a few minutes)"
docker build -f "$ROOT/simulator/Dockerfile" -t muretto-simulator "$ROOT"
exec docker run --rm -v "$DIR:/recordings" muretto-simulator save "/recordings/$NAME.data.jsonl"
