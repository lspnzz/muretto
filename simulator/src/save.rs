//! Record live sessions to line-delimited files, hardened for unattended
//! weekend recording:
//!
//! - **Reconnects** when the socket drops or goes silent, and folds the fresh
//!   snapshot into the file as synthetic feed frames so replays don't carry a
//!   state gap.
//! - **Rotates** to a numbered sibling file when the feed announces a new
//!   session — the recorder's mirror of ingest's sessions-never-blend rule.
//! - **Flushes on SIGINT/SIGTERM**, so Ctrl-C and `docker stop` both end the
//!   recording with an intact tail.

use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::{Context, Result, bail};
use futures::StreamExt;
use realtime::config;
use realtime::signalr::{self, SignalrClient};
use serde_json::{Value, json};
use tracing::{info, warn};

const RECONNECT_DELAY: Duration = Duration::from_secs(2);

/// The live feed sends keep-alives every ~15s even between sessions; a socket
/// silent for this long is half-open (dead NAT/wifi path) and must be redialed
/// — it would otherwise hang the recording forever without erroring.
const IDLE_TIMEOUT: Duration = Duration::from_secs(90);

/// Timestamp marker on synthetic catch-up frames, where a feed-origin
/// timestamp doesn't exist. Nothing downstream reads feed timestamps; the
/// marker keeps the frames honest for humans inspecting a recording.
const CATCHUP_TIMESTAMP: &str = "catch-up";

/// Why the current connection stopped yielding frames.
enum SessionEnd {
    /// `SessionInfo` with a `Name` arrived — rotate to a new file, exactly
    /// where ingest reconnects and resets `State`.
    NewSession,
    /// The socket closed, errored, or went idle — reconnect, same file.
    Disconnected,
}

pub async fn save(path: &str) -> Result<()> {
    let mut segments = Segments::new(path);
    let mut writer = segments.create_next()?;

    // First connect stays outside the retry loop: configuration and network
    // errors should fail the command loudly, not retry forever.
    let (client, initial) = connect_live().await?;
    writeln!(writer, "{}", json!({ "R": initial }))?;
    let mut session = session_id(&initial);
    info!(path = %segments.current().display(), session = session.as_deref(), "recording");

    let shutdown = shutdown_signal();
    tokio::pin!(shutdown);
    let mut client = client;

    loop {
        let end = tokio::select! {
            _ = &mut shutdown => break,
            end = record_frames(client, &mut writer) => end?,
        };

        let reconnected = tokio::select! {
            _ = &mut shutdown => break,
            pair = reconnect_with_retry() => pair,
        };
        let (fresh_client, fresh_initial) = reconnected;
        let fresh_session = session_id(&fresh_initial);

        // Rotate on an announced session change, and also when the session
        // changed *during* the gap (the announcement happened while we were
        // offline, so only the snapshot identity can tell us).
        if matches!(end, SessionEnd::NewSession) || fresh_session != session {
            writer.flush()?;
            writer = segments.create_next()?;
            writeln!(writer, "{}", json!({ "R": fresh_initial }))?;
            session = fresh_session;
            info!(path = %segments.current().display(), session = session.as_deref(), "new session; rotated recording");
        } else {
            write_catchup(&mut writer, &fresh_initial)?;
            info!("reconnected mid-session; wrote catch-up snapshot frames");
        }
        client = fresh_client;
    }

    writer.flush()?;
    info!(path = %segments.current().display(), "recording stopped");
    Ok(())
}

/// Stream raw frames into the writer until the socket ends, goes idle, or a
/// new session is announced. Frames are written verbatim — detection parses a
/// copy, the file stays exactly what the wire carried.
async fn record_frames(client: SignalrClient, writer: &mut BufWriter<File>) -> Result<SessionEnd> {
    let frames = client.listen_raw();
    tokio::pin!(frames);
    let mut count = 0u64;
    loop {
        let frame = match tokio::time::timeout(IDLE_TIMEOUT, frames.next()).await {
            Err(_) => {
                writer.flush()?;
                warn!(
                    count,
                    "no frames for {IDLE_TIMEOUT:?}; treating socket as dead"
                );
                return Ok(SessionEnd::Disconnected);
            }
            Ok(None) => {
                writer.flush()?;
                info!(count, "socket closed");
                return Ok(SessionEnd::Disconnected);
            }
            Ok(Some(frame)) => frame,
        };

        writeln!(writer, "{frame}")?;
        count += 1;
        if count.is_multiple_of(100) {
            writer.flush()?;
            info!(count, "recording");
        }
        if announces_new_session(&frame) {
            writer.flush()?;
            info!(count, "feed announced a new session");
            return Ok(SessionEnd::NewSession);
        }
    }
}

