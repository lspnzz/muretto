# The F1 live-timing feed

How `livetiming.formula1.com` actually behaves on the wire, and where muretto
speaks to it. Written for someone landing cold in `realtime/src/signalr` or
`ingest`. Wire field names are exact; everything here is pinned by tests where
possible.

## Two protocols

| Mode | Protocol | When |
| ---- | -------- | ---- |
| Live | **SignalR Core** (negotiate → wss → JSON handshake) | `F1_DEV_URL` unset |
| Replay | **Legacy SignalR shape** (direct ws, no negotiate) | `F1_DEV_URL` set |

F1 moved the public feed to SignalR Core; the legacy shape survives here only
because the replay simulator and its recordings use it for the snapshot
envelope. `signalr::connect` in `realtime/src/signalr/mod.rs` picks the path:
a set `F1_DEV_URL` short-circuits straight to that WebSocket with
`Protocol::Legacy`.

## Live connection flow (Core)

1. `POST https://livetiming.formula1.com/signalrcore/negotiate?negotiateVersion=1`
   → JSON with `connectionToken`, plus an `AWSALBCORS` affinity cookie that
   must be echoed on the WebSocket request.
2. Open `wss://livetiming.formula1.com/signalrcore?id=<connectionToken>` with
   headers `User-Agent: BestHTTP` and `Accept-Encoding: gzip,identity` (the
   feed is picky about both).
3. Send the handshake `{"protocol":"json","version":1}`. **Every Core frame is
   terminated by the record separator `0x1E`**, and one WebSocket message may
   carry several frames. The handshake reply is an empty `{}` frame.
4. Invoke Subscribe:
   `{"type":1,"invocationId":"1","target":"Subscribe","arguments":[[…topics]]}`.
   The completion frame `{"type":3,"invocationId":"1","result":{…}}` carries
   the **initial snapshot**: an object keyed by topic name.
5. Read feed frames:
   `{"type":1,"target":"feed","arguments":[<topic>,<data>,<timestamp>]}`.
   Keep-alives are `{"type":6}`; non-feed frames are skipped, not errors.

## Replay flow (legacy shape)

Direct `ws://…/ws` connect, no negotiate, no handshake. The client sends
`{"H":"Streaming","M":"Subscribe","A":[[…topics]],"I":1}` and the reply with an
`R` key is the initial snapshot — though the replay simulator
(`simulator/src/replay.rs`) sends its `{"R": …}` line immediately on connect
without waiting. Feed frames look like
`{"M":[{"H":"Streaming","M":"feed","A":[<topic>,<data>,<timestamp>]}]}`.

`parse_feed` accepts **both** shapes on any connection, so recordings of live
Core frames replay fine through the legacy-mode socket.

## Topics

The canonical subscription list is `TOPICS` in `realtime/src/config.rs` — do
not duplicate it here. Notes that the list can't express:

- `CarData.z`, `Position.z` — the only **compressed** topics (next section).
  At ingest the `.z` suffix is stripped, so downstream code and `State` fields
  only ever see `CarData` / `Position`.
- `TimingData` — the main per-driver timing tree, by far the chattiest topic.
- `TimingStats`, `TopThree`, `SessionData`, `TeamRadio` — ragged shapes, kept
  as loose JSON (belief 8 in
  [core-beliefs](../design/core-beliefs.md)).
- `State` also has a `championship_prediction` field, but
  `ChampionshipPrediction` is **not currently subscribed** — the field stays
  empty until someone adds the topic.

## Compressed topics — the classic gotcha

`.z` payloads are a base64 string whose bytes are a **raw DEFLATE stream with
no zlib header**. Use `flate2::read::DeflateDecoder`; `ZlibDecoder` compiles
and then fails on every single frame. This bit the original project and is now
triply guarded: a `clippy.toml` ban with a teaching message, a round-trip test,
and a fixture-pinned test in `realtime/src/ingest/decompress.rs` that decodes
the checked-in recording.

## Update semantics

- The initial snapshot is **full per-topic state**; everything after is a
  **deep partial**.
