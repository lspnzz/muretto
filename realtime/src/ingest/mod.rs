//! The ingest boundary: connect to the feed, fold updates into the shared
//! [`State`], and publish each delta to SSE subscribers.
//!
//! `*.z` topics are decompressed and re-keyed here so nothing downstream ever
//! sees a compressed or suffixed topic. A supervisor reconnects on disconnect,
//! on session change (a new `SessionInfo.Name`), and when the socket goes
//! frame-silent (a half-open connection never errors — it just stops
//! delivering), resetting state so a fresh session doesn't merge onto a
//! stale one.

pub mod decompress;
mod driver_list;

use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use futures::{Stream, StreamExt};
use indexmap::IndexMap;
use serde_json::{Map, Value, json};
use tokio::sync::{RwLock, broadcast};
use tokio_util::sync::CancellationToken;
use tracing::{info, trace, warn};

use muretto_merge::Merge;

use crate::config;
use crate::model::State;
use crate::server::Broadcast;
use crate::signalr::UpdateArgs;

const RECONNECT_DELAY: Duration = Duration::from_secs(2);

/// How long the socket may deliver *no frames at all* before it is presumed
/// dead. A healthy Core connection is never this quiet — keep-alives arrive
/// every ~15s even between sessions — but a half-open TCP connection delivers
/// nothing, never errors, and never closes (2026-07-04: six silent days that
/// blacked out a sprint weekend), so silence is the only available signal.
/// A false trigger costs one ~2s reconnect; a missed dead socket costs every
/// session until someone redeploys.
const FEED_IDLE_TIMEOUT: Duration = Duration::from_secs(90);

/// Run the ingest loop until cancelled, reconnecting on error/session change.
pub async fn run_supervised(
    state: Arc<RwLock<State>>,
    tx: broadcast::Sender<Broadcast>,
    cancel: CancellationToken,
) {
    loop {
        if cancel.is_cancelled() {
            return;
        }
        tokio::select! {
            _ = cancel.cancelled() => return,
            result = ingest_session(&state, &tx) => {
                match result {
                    Ok(()) => info!("ingest session ended (reconnecting)"),
                    Err(e) => warn!(?e, "ingest session failed (reconnecting)"),
                }
            }
        }
        tokio::select! {
            _ = cancel.cancelled() => return,
            _ = tokio::time::sleep(RECONNECT_DELAY) => {}
        }
    }
}

/// One connect → subscribe → listen cycle. Returns `Ok(())` on a clean end
/// (socket close or detected session change), `Err` on connection failure,
/// a hung connect/subscribe (capped in `signalr`), or a frame-silent socket.
async fn ingest_session(
    state: &Arc<RwLock<State>>,
    tx: &broadcast::Sender<Broadcast>,
) -> Result<()> {
    let dev_url = config::dev_url();
    let mut client =
        crate::signalr::connect(config::F1_SIGNALR_URL, config::F1_HUB, dev_url.as_deref()).await?;

    let initial = client.subscribe(config::TOPICS).await?;
    apply_initial(state, tx, initial).await;
    info!("subscribed; streaming live updates");

    let updates = client.listen();
    tokio::pin!(updates);
    while let Some(batch) = next_batch(&mut updates, FEED_IDLE_TIMEOUT).await? {
        for update in batch {
            let topic = decompress::canonical_topic(&update.topic).to_string();
            let data = match decode(&update.topic, update.data) {
                Ok(data) => data,
                Err(e) => {
                    warn!(topic = %topic, ?e, "failed to decode update");
                    continue;
                }
            };
            trace!(topic = %topic, "update");

            // A changed SessionInfo identity means a new session. Start/status
            // patches for the same Key/Path also carry Name and must merge in
            // place, otherwise replay/live reconnects at lights-on.
            let new_session = topic == "SessionInfo" && is_new_session_info(state, &data).await;
            handle(state, tx, &topic, data).await;
            if new_session {
                info!("detected new session");
                return Ok(());
            }
        }
    }
    Ok(())
}

/// Next frame batch, or `None` when the socket closes. Errs when the socket
/// yields nothing for `idle` — `listen()` surfaces keep-alives as empty
/// batches, so a healthy connection always beats the deadline and only a
/// dead one runs it out.
async fn next_batch<S>(updates: &mut S, idle: Duration) -> Result<Option<Vec<UpdateArgs>>>
where
    S: Stream<Item = Vec<UpdateArgs>> + Unpin,
{
    match tokio::time::timeout(idle, updates.next()).await {
        Ok(batch) => Ok(batch),
        Err(_) => anyhow::bail!(
            "no frames for {}s; presuming the socket dead",
            idle.as_secs()
        ),
    }
}