/// Same rule as ingest: a `SessionInfo` update carrying a `Name` starts a new
/// session. Uses the shared parser so both shapes (Core live, legacy replay)
/// are covered.
fn announces_new_session(frame: &str) -> bool {
    signalr::parse_feed(frame).is_some_and(|updates| {
        updates
            .iter()
            .any(|u| u.topic == "SessionInfo" && u.data.get("Name").is_some())
    })
}

/// Identity of the session a snapshot belongs to. `Path` is unique per
/// session (`2026/2026-06-14_…_Grand_Prix/2026-06-14_Race/`); fall back to
/// `Name` if it's missing. `None` compares equal to `None`, which is the
/// conservative don't-rotate behavior for snapshots with no `SessionInfo`.
fn session_id(initial: &Value) -> Option<String> {
    let info = initial.get("SessionInfo")?;
    info.get("Path")
        .or_else(|| info.get("Name"))?
        .as_str()
        .map(str::to_string)
}

/// After an unplanned reconnect, fold the fresh snapshot into the same file as
/// one synthetic legacy feed frame carrying full per-topic state: on replay it
/// merges over whatever the gap missed. (A second `{"R": …}` line would be
/// skipped as a non-feed frame, so the snapshot has to travel as feed
/// messages.) `SessionInfo` is excluded — replaying it would re-trigger
/// ingest's new-session reconnect and loop the file forever; a *changed*
/// session rotates to a new file instead (see `save`).
fn write_catchup(writer: &mut impl Write, initial: &Value) -> Result<()> {
    let Value::Object(topics) = initial else {
        bail!("initial snapshot was not an object");
    };
    let messages: Vec<Value> = topics
        .iter()
        .filter(|(topic, _)| topic.as_str() != "SessionInfo")
        .map(|(topic, data)| {
            json!({ "H": config::F1_HUB, "M": "feed", "A": [topic, data, CATCHUP_TIMESTAMP] })
        })
        .collect();
    writeln!(writer, "{}", json!({ "M": messages }))?;
    Ok(())
}

async fn connect_live() -> Result<(SignalrClient, Value)> {
    let mut client = signalr::connect(config::F1_SIGNALR_URL, config::F1_HUB, None).await?;
    let initial = client.subscribe(config::TOPICS).await?;
    Ok((client, initial))
}

/// Retry until the feed accepts us again — transient network failures during
/// a race weekend must not kill an unattended recording. Interruptible: the
/// caller races this against the shutdown signal.
async fn reconnect_with_retry() -> (SignalrClient, Value) {
    loop {
        tokio::time::sleep(RECONNECT_DELAY).await;
        match connect_live().await {
            Ok(pair) => return pair,
            Err(e) => warn!(?e, "reconnect failed; retrying"),
        }
    }
}

/// Resolves on SIGINT or SIGTERM. `docker stop` delivers SIGTERM to PID 1
/// (the recorder, in the simulator image); unhandled, that is a 10s hang, a
/// SIGKILL, and a truncated buffer tail.
async fn shutdown_signal() {
    let ctrl_c = tokio::signal::ctrl_c();
    #[cfg(unix)]
    {
        use tokio::signal::unix::{SignalKind, signal};
        let mut term = signal(SignalKind::terminate()).expect("installing the SIGTERM handler");
        tokio::select! {
            _ = ctrl_c => {}
            _ = term.recv() => {}
        }
    }
    #[cfg(not(unix))]
    {
        let _ = ctrl_c.await;
    }
}

/// Numbered sibling files for one recording run: `montreal.data.jsonl`, then
/// `montreal.data.2.jsonl`, … — one file per session, and never overwrite.
struct Segments {
    base: PathBuf,
    index: u32,
}

