//! The ingest boundary: connect to the feed, fold updates into the shared
//! [`State`], and publish each delta to SSE subscribers.
//!
//! `*.z` topics are decompressed and re-keyed here so nothing downstream ever
//! sees a compressed or suffixed topic. A supervisor reconnects on disconnect
//! and on session change (a new `SessionInfo.Name`), resetting state so a fresh
//! session doesn't merge onto a stale one.

pub mod decompress;
mod driver_list;

use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use futures::StreamExt;
use serde_json::{Map, Value, json};
use tokio::sync::{RwLock, broadcast};
use tokio_util::sync::CancellationToken;
use tracing::{info, trace, warn};

use crate::config;
use crate::model::State;
use crate::server::Broadcast;

const RECONNECT_DELAY: Duration = Duration::from_secs(2);

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
/// (socket close or detected session change), `Err` on connection failure.
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
    while let Some(batch) = updates.next().await {
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

            // A new SessionInfo carrying a Name means a new session — apply it,
            // then reconnect fresh so state doesn't blend two sessions.
            let new_session = topic == "SessionInfo" && data.get("Name").is_some();
            handle(state, tx, &topic, data).await;
            if new_session {
                info!("detected new session");
                return Ok(());
            }
        }
    }
    Ok(())
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
    {
        let mut guard = state.write().await;
        guard.apply(topic, data.clone());
        // Heartbeat proves the socket is alive, not that a session is
        // producing data, so it doesn't refresh the stamp.
        if topic != "Heartbeat" {
            guard.last_feed_event_ms = Some(now_ms());
        }
    }
    let mut obj = Map::with_capacity(1);
    obj.insert(topic.to_string(), data);
    if let Ok(payload) = serde_json::to_string(&Value::Object(obj)) {
        // Err just means no subscribers; that's fine.
        let _ = tx.send(Broadcast::Update(payload));
    }

    if matches!(topic, "DriverList" | "SessionInfo") {
        backfill_driver_list(state, tx, true).await;
    }
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
}