async fn is_new_session_info(state: &Arc<RwLock<State>>, data: &Value) -> bool {
    if data.get("Name").is_none() {
        return false;
    }

    let guard = state.read().await;
    let Some(current) = guard.session_info.as_ref() else {
        return false;
    };

    let incoming_key = data
        .get("Key")
        .and_then(Value::as_i64)
        .and_then(|key| i32::try_from(key).ok());
    if incoming_key.is_some_and(|key| key != current.key) {
        return true;
    }

    let incoming_path = data.get("Path").and_then(Value::as_str).unwrap_or("");
    if !incoming_path.is_empty() && incoming_path != current.path {
        return true;
    }

    incoming_key.is_none()
        && incoming_path.is_empty()
        && data
            .get("Name")
            .and_then(Value::as_str)
            .is_some_and(|name| !current.name.is_empty() && name != current.name)
}

/// Reset state to the new session's initial snapshot and seed each topic.
async fn apply_initial(
    state: &Arc<RwLock<State>>,
    tx: &broadcast::Sender<Broadcast>,
    initial: Value,
) {
    let Value::Object(topics) = initial else {
        return;
    };
    {
        let mut guard = state.write().await;
        *guard = State::default();
        for (topic, data) in &topics {
            let canonical = decompress::canonical_topic(topic).to_string();
            match decode(topic, data.clone()) {
                Ok(decoded) => guard.apply(&canonical, decoded),
                Err(e) => warn!(topic = %canonical, ?e, "failed to decode initial topic"),
            }
        }
    }
    {
        // Seed lap history from the snapshot's latest lap so a freshly
        // (re)connected client isn't blank; live updates accumulate from here.
        let mut guard = state.write().await;
        let _ = fold_lap_history(&mut guard, &IndexMap::new());
    }
    backfill_driver_list(state, tx, false).await;
    // State was replaced, not patched — connected clients must replace too,
    // so this goes out as `initial` rather than a foldable `update`.
    broadcast_full(state, tx).await;
}

/// Apply one update to state, refresh the liveness stamp, and broadcast the
/// delta as `{ "<Topic>": <data> }`.
async fn handle(
    state: &Arc<RwLock<State>>,
    tx: &broadcast::Sender<Broadcast>,
    topic: &str,
    data: Value,
) {
    let lap_delta = {
        let mut guard = state.write().await;
        // Snapshot the latest lap per driver *before* applying, so a changed
        // LastLapTime in this delta reads as a completed lap.
        let prev = (topic == "TimingData").then(|| last_lap_values(&guard));
        guard.apply(topic, data.clone());
        // Heartbeat proves the socket is alive, not that a session is
        // producing data, so it doesn't refresh the stamp.
        if topic != "Heartbeat" {
            guard.last_feed_event_ms = Some(now_ms());
        }
        prev.and_then(|prev| fold_lap_history(&mut guard, &prev))
    };

    let mut obj = Map::with_capacity(1);
    obj.insert(topic.to_string(), data);
    if let Ok(payload) = serde_json::to_string(&Value::Object(obj)) {
        // Err just means no subscribers; that's fine.
        let _ = tx.send(Broadcast::Update(payload));
    }

    // Lap history isn't a feed topic; broadcast the freshly-folded laps as their
    // own delta so live clients accumulate them the same way they fold any topic.
    if let Some(lap_delta) = lap_delta {
        let mut obj = Map::with_capacity(1);
        obj.insert("LapHistory".to_string(), lap_delta);
        if let Ok(payload) = serde_json::to_string(&Value::Object(obj)) {
            let _ = tx.send(Broadcast::Update(payload));
        }
    }

    if matches!(topic, "DriverList" | "SessionInfo") {
        backfill_driver_list(state, tx, true).await;
    }
}

/// Each driver's current `LastLapTime` value, to diff against after a TimingData
/// delta is applied.
fn last_lap_values(state: &State) -> IndexMap<String, String> {
    state
        .timing_data
        .as_ref()
        .map(|td| {
            td.lines
                .iter()
                .map(|(num, line)| (num.clone(), line.last_lap_time.value.clone()))
                .collect()
        })
        .unwrap_or_default()
}

