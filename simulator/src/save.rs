//! Record a live session to a line-delimited file.

use std::io::{BufWriter, Write};

use anyhow::{Context, Result, bail};
use futures::StreamExt;
use realtime::config;
use realtime::signalr::{self, SignalrClient};
use serde_json::{Value, json};
use tracing::{info, warn};

pub async fn save(path: &str) -> Result<()> {
    let (initial, client) = subscribe_live().await?;
    write_recording(path, initial, client).await
}

pub async fn save_next(path: &str) -> Result<()> {
    ensure_new_file(path)?;

    let mut saw_new_session = false;
    loop {
        let (initial, client) = subscribe_live().await?;
        if saw_new_session || is_recordable_snapshot(&initial) {
            return write_recording(path, initial, client).await;
        }

        info!("current snapshot looks archived; waiting for the next session");
        if wait_for_new_session(client).await? {
            saw_new_session = true;
            info!("new session announced; reconnecting for a fresh initial snapshot");
        } else {
            warn!("feed closed before a new session announcement; reconnecting");
        }
    }
}

async fn subscribe_live() -> Result<(Value, SignalrClient)> {
    let mut client = signalr::connect(config::F1_SIGNALR_URL, config::F1_HUB, None).await?;
    let initial = client.subscribe(config::TOPICS).await?;
    Ok((initial, client))
}

async fn write_recording(path: &str, initial: Value, client: SignalrClient) -> Result<()> {
    ensure_new_file(path)?;
    let file = std::fs::File::create(path).context("create recording file")?;
    let mut writer = BufWriter::new(file);

    // Line 1: the initial snapshot, wrapped so the replay client sees an `R`.
    writeln!(writer, "{}", json!({ "R": initial }))?;
    info!("recorded initial snapshot");

    let frames = client.listen_raw();
    tokio::pin!(frames);
    let mut count = 0u64;
    while let Some(frame) = frames.next().await {
        writeln!(writer, "{frame}")?;
        count += 1;
        if count.is_multiple_of(100) {
            writer.flush()?;
            info!(count, "recording");
        }
    }
    writer.flush()?;
    info!(count, "recording finished");
    Ok(())
}

fn ensure_new_file(path: &str) -> Result<()> {
    if std::path::Path::new(path).exists() {
        bail!("refusing to overwrite existing file: {path}");
    }
    Ok(())
}

async fn wait_for_new_session(client: SignalrClient) -> Result<bool> {
    let frames = client.listen_raw();
    tokio::pin!(frames);
    while let Some(frame) = frames.next().await {
        if frame_announces_new_session(&frame) {
            return Ok(true);
        }
    }
    Ok(false)
}

fn frame_announces_new_session(frame: &str) -> bool {
    let Some(updates) = signalr::parse_feed(frame) else {
        return false;
    };
    updates
        .iter()
        .any(|update| update.topic == "SessionInfo" && update.data.get("Name").is_some())
}

fn is_recordable_snapshot(initial: &Value) -> bool {
    if let Some(status) = initial
        .pointer("/SessionStatus/Status")
        .and_then(Value::as_str)
    {
        return !matches!(status, "Finished" | "Finalised" | "Ends");
    }

    initial
        .pointer("/SessionInfo/ArchiveStatus/Status")
        .and_then(Value::as_str)
        == Some("Generating")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recordable_snapshot_rejects_ended_archive() {
        assert!(!is_recordable_snapshot(&json!({
            "SessionStatus": { "Status": "Finalised" }
        })));
        assert!(!is_recordable_snapshot(&json!({
            "SessionStatus": { "Status": "Ends" }
        })));
    }

    #[test]
    fn recordable_snapshot_accepts_live_or_pending_session() {
        assert!(is_recordable_snapshot(&json!({
            "SessionStatus": { "Status": "Started" }
        })));
        assert!(is_recordable_snapshot(&json!({
            "SessionStatus": { "Status": "Inactive" }
        })));
        assert!(is_recordable_snapshot(&json!({
            "SessionInfo": { "ArchiveStatus": { "Status": "Generating" } }
        })));
    }

    #[test]
    fn detects_new_session_in_core_or_legacy_frame() {
        let core = format!(
            "{}\u{001e}",
            json!({
                "type": 1,
                "target": "feed",
                "arguments": ["SessionInfo", { "Name": "Practice 1" }, "2026-06-13T10:00:00Z"]
            })
        );
        let legacy = json!({
            "M": [{
                "A": ["SessionInfo", { "Name": "Practice 1" }, "2026-06-13T10:00:00Z"]
            }]
        })
        .to_string();

        assert!(frame_announces_new_session(&core));
        assert!(frame_announces_new_session(&legacy));
        assert!(!frame_announces_new_session(
            &json!({ "type": 6 }).to_string()
        ));
    }
}
