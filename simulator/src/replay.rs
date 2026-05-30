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

/// Delay between feed frames during replay (~10 Hz, approximating live cadence).
const FRAME_DELAY: Duration = Duration::from_millis(100);

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
        tokio::time::sleep(FRAME_DELAY).await;
    }
    info!("replay finished; closing");
    let _ = socket.send(Message::Close(None)).await;
}