- Merging (the `Merge` trait in `muretto-merge`): scalars and `Vec`s replace;
  structs merge per present key; `Option` clears on `null`; keyed collections
  (`IndexMap<String, V>`) add / deep-update / remove-on-`null` per key.
- The same logical collection arrives as a JSON **array** in snapshots but as
  an **object keyed by stringified index** (`{"0":…,"2":…}`) in partials.
  `index_map_or_array` in `realtime/src/model/de.rs` normalizes both to an
  insertion-ordered map.
- A streamed `SessionInfo` update carrying a `Name` means a **new session**:
  ingest applies it, returns, and the supervisor reconnects (~2s) and resets
  `State` so sessions never blend (`realtime/src/ingest/mod.rs`).
- Wire casing is **PascalCase** end-to-end; `State` serializes with
  `rename_all = "PascalCase"` so SSE/JSON consumers see feed-native keys.

## What downstream sees

`realtime` re-exposes the feed as SSE (`/api/realtime`): one `initial` event
(full `State`) on connect, then `update` events of `{"<Topic>": <delta>}`. A
lagging subscriber is resynced with a fresh `initial` instead of dropping
deltas (`realtime/src/server/mod.rs`).

## Recording and replaying sessions

- Record (live session only): `./scripts/record.sh [name]` → writes
  `recordings/<name>.data.jsonl` (gitignored; uses cargo, or the simulator
  Docker image when there's no toolchain). Under the hood:
  `cargo run -p simulator -- save <file>` — refuses to overwrite. Line 1 is
  `{"R": <initial>}`; every later line is one raw frame, verbatim.
- The recorder is built for unattended weekends (`simulator/src/save.rs`):
  it **reconnects** on socket drop/error and after 90s of silence (half-open
  sockets), appending the fresh snapshot as one synthetic legacy feed frame
  (full per-topic state, timestamp `"catch-up"`, `SessionInfo` excluded so
  replay doesn't loop) — so replays don't carry the gap. A `SessionInfo`
  update with a `Name` (ingest's new-session rule) **rotates** to
  `<name>.data.2.jsonl` etc., one file per session. SIGINT/SIGTERM flush
  before exit, so Ctrl-C and `docker stop` keep the tail.
- Trim a recording's head into a committed fixture:
  `cargo run -p simulator -- trim <recording> simulator/fixtures/<name>.jsonl <frames>`
  — snapshot + first N lines. Head slices only: a mid-session slice would
  need the preceding frames folded into a synthesized snapshot. The raw
  capture is disposable once the fixture is committed — the fixture is the
  artifact, there is no recording archive
  ([plan 0004](../plans/0004-record-real-sessions.md)).
- Replay: `cargo run -p simulator -- replay <file>` — serves
  `ws://0.0.0.0:8000/ws` (address hardcoded), ~10 Hz, loops nothing: when the
  file ends it closes the socket and realtime's supervisor reconnects, so the
  fixture effectively replays in a loop.
- `simulator/fixtures/sample.jsonl` is a small **synthetic** session (5
  drivers, 14 lines) used by tests and `scripts/smoke.sh`. Every `.jsonl`
  dropped into `simulator/fixtures/` is automatically pinned by the
  `every_checked_in_fixture_replays_cleanly` test in
  `realtime/tests/merge.rs`, and `./scripts/smoke.sh <file>` runs the offline
  stack against any recording or fixture.

## Code map

| Path | Role |
| ---- | ---- |
| `realtime/src/signalr/mod.rs` | negotiate, handshake, Subscribe, frame parsing (both shapes) |
| `realtime/src/ingest/mod.rs` | supervisor loop, decode → `State::apply` → broadcast |
| `realtime/src/ingest/decompress.rs` | base64 + raw-DEFLATE decoding, `.z` re-keying |
| `realtime/src/model/state.rs` | the typed `State` tree (ts-rs root) |
| `realtime/src/model/de.rs` | array-vs-index-keyed-object normalization |
| `simulator/src/save.rs`, `replay.rs`, `trim.rs` | record / serve / excerpt recordings |
