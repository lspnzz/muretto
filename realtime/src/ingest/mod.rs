//! The ingest boundary: connect to the feed, fold updates into the shared
//! [`State`], and publish each delta to SSE subscribers.
//!
//! `*.z` topics are decompressed and re-keyed here, and the `_kf` keyframe
//! marker the live feed plants on snapshot payloads is stripped — nothing
//! downstream ever sees a compressed topic, a suffixed topic name, or a
//! transport marker. A supervisor reconnects on disconnect and on session
//! change (a new `SessionInfo.Name`), resetting state so a fresh session
//! doesn't merge onto a stale one.

pub mod decompress;

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

const RECONNECT_DELAY: Duration = Duration::from_secs(2);

/// Run the ingest loop until cancelled, reconnecting on error/session change.
pub async fn run_supervised(
    state: Arc<RwLock<State>>,
    tx: broadcast::Sender<String>,
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
async fn ingest_session(state: &Arc<RwLock<State>>, tx: &broadcast::Sender<String>) -> Result<()> {
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
async fn apply_initial(state: &Arc<RwLock<State>>, tx: &broadcast::Sender<String>, initial: Value) {
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
    // Nudge connected clients to pull the fresh snapshot via reconnect-on-initial.
    broadcast_full(state, tx).await;
}

/// Apply one update to state, refresh the liveness stamp, and broadcast the
/// delta as `{ "<Topic>": <data> }`.
async fn handle(
    state: &Arc<RwLock<State>>,
    tx: &broadcast::Sender<String>,
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
        let _ = tx.send(payload);
    }
}

/// Broadcast the whole state as a single update so live clients resync after a
/// session reset.
async fn broadcast_full(state: &Arc<RwLock<State>>, tx: &broadcast::Sender<String>) {
    let snapshot = serde_json::to_value(&*state.read().await).unwrap_or_else(|_| json!({}));
    if let Ok(payload) = serde_json::to_string(&snapshot) {
        let _ = tx.send(payload);
    }
}

/// Decompress `.z` topics and scrub the `_kf` keyframe marker.
///
/// Live snapshot payloads carry `"_kf": true` at the topic root. It's
/// transport metadata, not data — and on keyed-map topics (`DriverList`) a
/// boolean among the entries poisons the whole typed merge, which is exactly
/// how driver names silently vanished from live sessions.
pub fn decode(topic: &str, data: Value) -> Result<Value> {
    let mut value = if decompress::is_compressed(topic) {
        let encoded = data
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("compressed topic payload was not a string"))?;
        decompress::decompress(encoded)?
    } else {
        data
    };
    if let Value::Object(map) = &mut value {
        map.remove("_kf");
    }
    Ok(value)
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

    #[test]
    fn decode_strips_keyframe_marker() {
        let decoded = decode(
            "DriverList",
            json!({ "44": { "RacingNumber": "44", "Tla": "HAM" }, "_kf": true }),
        )
        .unwrap();

        assert!(decoded.get("_kf").is_none());
        assert_eq!(decoded["44"]["Tla"], json!("HAM"));
    }

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