/// Fold any driver whose `LastLapTime` changed (vs `prev`) into `lap_history`,
/// keyed by their current lap number, and return the same additions as a delta
/// (`{ "<num>": { "<lap>": LapVal } }`) to broadcast — or `None` if nothing new.
fn fold_lap_history(state: &mut State, prev: &IndexMap<String, String>) -> Option<Value> {
    let lines = &state.timing_data.as_ref()?.lines;
    let mut additions = Map::new();
    for (num, line) in lines {
        if line.last_lap_time.value.is_empty() {
            continue;
        }
        let unchanged = prev
            .get(num)
            .is_some_and(|before| before == &line.last_lap_time.value);
        if unchanged {
            continue;
        }
        let Some(lap) = line.number_of_laps else {
            continue;
        };
        if let Ok(lap_val) = serde_json::to_value(&line.last_lap_time) {
            let mut entry = Map::with_capacity(1);
            entry.insert(lap.to_string(), lap_val);
            additions.insert(num.clone(), Value::Object(entry));
        }
    }
    if additions.is_empty() {
        return None;
    }
    let delta = Value::Object(additions);
    state.lap_history.merge(delta.clone());
    Some(delta)
}

async fn backfill_driver_list(
    state: &Arc<RwLock<State>>,
    tx: &broadcast::Sender<Broadcast>,
    broadcast: bool,
) {
    let Some(path) = driver_list::backfill_path(&*state.read().await) else {
        return;
    };

    let fallback = match driver_list::fetch_archive(&path).await {
        Ok(Some(fallback)) => fallback,
        Ok(None) => return,
        Err(e) => {
            warn!(%path, ?e, "failed to fetch archive DriverList fallback");
            return;
        }
    };

    {
        let mut guard = state.write().await;
        guard.apply("DriverList", fallback.clone());
    }

    if broadcast {
        let mut obj = Map::with_capacity(1);
        obj.insert("DriverList".to_string(), fallback);
        if let Ok(payload) = serde_json::to_string(&Value::Object(obj)) {
            let _ = tx.send(Broadcast::Update(payload));
        }
    }
}

/// Broadcast the whole state as a fresh `initial` so live clients replace
/// their state after a session reset — folding it as an update would leave
/// keys the reset dropped (stale race-control messages, departed drivers).
async fn broadcast_full(state: &Arc<RwLock<State>>, tx: &broadcast::Sender<Broadcast>) {
    let snapshot = serde_json::to_value(&*state.read().await).unwrap_or_else(|_| json!({}));
    if let Ok(payload) = serde_json::to_string(&snapshot) {
        let _ = tx.send(Broadcast::Initial(payload));
    }
}

/// Decompress `.z` topics; pass everything else through untouched.
fn decode(topic: &str, data: Value) -> Result<Value> {
    if decompress::is_compressed(topic) {
        let encoded = data
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("compressed topic payload was not a string"))?;
        decompress::decompress(encoded)
    } else {
        Ok(data)
    }
}

