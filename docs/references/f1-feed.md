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
   Keep-alives are `{"type":6}`; non-feed frames parse to an **empty batch**
   — they carry no data but still count as proof the socket is alive.

### Connection failure modes

The 2026 British GP sprint blackout: the WebSocket half-died on 2026-06-28
with no error and no close frame, and ingest sat blocked on a read for six
frame-silent days. A half-open socket's only signal is silence, so silence
is treated as fatal:

- `CONNECT_TIMEOUT` and `SUBSCRIBE_TIMEOUT` (`realtime/src/signalr/mod.rs`)
  cap the connect flow and the Subscribe round-trip **inside the client**, so
  every caller is covered — ingest and the simulator's recorder alike.
  Negotiate has no request timeout of its own, and the Subscribe completion
  may simply never arrive. The Subscribe cap is wider because its completion
  carries the full initial snapshot.
- A Subscribe completion without a usable `result` (missing or `null`, with
  or without an `error` field) aborts the cycle (`subscribe_completion` in
  `realtime/src/signalr/mod.rs`); skipping it would mean waiting forever for
  a snapshot that is never coming.
- `FEED_IDLE_TIMEOUT` (`realtime/src/ingest/mod.rs`) bounds frame-silence.
  A healthy Core connection delivers keep-alives every ~15s even between
  sessions, so a socket with no frames for the whole window is presumed
  dead; the supervisor reconnects ~2s later. A read *error* ends the session
  immediately — an erroring socket is not a live one, so it must never feed
  the watchdog. Overt closes always reconnected fine; only silent death
  needed the watchdog.

Known gap: feed frames that arrive interleaved with the Subscribe completion
(before it, or after it in the same record-separated message) are dropped;
state heals on each topic's next delta. Pre-existing, deliberate — buffering
them through `subscribe` isn't worth the surgery on this path yet.

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
  Live probes on 2026-06-13 showed F1 can stream timing while omitting both
  telemetry topics. The dashboard treats native `Position` as optional and does
  not backfill it from another provider; restoring live car dots is future
  authenticated-F1-feed work
  ([0006](../plans/0006-no-openf1-dependency.md)).
- `TimingData` — the main per-driver timing tree, by far the chattiest topic.
- `TimingStats`, `TopThree`, `SessionData`, `TeamRadio` — ragged shapes, kept
  as loose JSON (belief 8 in
  [core-beliefs](../design/core-beliefs.md)).
- `State` also has a `championship_prediction` field, but
  `ChampionshipPrediction` is **not currently subscribed** — the field stays
  empty until someone adds the topic.

## Session kinds

`SessionInfo.Type` stays within `Practice | Qualifying | Race`; sprint
weekends add new **Names**, not new Types (verified live and against the
season archive index during the 2026-07-04 British GP sprint weekend):

| `Name` | `Type` |
| ------ | ------ |
| `Practice N` | `Practice` |
| `Sprint Qualifying` | `Qualifying` |
| `Sprint Shootout` (2023–24 archive naming; older recordings only) | `Qualifying` |
| `Sprint` | `Race` |
| `Qualifying` | `Qualifying` |
| `Race` | `Race` |

Anything gating on `Type` (e.g. the dashboard's strategy ring) treats a
sprint as a race automatically. `Name` feeds display labels and the
session-change heuristic only, so no data path needs a sprint special case —
which is why the sole `Race`-shaped fixture is representative coverage.

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
- If a live snapshot has timing lines but no usable driver names, ingest
  backfills `DriverList` identity fields from
  `https://livetiming.formula1.com/static/{SessionInfo.Path}DriverList.jsonStream`.
  That archive is timestamp-prefixed JSON lines; muretto imports only identity
  fields, not `Line`, so live timing order still comes from `TimingData`.

## What downstream sees

`realtime` re-exposes the feed as SSE (`/api/realtime`): one `initial` event
(full `State`) on connect, then `update` events of `{"<Topic>": <delta>}`. A
mid-stream `initial` means **replace your state, don't fold** — it's sent to
a lagging subscriber instead of dropping deltas, and to everyone after a
session reset (feed reconnect / new session), where folding would leave
removed keys behind (`realtime/src/server/mod.rs`,
`realtime/src/ingest/mod.rs::broadcast_full`).

## Recording and replaying sessions

- Record a live session already in progress:
  `cargo run -p simulator -- save <file>` — refuses to overwrite. Line 1 is
  `{"R": <initial>}`; every later line is one raw frame, verbatim.
- Record the next session before it is live:
  `cargo run -p simulator -- save-next <file>`. If the subscribe snapshot is
  the previous ended session, this waits for the next `SessionInfo.Name`
  update, reconnects, and writes a fresh initial snapshot for that session.
  `./scripts/record-next-session.sh [file-or-dir]` wraps this with a timestamped
  default under ignored `simulator/recordings/`.
- Replay: `cargo run -p simulator -- replay <file>` — serves
  `ws://0.0.0.0:8000/ws` (address hardcoded), ~10 Hz, loops nothing: when the
  file ends it closes the socket and realtime's supervisor reconnects, so the
  fixture effectively replays in a loop.
- Recordings may contain live SignalR Core frames (`0x1E` separators) or the
  older legacy JSON shape. Replay and tests parse both through `signalr::parse_feed`.
- `simulator/fixtures/sample.jsonl` is a tiny **synthetic** session (5
  drivers, 50 lines: telemetry/sectors/track positions for all of them, plus
  a full flag sequence — yellow/SC/VSC/red/restart) used by tests and
  `scripts/smoke.sh`.

## Code map

| Path | Role |
| ---- | ---- |
| `realtime/src/signalr/mod.rs` | negotiate, handshake, Subscribe, frame parsing (both shapes) |
| `realtime/src/ingest/mod.rs` | supervisor loop, decode → `State::apply` → broadcast |
| `realtime/src/ingest/decompress.rs` | base64 + raw-DEFLATE decoding, `.z` re-keying |
| `realtime/src/model/state.rs` | the typed `State` tree (ts-rs root) |
| `realtime/src/model/de.rs` | array-vs-index-keyed-object normalization |
| `simulator/src/save.rs`, `replay.rs` | record / serve recordings |
