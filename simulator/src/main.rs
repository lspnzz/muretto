//! Record and replay F1 sessions for offline development.
//!
//! Usage:
//!   simulator save   <file>            # record the live feed (reconnects, rotates per session)
//!   simulator replay <file>            # serve the recording over ws for F1_DEV_URL
//!   simulator trim   <in> <out> <n>    # snapshot + first n frames -> committed fixture
//!
//! Recording format: one JSON message per line. The first line is the initial
//! snapshot wrapped as `{"R": <initial>}`; the rest are raw feed frames.
//! Details: docs/references/f1-feed.md.

mod replay;
mod save;
mod trim;

use anyhow::Context;
use tracing_subscriber::{EnvFilter, fmt, prelude::*};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(fmt::layer())
        .with(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("simulator=info")),
        )
        .init();

    let args: Vec<String> = std::env::args().skip(1).collect();
    let args: Vec<&str> = args.iter().map(String::as_str).collect();

    match args.as_slice() {
        ["save", path] => save::save(path).await,
        ["replay", path] => replay::replay(path).await,
        ["trim", input, output, frames] => {
            let frames: usize = frames.parse().context("frame count must be a number")?;
            trim::trim(input, output, frames)
        }
        _ => {
            eprintln!("usage: simulator save <file> | replay <file> | trim <in> <out> <frames>");
            std::process::exit(2);
        }
    }
}
