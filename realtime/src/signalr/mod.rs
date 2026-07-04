//! A minimal hand-rolled SignalR client for F1's live-timing feed.
//!
//! F1 now serves the live feed over SignalR Core. The live flow is: POST
//! `negotiate` to get a connection token and cookie, open a WebSocket with that
//! token, send the JSON protocol handshake, invoke `Subscribe` with the topic
//! list, then read `feed` messages off the socket.
//!
//! When `F1_DEV_URL` is set the client connects straight to that WebSocket
//! (the local replay simulator) and skips negotiation. The replay simulator
//! still speaks the legacy SignalR shape because existing recordings use it.

use std::time::Duration;

use anyhow::{Context, Result, bail};
use futures::{SinkExt, Stream, StreamExt};
use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::protocol::Message;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, connect_async};
use tracing::{debug, warn};

const RECORD_SEPARATOR: char = '\u{001e}';

/// Cap on the whole connect flow (negotiate → WebSocket → handshake). Each
/// step awaits a network reply that can otherwise stall forever — negotiate
/// has no request timeout of its own.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(30);

/// Cap on `Subscribe`. Deliberately wider than [`CONNECT_TIMEOUT`]: the
/// completion frame carries the full initial snapshot for every topic, which
/// a slow link legitimately takes a while to deliver — but a completion that
/// never arrives must not hang the caller forever.
const SUBSCRIBE_TIMEOUT: Duration = Duration::from_secs(60);

type WsStream = WebSocketStream<MaybeTlsStream<TcpStream>>;

/// One `feed` update: the topic, its payload, and the feed timestamp.
#[derive(Debug, Clone)]
pub struct UpdateArgs {
    pub topic: String,
    pub data: Value,
    pub timestamp: String,
}

pub struct SignalrClient {
    hub: String,
    stream: WsStream,
    protocol: Protocol,
}

enum Protocol {
    Core,
    Legacy,
}

#[derive(Deserialize)]
struct Negotiation {
    #[serde(rename = "connectionToken")]
    connection_token: String,
}

/// Legacy SignalR client-to-server invocation envelope (`Subscribe`).
#[derive(Serialize)]
struct LegacyInvoke {
    #[serde(rename = "H")]
    hub: String,
    #[serde(rename = "M")]
    method: String,
    #[serde(rename = "A")]
    args: Vec<Value>,
    #[serde(rename = "I")]
    id: i64,
}

/// SignalR Core protocol handshake.
#[derive(Serialize)]
struct CoreHandshake {
    protocol: &'static str,
    version: i32,
}

/// SignalR Core client-to-server invocation envelope (`Subscribe`).
#[derive(Serialize)]
struct CoreInvoke {
    #[serde(rename = "type")]
    message_type: i32,
    #[serde(rename = "invocationId")]
    invocation_id: String,
    target: String,
    arguments: Vec<Value>,
}

/// Connect to the feed (or the dev replay endpoint) and return a ready
/// client. The whole flow is capped by [`CONNECT_TIMEOUT`] so a stalled
/// negotiate or handshake can't hang callers — ingest and the simulator's
/// recorder both connect through here.
pub async fn connect(base_url: &str, hub: &str, dev_url: Option<&str>) -> Result<SignalrClient> {
    tokio::time::timeout(CONNECT_TIMEOUT, connect_inner(base_url, hub, dev_url))
        .await
        .context("connect timed out")?
}

async fn connect_inner(base_url: &str, hub: &str, dev_url: Option<&str>) -> Result<SignalrClient> {
    if let Some(dev) = dev_url {
        debug!(dev, "connecting to dev replay endpoint");
        let request = dev.into_client_request()?;
        let (stream, _) = connect_async(request).await.context("dev ws connect")?;
        return Ok(SignalrClient {
            hub: hub.to_string(),
            stream,
            protocol: Protocol::Legacy,
        });
    }

    let negotiation = negotiate(base_url).await?;

    let mut url = Url::parse_with_params(
        &format!("https://{base_url}"),
        &[("id", negotiation.connection_token.as_str())],
    )?;
    url.set_scheme("wss")
        .map_err(|_| anyhow::anyhow!("failed to set wss scheme"))?;

    let mut request = url.as_str().into_client_request()?;
    let headers = request.headers_mut();
    headers.insert("User-Agent", "BestHTTP".parse()?);
    headers.insert("Accept-Encoding", "gzip,identity".parse()?);
    if let Some(cookie) = negotiation.cookie {
        headers.insert("Cookie", cookie.parse()?);
    }

    let (mut stream, _) = connect_async(request).await.context("f1 ws connect")?;
    send_core_handshake(&mut stream).await?;

    Ok(SignalrClient {
        hub: hub.to_string(),
        stream,
        protocol: Protocol::Core,
    })
}

