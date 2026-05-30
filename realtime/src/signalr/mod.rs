//! A minimal hand-rolled SignalR 1.5 client for F1's live-timing feed.
//!
//! F1 runs an old ASP.NET SignalR server with a custom shape, so there's no
//! off-the-shelf crate. The flow is: HTTP `negotiate` to get a connection token
//! and cookie, open a WebSocket to `connect`, invoke `Subscribe` with the topic
//! list, then read `feed` messages off the socket.
//!
//! When `F1_DEV_URL` is set the client connects straight to that WebSocket
//! (the local replay simulator) and skips negotiation — the replay server speaks
//! the same subscribe/response/feed shape, so downstream code is identical.

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
}

#[derive(Deserialize)]
struct Negotiation {
    #[serde(rename = "ConnectionToken")]
    connection_token: String,
}

/// SignalR client-to-server invocation envelope (`Subscribe`).
#[derive(Serialize)]
struct Invoke {
    #[serde(rename = "H")]
    hub: String,
    #[serde(rename = "M")]
    method: String,
    #[serde(rename = "A")]
    args: Vec<Value>,
    #[serde(rename = "I")]
    id: i64,
}

/// Connect to the feed (or the dev replay endpoint) and return a ready client.
pub async fn connect(base_url: &str, hub: &str, dev_url: Option<&str>) -> Result<SignalrClient> {
    if let Some(dev) = dev_url {
        debug!(dev, "connecting to dev replay endpoint");
        let request = dev.into_client_request()?;
        let (stream, _) = connect_async(request).await.context("dev ws connect")?;
        return Ok(SignalrClient {
            hub: hub.to_string(),
            stream,
        });
    }

    let connection_data = json!([{ "name": hub }]).to_string();
    let negotiation = negotiate(base_url, &connection_data).await?;

    let mut url = Url::parse_with_params(
        &format!("https://{base_url}/connect"),
        &[
            ("clientProtocol", "1.5"),
            ("transport", "webSockets"),
            ("connectionToken", &negotiation.connection_token),
            ("connectionData", &connection_data),
        ],
    )?;
    url.set_scheme("wss")
        .map_err(|_| anyhow::anyhow!("failed to set wss scheme"))?;

    let mut request = url.as_str().into_client_request()?;
    let headers = request.headers_mut();
    headers.insert("User-Agent", "BestHTTP".parse()?);
    headers.insert("Accept-Encoding", "gzip,identity".parse()?);

    let (stream, _) = connect_async(request).await.context("f1 ws connect")?;
    Ok(SignalrClient {
        hub: hub.to_string(),
        stream,
    })
}

/// HTTP `negotiate` handshake — returns the connection token.
async fn negotiate(base_url: &str, connection_data: &str) -> Result<Negotiation> {
    let client = reqwest::Client::new();
    let response = client
        .get(format!("https://{base_url}/negotiate"))
        .query(&[
            ("clientProtocol", "1.5"),
            ("connectionData", connection_data),
        ])
        .send()
        .await
        .context("negotiate request")?
        .error_for_status()?;

    response
        .json::<Negotiation>()
        .await
        .context("negotiate json")
}

impl SignalrClient {
    /// Invoke `Subscribe` with the topic list and return the initial snapshot
    /// (the `R` field of the response), a `{ "<Topic>": <data> }` object.
    pub async fn subscribe(&mut self, topics: &[&str]) -> Result<Value> {
        let invoke = Invoke {
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

    /// Stream parsed `feed` updates until the socket closes. Non-feed frames
    /// (keep-alives, acks) and parse failures are skipped, not fatal.
    pub fn listen(self) -> impl Stream<Item = Vec<UpdateArgs>> {
        self.stream.filter_map(|message| async move {
            let text = match message {
                Ok(Message::Text(text)) => text,
                Ok(_) => return None,
                Err(e) => {
                    warn!(?e, "ws read error");
                    return None;
                }
            };
            parse_feed(&text)
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

/// Parse a SignalR message frame into feed updates, if it carries any.
/// Shape: `{ "M": [ { "A": [topic, data, timestamp] }, ... ] }`.
fn parse_feed(text: &str) -> Option<Vec<UpdateArgs>> {
    let value: Value = serde_json::from_str(text).ok()?;
    let messages = value.get("M")?.as_array()?;
    let mut updates = Vec::new();
    for message in messages {
        let Some(args) = message.get("A").and_then(Value::as_array) else {
            continue;
        };
        if args.len() < 3 {
            continue;
        }
        let (Some(topic), Some(timestamp)) = (args[0].as_str(), args[2].as_str()) else {
            continue;
        };
        updates.push(UpdateArgs {
            topic: topic.to_string(),
            data: args[1].clone(),
            timestamp: timestamp.to_string(),
        });
    }
    (!updates.is_empty()).then_some(updates)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_feed_message() {
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
    fn ignores_non_feed_frames() {
        assert!(parse_feed(&json!({ "I": "1", "R": {} }).to_string()).is_none());
        assert!(parse_feed("{}").is_none());
        assert!(parse_feed("not json").is_none());
    }
}
