//! Record a live session to a line-delimited file.

use std::io::{BufWriter, Write};

use anyhow::{Context, Result, bail};
use futures::StreamExt;
use realtime::config;
use realtime::signalr;
use serde_json::json;
use tracing::info;

pub async fn save(path: &str) -> Result<()> {
    if std::path::Path::new(path).exists() {
        bail!("refusing to overwrite existing file: {path}");
    }
    let file = std::fs::File::create(path).context("create recording file")?;
    let mut writer = BufWriter::new(file);

    let mut client = signalr::connect(config::F1_SIGNALR_URL, config::F1_HUB, None).await?;
    let initial = client.subscribe(config::TOPICS).await?;

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
