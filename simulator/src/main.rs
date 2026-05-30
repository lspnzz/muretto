//! Record and replay F1 sessions for offline development.
//!
//! Usage:
//!   simulator save   <file>   # connect to the live feed and record to <file>
//!   simulator replay <file>   # serve the recording over ws for F1_DEV_URL
//!
//! Recording format: one JSON message per line. The first line is the initial
//! snapshot wrapped as `{"R": <initial>}`; the rest are raw feed frames.

mod replay;
mod save;

use tracing_subscriber::{EnvFilter, fmt, prelude::*};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(fmt::layer())
        .with(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("simulator=info")),
        )
        .init();

    let mut args = std::env::args().skip(1);
    let command = args.next();
    let path = args.next();

    match (command.as_deref(), path) {
        (Some("save"), Some(path)) => save::save(&path).await,
        (Some("replay"), Some(path)) => replay::replay(&path).await,
        _ => {
            eprintln!("usage: simulator <save|replay> <file>");
            std::process::exit(2);
        }
    }
}
