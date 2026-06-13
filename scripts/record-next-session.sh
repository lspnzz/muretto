#!/usr/bin/env bash
# Record the next live F1 session into a timestamped replay file.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if ! command -v cargo >/dev/null 2>&1; then
  echo "record-next-session.sh needs a Rust toolchain (cargo) on PATH." >&2
  exit 2
fi

target="${1:-$ROOT/simulator/recordings}"
if [[ "$target" != *.jsonl ]]; then
  mkdir -p "$target"
  target="$target/live-$(date -u +%Y%m%dT%H%M%SZ).jsonl"
else
  mkdir -p "$(dirname "$target")"
fi

echo "==> recording next live session to $target"
echo "==> stop with Ctrl-C after the session; replay with:"
echo "    cargo run -p simulator -- replay \"$target\""
cargo run -p simulator -- save-next "$target"