/// Wall-clock epoch milliseconds (0 if the clock reads before the epoch).
fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn handle_stamps_liveness_for_data_topics() {
        let state = Arc::new(RwLock::new(State::default()));
        let (tx, _rx) = broadcast::channel(8);

        handle(&state, &tx, "TrackStatus", json!({ "Status": "1" })).await;

        let guard = state.read().await;
        assert!(guard.last_feed_event_ms.is_some());
        assert_eq!(
            guard.track_status.as_ref().map(|t| t.status.as_str()),
            Some("1")
        );
    }

    #[tokio::test]
    async fn session_reset_broadcasts_initial_while_deltas_stay_updates() {
        let state = Arc::new(RwLock::new(State::default()));
        let (tx, mut rx) = broadcast::channel(8);

        apply_initial(&state, &tx, json!({ "TrackStatus": { "Status": "1" } })).await;
        assert!(matches!(rx.recv().await, Ok(Broadcast::Initial(_))));

        handle(&state, &tx, "TrackStatus", json!({ "Status": "2" })).await;
        match rx.recv().await {
            Ok(Broadcast::Update(payload)) => assert!(payload.contains("TrackStatus")),
            other => panic!("expected an update broadcast, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn timing_data_lap_completion_accumulates_and_broadcasts_history() {
        let state = Arc::new(RwLock::new(State::default()));
        let (tx, mut rx) = broadcast::channel(8);

        handle(
            &state,
            &tx,
            "TimingData",
            json!({ "Lines": { "44": { "NumberOfLaps": 1, "LastLapTime": { "Value": "1:30.000" } } } }),
        )
        .await;

        // The topic delta, then the synthetic LapHistory delta.
        match rx.recv().await {
            Ok(Broadcast::Update(p)) => assert!(p.contains("TimingData")),
            other => panic!("expected TimingData update, got {other:?}"),
        }
        match rx.recv().await {
            Ok(Broadcast::Update(p)) => {
                assert!(p.contains("LapHistory"));
                assert!(p.contains("1:30.000"));
            }
            other => panic!("expected LapHistory update, got {other:?}"),
        }

        let guard = state.read().await;
        assert_eq!(guard.lap_history["44"]["1"].value, "1:30.000");
    }

    #[tokio::test]
    async fn unchanged_last_lap_does_not_record_a_lap() {
        let state = Arc::new(RwLock::new(State::default()));
        let (tx, _rx) = broadcast::channel(16);

        handle(
            &state,
            &tx,
            "TimingData",
            json!({ "Lines": { "44": { "NumberOfLaps": 1, "LastLapTime": { "Value": "1:30.000" } } } }),
        )
        .await;
        // A later delta that doesn't change LastLapTime (e.g. a gap update).
        handle(
            &state,
            &tx,
            "TimingData",
            json!({ "Lines": { "44": { "GapToLeader": "+1.0" } } }),
        )
        .await;

        let guard = state.read().await;
        assert_eq!(guard.lap_history["44"].len(), 1);
    }

    #[tokio::test]
    async fn successive_laps_append_without_dropping_earlier_ones() {
        let state = Arc::new(RwLock::new(State::default()));
        let (tx, _rx) = broadcast::channel(16);

        handle(
            &state,
            &tx,
            "TimingData",
            json!({ "Lines": { "44": { "NumberOfLaps": 1, "LastLapTime": { "Value": "1:30.000" } } } }),
        )
        .await;
        handle(
            &state,
            &tx,
            "TimingData",
            json!({ "Lines": { "44": { "NumberOfLaps": 2, "LastLapTime": { "Value": "1:29.500" } } } }),
        )
        .await;

        let guard = state.read().await;
        let laps = &guard.lap_history["44"];
        assert_eq!(laps["1"].value, "1:30.000");
        assert_eq!(laps["2"].value, "1:29.500");
    }

    #[tokio::test]
    async fn heartbeat_does_not_refresh_liveness() {
        let state = Arc::new(RwLock::new(State::default()));
        let (tx, _rx) = broadcast::channel(8);

        handle(
            &state,
            &tx,
            "Heartbeat",
            json!({ "Utc": "2026-06-12T00:00:00Z" }),
        )
        .await;

        let guard = state.read().await;
        assert!(guard.last_feed_event_ms.is_none());
        assert!(guard.heartbeat.is_some()); // the topic itself still merges
    }

    #[tokio::test]
    async fn idle_watchdog_errs_when_the_socket_goes_silent() {
        let mut updates = futures::stream::pending::<Vec<UpdateArgs>>();

        let result = next_batch(&mut updates, Duration::from_millis(20)).await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn next_batch_passes_frames_and_stream_end_through() {
        let mut updates = futures::stream::iter([Vec::<UpdateArgs>::new()]);

        assert!(matches!(
            next_batch(&mut updates, Duration::from_secs(5)).await,
            Ok(Some(_))
        ));
        assert!(matches!(
            next_batch(&mut updates, Duration::from_secs(5)).await,
            Ok(None)
        ));
    }

    #[tokio::test]
    async fn session_info_start_patch_is_not_a_new_session() {
        let state = Arc::new(RwLock::new(State::default()));
        {
            let mut guard = state.write().await;
            guard.apply(
                "SessionInfo",
                json!({
                    "Key": 11303,
                    "Name": "Qualifying",
                    "Path": "2026/2026-06-14_Barcelona_Grand_Prix/2026-06-13_Qualifying/",
                    "SessionStatus": "Inactive"
                }),
            );
        }

        let patch = json!({
            "Key": 11303,
            "Name": "Qualifying",
            "Path": "2026/2026-06-14_Barcelona_Grand_Prix/2026-06-13_Qualifying/",
            "SessionStatus": "Started"
        });

        assert!(!is_new_session_info(&state, &patch).await);
    }

    #[tokio::test]
    async fn session_info_identity_change_is_a_new_session() {
        let state = Arc::new(RwLock::new(State::default()));
        {
            let mut guard = state.write().await;
            guard.apply(
                "SessionInfo",
                json!({
                    "Key": 11303,
                    "Name": "Qualifying",
                    "Path": "2026/2026-06-14_Barcelona_Grand_Prix/2026-06-13_Qualifying/"
                }),
            );
        }

        let patch = json!({
            "Key": 11304,
            "Name": "Race",
            "Path": "2026/2026-06-14_Barcelona_Grand_Prix/2026-06-14_Race/"
        });

        assert!(is_new_session_info(&state, &patch).await);
    }
}