struct NegotiatedConnection {
    connection_token: String,
    cookie: Option<String>,
}

/// HTTP `negotiate` handshake — returns the connection token and affinity cookie.
async fn negotiate(base_url: &str) -> Result<NegotiatedConnection> {
    let client = reqwest::Client::new();
    let response = client
        .post(format!("https://{base_url}/negotiate"))
        .query(&[("negotiateVersion", "1")])
        .send()
        .await
        .context("negotiate request")?
        .error_for_status()?;

    let cookie = response
        .headers()
        .get_all(reqwest::header::SET_COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .find_map(aws_alb_cors_cookie);
    let body = response
        .json::<Negotiation>()
        .await
        .context("negotiate json")?;

    Ok(NegotiatedConnection {
        connection_token: body.connection_token,
        cookie,
    })
}

fn aws_alb_cors_cookie(header: &str) -> Option<String> {
    let value = header.split(';').next()?;
    value.starts_with("AWSALBCORS=").then(|| value.to_string())
}

async fn send_core_handshake(stream: &mut WsStream) -> Result<()> {
    let payload = framed_json(&CoreHandshake {
        protocol: "json",
        version: 1,
    })?;

    debug!("sending signalr core handshake");
    stream
        .send(Message::Text(payload.into()))
        .await
        .context("send core handshake")?;

    while let Some(message) = stream.next().await {
        let message = message.context("ws read during core handshake")?;
        let Message::Text(text) = message else {
            continue;
        };

        for frame in split_frames(&text) {
            debug!(%frame, "received signalr core handshake frame");
            if frame.trim() == "{}" {
                debug!("signalr core handshake complete");
                return Ok(());
            }
        }
    }

    bail!("connection closed before core handshake response")
}

fn framed_json<T: Serialize>(value: &T) -> Result<String> {
    Ok(format!(
        "{}{RECORD_SEPARATOR}",
        serde_json::to_string(value)?
    ))
}

impl SignalrClient {
    /// Invoke `Subscribe` with the topic list and return the initial snapshot
    /// (the `R` field of the response), a `{ "<Topic>": <data> }` object.
    /// Capped by [`SUBSCRIBE_TIMEOUT`] — a hub that never completes the
    /// invocation must fail the cycle, not hang it.
    pub async fn subscribe(&mut self, topics: &[&str]) -> Result<Value> {
        let subscribe = async {
            match self.protocol {
                Protocol::Core => self.subscribe_core(topics).await,
                Protocol::Legacy => self.subscribe_legacy(topics).await,
            }
        };
        tokio::time::timeout(SUBSCRIBE_TIMEOUT, subscribe)
            .await
            .context("subscribe timed out")?
    }

    /// Stream received frames until the socket closes or errors, parsed as
    /// `feed` updates. Non-feed frames (keep-alives, acks) and parse failures
    /// yield an **empty batch** rather than being skipped: every yielded item
    /// proves the socket is alive, which is what lets ingest's idle watchdog
    /// read prolonged silence as a dead connection. A read *error* is the
    /// opposite of liveness, so it ends the stream instead of feeding it.
    pub fn listen(self) -> impl Stream<Item = Vec<UpdateArgs>> {
        self.stream
            .take_while(|message| {
                if let Err(e) = message {
                    warn!(?e, "ws read error; ending the session");
                }
                futures::future::ready(message.is_ok())
            })
            .map(|message| match message {
                Ok(Message::Text(text)) => parse_feed(&text).unwrap_or_default(),
                _ => Vec::new(),
            })
    }

    /// Stream raw text frames unparsed — used by the simulator to record a
    /// session verbatim.
    pub fn listen_raw(self) -> impl Stream<Item = String> {
        self.stream.filter_map(|message| async move {
            match message {
                Ok(Message::Text(text)) => Some(text.to_string()),
                _ => None,
            }
        })
    }
}

impl SignalrClient {
    async fn subscribe_core(&mut self, topics: &[&str]) -> Result<Value> {
        let invoke = CoreInvoke {
            message_type: 1,
            invocation_id: "1".to_string(),
            target: "Subscribe".to_string(),
            arguments: vec![json!(topics)],
        };
        self.stream
            .send(Message::Text(framed_json(&invoke)?.into()))
            .await
            .context("send subscribe")?;
        debug!("sent signalr core subscribe");

        while let Some(message) = self.stream.next().await {
            let message = message.context("ws read during subscribe")?;
            let Message::Text(text) = message else {
                continue;
            };

            for frame in split_frames(&text) {
                let value: Value = serde_json::from_str(frame)?;
                debug!(
                    message_type = ?value.get("type").and_then(|value| value.as_i64()),
                    invocation_id = ?value.get("invocationId").and_then(|value| value.as_str()),
                    target = ?value.get("target").and_then(|value| value.as_str()),
                    "received signalr core subscribe frame"
                );
                if let Some(completion) = subscribe_completion(&value) {
                    return completion;
                }
            }
        }

        bail!("connection closed before subscribe response")
    }

    async fn subscribe_legacy(&mut self, topics: &[&str]) -> Result<Value> {
        let invoke = LegacyInvoke {
            hub: self.hub.clone(),
            method: "Subscribe".to_string(),
            args: vec![json!(topics)],
            id: 1,
        };
        self.stream
            .send(Message::Text(serde_json::to_string(&invoke)?.into()))
            .await
            .context("send subscribe")?;

        // Read until the invocation result (the message carrying `R`) arrives.
        while let Some(message) = self.stream.next().await {
            let message = message.context("ws read during subscribe")?;
            let Message::Text(text) = message else {
                continue;
            };
            let value: Value = serde_json::from_str(&text)?;
            if let Some(initial) = value.get("R") {
                return Ok(initial.clone());
            }
        }
        bail!("connection closed before subscribe response")
    }
}

/// Interpret one Core frame as the `Subscribe` completion. `Some(Ok)` carries
/// the initial snapshot; `Some(Err)` means the hub failed the invocation —
/// rejected it, or completed with a missing/`null` result. Either way no
/// usable snapshot is ever coming, so the connect cycle must abort rather
/// than wait forever. `None` is an unrelated frame (keep-alive, feed
/// message, other invocation).
fn subscribe_completion(value: &Value) -> Option<Result<Value>> {
    if value.get("type").and_then(Value::as_i64) != Some(3)
        || value.get("invocationId").and_then(Value::as_str) != Some("1")
    {
        return None;
    }
    if let Some(initial) = value.get("result").filter(|result| !result.is_null()) {
        return Some(Ok(initial.clone()));
    }
    let error = value
        .get("error")
        .and_then(Value::as_str)
        .unwrap_or("completion carried no result");
    Some(Err(anyhow::anyhow!("subscribe rejected: {error}")))
}

/// Parse a SignalR message frame into feed updates, if it carries any.
/// Core shape: `{ "type": 1, "target": "feed", "arguments": [topic, data, timestamp] }`.
/// Legacy replay shape: `{ "M": [ { "A": [topic, data, timestamp] }, ... ] }`.
pub fn parse_feed(text: &str) -> Option<Vec<UpdateArgs>> {
    parse_core_feed(text).or_else(|| parse_legacy_feed(text))
}

fn parse_core_feed(text: &str) -> Option<Vec<UpdateArgs>> {
    let mut updates = Vec::new();

    for frame in split_frames(text) {
        let value: Value = serde_json::from_str(frame).ok()?;
        if value.get("type").and_then(Value::as_i64) != Some(1)
            || value.get("target").and_then(Value::as_str) != Some("feed")
        {
            continue;
        }

        let Some(args) = value.get("arguments").and_then(Value::as_array) else {
            continue;
        };
        push_update(&mut updates, args);
    }

    (!updates.is_empty()).then_some(updates)
}

fn parse_legacy_feed(text: &str) -> Option<Vec<UpdateArgs>> {
    let value: Value = serde_json::from_str(text).ok()?;
    let messages = value.get("M")?.as_array()?;
    let mut updates = Vec::new();
    for message in messages {
        let Some(args) = message.get("A").and_then(Value::as_array) else {
            continue;
        };
        push_update(&mut updates, args);
    }
    (!updates.is_empty()).then_some(updates)
}

fn split_frames(text: &str) -> impl Iterator<Item = &str> {
    text.split(RECORD_SEPARATOR)
        .map(str::trim)
        .filter(|frame| !frame.is_empty())
}

fn push_update(updates: &mut Vec<UpdateArgs>, args: &[Value]) {
    if args.len() < 3 {
        return;
    }
    let (Some(topic), Some(timestamp)) = (args[0].as_str(), args[2].as_str()) else {
        return;
    };
    updates.push(UpdateArgs {
        topic: topic.to_string(),
        data: args[1].clone(),
        timestamp: timestamp.to_string(),
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_legacy_feed_message() {
        let frame = json!({
            "M": [
                { "H": "Streaming", "M": "feed", "A": ["TimingData", { "Lines": {} }, "2024-01-01T00:00:00Z"] },
                { "H": "Streaming", "M": "feed", "A": ["TrackStatus", { "Status": "1" }, "2024-01-01T00:00:01Z"] }
            ]
        })
        .to_string();

        let updates = parse_feed(&frame).unwrap();
        assert_eq!(updates.len(), 2);
        assert_eq!(updates[0].topic, "TimingData");
        assert_eq!(updates[1].topic, "TrackStatus");
        assert_eq!(updates[1].timestamp, "2024-01-01T00:00:01Z");
    }

    #[test]
    fn parses_core_feed_message() {
        let frame = format!(
            "{}{RECORD_SEPARATOR}{}{RECORD_SEPARATOR}",
            json!({ "type": 6 }),
            json!({
                "type": 1,
                "target": "feed",
                "arguments": ["TimingData", { "Lines": {} }, "2024-01-01T00:00:00Z"]
            })
        );

        let updates = parse_feed(&frame).unwrap();
        assert_eq!(updates.len(), 1);
        assert_eq!(updates[0].topic, "TimingData");
        assert_eq!(updates[0].timestamp, "2024-01-01T00:00:00Z");
    }

    #[test]
    fn serializes_core_subscribe_invocation_shape() {
        let invoke = CoreInvoke {
            message_type: 1,
            invocation_id: "1".to_string(),
            target: "Subscribe".to_string(),
            arguments: vec![json!(["TimingData"])],
        };
        let value: Value = serde_json::from_str(
            framed_json(&invoke)
                .unwrap()
                .trim_end_matches(RECORD_SEPARATOR),
        )
        .unwrap();

        assert_eq!(value["type"], 1);
        assert_eq!(value["invocationId"], "1");
        assert!(value.get("invocation_id").is_none());
        assert_eq!(value["target"], "Subscribe");
    }

    #[test]
    fn subscribe_completion_extracts_the_snapshot() {
        let frame = json!({
            "type": 3,
            "invocationId": "1",
            "result": { "TrackStatus": { "Status": "1" } }
        });

        let initial = subscribe_completion(&frame).unwrap().unwrap();

        assert_eq!(initial["TrackStatus"]["Status"], "1");
    }

    #[test]
    fn subscribe_completion_fails_on_an_error_completion() {
        let frame = json!({ "type": 3, "invocationId": "1", "error": "Subscribe failed" });

        let result = subscribe_completion(&frame).unwrap();

        assert!(result.unwrap_err().to_string().contains("Subscribe failed"));
    }

    #[test]
    fn subscribe_completion_fails_on_a_null_result() {
        let frame = json!({ "type": 3, "invocationId": "1", "result": null });

        assert!(subscribe_completion(&frame).unwrap().is_err());
    }

    #[test]
    fn subscribe_completion_ignores_unrelated_frames() {
        let other_invocation = json!({ "type": 3, "invocationId": "2", "result": {} });
        let feed = json!({ "type": 1, "target": "feed", "arguments": [] });

        assert!(subscribe_completion(&json!({ "type": 6 })).is_none());
        assert!(subscribe_completion(&other_invocation).is_none());
        assert!(subscribe_completion(&feed).is_none());
    }

    #[test]
    fn ignores_non_feed_frames() {
        assert!(parse_feed(&json!({ "I": "1", "R": {} }).to_string()).is_none());
        assert!(parse_feed("{}").is_none());
        assert!(parse_feed("not json").is_none());
    }
}
