//! HTTP/SSE server. Streams the live state to browsers: a full `initial`
//! snapshot on connect, then `update` deltas off the broadcast channel. A
//! subscriber that lags past the channel buffer is resynced with a fresh
//! snapshot rather than silently dropping data.

use std::convert::Infallible;
use std::sync::Arc;

use axum::{
    Json, Router,
    extract::State as AxumState,
    response::sse::{Event, KeepAlive, Sse},
    routing::get,
};
use futures::Stream;
use serde_json::{Value, json};
use tokio::net::TcpListener;
use tokio::sync::{RwLock, broadcast};
use tokio_util::sync::CancellationToken;
use tower_http::cors::{Any, CorsLayer};
use tracing::{debug, info, warn};

use crate::model::State;

/// Shared server state: the canonical state and the update broadcaster.
#[derive(Clone)]
pub struct Context {
    pub state: Arc<RwLock<State>>,
    pub tx: broadcast::Sender<String>,
}

/// Build the router with CORS configured from the given origins.
pub fn router(ctx: Context, origins: &[String]) -> Router {
    let cors = if origins.is_empty() {
        CorsLayer::new().allow_origin(Any)
    } else {
        let parsed = origins
            .iter()
            .filter_map(|o| o.parse().ok())
            .collect::<Vec<_>>();
        CorsLayer::new().allow_origin(parsed)
    };

    Router::new()
        .route("/api/health", get(health))
        .route("/api/current", get(current))
        .route("/api/realtime", get(sse))
        .layer(cors)
        .with_state(ctx)
}

/// Bind and serve until the cancellation token fires (graceful shutdown).
pub async fn serve(
    ctx: Context,
    address: &str,
    origins: &[String],
    cancel: CancellationToken,
) -> anyhow::Result<()> {
    let listener = TcpListener::bind(address).await?;
    info!(%address, "http server listening");
    axum::serve(listener, router(ctx, origins))
        .with_graceful_shutdown(async move { cancel.cancelled().await })
        .await?;
    Ok(())
}

async fn health() -> Json<Value> {
    Json(json!({ "ok": true }))
}

async fn current(AxumState(ctx): AxumState<Context>) -> Json<Value> {
    let snapshot = serde_json::to_value(&*ctx.state.read().await).unwrap_or_else(|_| json!({}));
    Json(snapshot)
}

async fn sse(
    AxumState(ctx): AxumState<Context>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let mut rx = ctx.tx.subscribe();
    debug!(
        subscribers = ctx.tx.receiver_count(),
        "sse client connected"
    );

    let stream = async_stream::stream! {
        yield Ok(Event::default().event("initial").data(snapshot(&ctx).await));

        loop {
            match rx.recv().await {
                Ok(payload) => yield Ok(Event::default().event("update").data(payload)),
                Err(broadcast::error::RecvError::Lagged(skipped)) => {
                    warn!(skipped, "sse subscriber lagged; resyncing with snapshot");
                    yield Ok(Event::default().event("initial").data(snapshot(&ctx).await));
                }
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    };

    Sse::new(stream).keep_alive(KeepAlive::default())
}

/// Current state serialized to a JSON string for an SSE payload.
async fn snapshot(ctx: &Context) -> String {
    let value = serde_json::to_value(&*ctx.state.read().await).unwrap_or_else(|_| json!({}));
    serde_json::to_string(&value).unwrap_or_else(|_| "{}".to_string())
}
