use std::sync::Arc;

use tokio::sync::{RwLock, broadcast};
use tokio_util::sync::CancellationToken;
use tracing::info;
use tracing_subscriber::{EnvFilter, fmt, prelude::*};

use realtime::config;
use realtime::ingest;
use realtime::model::State;
use realtime::server::{self, Broadcast, Context};

/// Broadcast channel depth. Large enough that a briefly-slow SSE client rarely
/// lags; if it does, the server resyncs it with a fresh snapshot.
const BROADCAST_CAPACITY: usize = 1024;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(fmt::layer())
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("realtime=info")))
        .init();

    info!("muretto realtime starting");

    let state = Arc::new(RwLock::new(State::default()));
    let (tx, _rx) = broadcast::channel::<Broadcast>(BROADCAST_CAPACITY);
    let cancel = CancellationToken::new();

    let ingest_handle = tokio::spawn(ingest::run_supervised(
        state.clone(),
        tx.clone(),
        cancel.clone(),
    ));

    let ctx = Context {
        state: state.clone(),
        tx: tx.clone(),
    };
    let origins = config::origins();
    let address = config::address();

    tokio::select! {
        result = server::serve(ctx, &address, &origins, cancel.clone()) => {
            if let Err(e) = result {
                tracing::error!(?e, "server error");
            }
        }
        _ = shutdown_signal() => {
            info!("shutdown signal received");
        }
    }

    cancel.cancel();
    let _ = ingest_handle.await;
    info!("shutdown complete");
    Ok(())
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}