impl Segments {
    fn new(path: &str) -> Self {
        Self {
            base: PathBuf::from(path),
            index: 0,
        }
    }

    fn current(&self) -> PathBuf {
        Self::numbered(&self.base, self.index)
    }

    fn create_next(&mut self) -> Result<BufWriter<File>> {
        self.index += 1;
        let path = self.current();
        if path.exists() {
            bail!("refusing to overwrite existing file: {}", path.display());
        }
        let file = File::create(&path)
            .with_context(|| format!("create recording file {}", path.display()))?;
        Ok(BufWriter::new(file))
    }

    /// `.N` goes before the extension so rotated files keep matching the
    /// `*.data.*` gitignore convention for recordings.
    fn numbered(base: &Path, index: u32) -> PathBuf {
        if index <= 1 {
            return base.to_path_buf();
        }
        match base.extension().and_then(|e| e.to_str()) {
            Some(ext) => base.with_extension(format!("{index}.{ext}")),
            None => base.with_extension(index.to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn segment_names_keep_the_data_infix() {
        let base = Path::new("recordings/montreal.data.jsonl");
        assert_eq!(Segments::numbered(base, 1), base);
        assert_eq!(
            Segments::numbered(base, 2),
            Path::new("recordings/montreal.data.2.jsonl")
        );
        assert_eq!(
            Segments::numbered(Path::new("plain"), 3),
            Path::new("plain.3")
        );
    }

    #[test]
    fn announces_new_session_matches_ingest_rule() {
        let legacy_with_name = json!({
            "M": [{ "H": "Streaming", "M": "feed", "A": ["SessionInfo", { "Name": "Race" }, "t"] }]
        })
        .to_string();
        assert!(announces_new_session(&legacy_with_name));

        let core_with_name = json!({
            "type": 1, "target": "feed",
            "arguments": ["SessionInfo", { "Name": "Qualifying" }, "t"]
        })
        .to_string();
        assert!(announces_new_session(&core_with_name));

        let no_name = json!({
            "M": [{ "H": "Streaming", "M": "feed", "A": ["SessionInfo", { "ArchiveStatus": {} }, "t"] }]
        })
        .to_string();
        assert!(!announces_new_session(&no_name));

        let other_topic = json!({
            "M": [{ "H": "Streaming", "M": "feed", "A": ["TimingData", { "Lines": {} }, "t"] }]
        })
        .to_string();
        assert!(!announces_new_session(&other_topic));

        assert!(!announces_new_session(r#"{"type":6}"#)); // keep-alive
    }

    #[test]
    fn session_id_prefers_path_over_name() {
        let snapshot = json!({ "SessionInfo": { "Path": "2026/x/Race/", "Name": "Race" } });
        assert_eq!(session_id(&snapshot).as_deref(), Some("2026/x/Race/"));

        let name_only = json!({ "SessionInfo": { "Name": "Race" } });
        assert_eq!(session_id(&name_only).as_deref(), Some("Race"));

        assert_eq!(session_id(&json!({})), None);
    }

    #[test]
    fn catchup_frames_replay_through_the_feed_parser_without_sessioninfo() {
        let initial = json!({
            "SessionInfo": { "Name": "Race", "Path": "2026/x/Race/" },
            "TimingData": { "Lines": { "44": { "Position": "1" } } },
            "CarData.z": "abc123",
        });
        let mut buf = Vec::new();
        write_catchup(&mut buf, &initial).unwrap();
        let line = String::from_utf8(buf).unwrap();

        let updates = signalr::parse_feed(line.trim()).expect("catch-up parses as feed frames");
        let topics: Vec<&str> = updates.iter().map(|u| u.topic.as_str()).collect();
        assert!(topics.contains(&"TimingData"));
        assert!(topics.contains(&"CarData.z")); // compressed payload travels verbatim
        assert!(!topics.contains(&"SessionInfo"));

        let timing = updates
            .iter()
            .find(|u| u.topic == "TimingData")
            .map(|u| &u.data)
            .unwrap();
        assert_eq!(timing["Lines"]["44"]["Position"], json!("1"));
        assert!(!announces_new_session(line.trim()));
    }
}
