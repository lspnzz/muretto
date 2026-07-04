//! Serve a recorded session over WebSocket so the realtime service can ingest
//! it via `F1_DEV_URL` with no live race. Speaks the same shape the client
//! expects: send the `{"R": ...}` snapshot first, then stream feed frames.

use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result};
use axum::{
    Router,
    extract::State,
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    response::Response,
    routing::get,
};
use tokio::net::TcpListener;
use tracing::{info, warn};

/// Delay between feed frames during replay (~10 Hz, approximating live
/// cadence). `REPLAY_FRAME_DELAY_MS` slows the loop down so transient states
/// — sector yellows, safety cars, pit stops — sit on screen long enough to
/// eyeball in the dashboard. Keep it well below 90 000: the replay sends no
/// keep-alives between frames, so at realtime's `FEED_IDLE_TIMEOUT` (90s) its
/// watchdog presumes the socket dead and the reconnect restarts the replay
/// from frame 0.
fn frame_delay() -> Duration {
    let ms = std::env::var("REPLAY_FRAME_DELAY_MS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(100);
    Duration::from_millis(ms)
}

const ADDRESS: &str = "0.0.0.0:8000";

pub async fn replay(path: &str) -> Result<()> {
    let contents = std::fs::read_to_string(path).context("read recording file")?;
    let lines: Arc<Vec<String>> = Arc::new(
        contents
            .lines()
            .filter(|l| !l.trim().is_empty())
            .map(str::to_string)
            .collect(),
    );
    info!(frames = lines.len(), "loaded recording");

    let app = Router::new()
        .route("/ws", get(ws_handler))
        .with_state(lines);
    let listener = TcpListener::bind(ADDRESS).await?;
    info!(%ADDRESS, "replay server listening on /ws (set F1_DEV_URL=ws://localhost:8000/ws)");
    axum::serve(listener, app).await?;
    Ok(())
}

async fn ws_handler(ws: WebSocketUpgrade, State(lines): State<Arc<Vec<String>>>) -> Response {
    ws.on_upgrade(move |socket| stream_recording(socket, lines))
}

async fn stream_recording(mut socket: WebSocket, lines: Arc<Vec<String>>) {
    info!("replay client connected");
    let frame_delay = frame_delay();
    let mut iter = lines.iter();

    // First line is the `{"R": ...}` snapshot — send it as the subscribe reply.
    if let Some(initial) = iter.next()
        && socket
            .send(Message::Text(initial.clone().into()))
            .await
            .is_err()
    {
        return;
    }

    for frame in iter {
        if socket
            .send(Message::Text(frame.clone().into()))
            .await
            .is_err()
        {
            warn!("replay client disconnected");
            return;
        }
        tokio::time::sleep(frame_delay).await;
    }
    info!("replay finished; closing");
    let _ = socket.send(Message::Close(None)).await;
}
