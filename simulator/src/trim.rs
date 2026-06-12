//! Cut the head of a recording into a small fixture: the snapshot line plus
//! the first N frame lines. A head slice is self-consistent because it starts
//! at a real full snapshot; a mid-session slice would need the preceding
//! frames folded into a synthesized snapshot, and is deliberately not
//! supported. Trimmed fixtures go in `simulator/fixtures/` (committed), full
//! recordings stay `*.data.*` (gitignored).

use anyhow::{Context, Result, bail};
use serde_json::Value;
use tracing::{info, warn};

pub fn trim(input: &str, output: &str, frames: usize) -> Result<()> {
    if std::path::Path::new(output).exists() {
        bail!("refusing to overwrite existing file: {output}");
    }
    let contents = std::fs::read_to_string(input).context("read recording file")?;
    let mut lines = contents.lines().filter(|l| !l.trim().is_empty());

    let snapshot = match lines.next() {
        Some(line) => line,
        None => bail!("recording is empty: {input}"),
    };
    let parsed: Value = serde_json::from_str(snapshot).context("parse first line")?;
    if parsed.get("R").is_none() {
        bail!("first line carries no \"R\" snapshot — {input} is not a recording");
    }

    let mut out = String::with_capacity(snapshot.len() + 1);
    out.push_str(snapshot);
    out.push('\n');
    let mut taken = 0usize;
    for line in lines.take(frames) {
        out.push_str(line);
        out.push('\n');
        taken += 1;
    }
    std::fs::write(output, out).with_context(|| format!("write fixture {output}"))?;

    if taken < frames {
        warn!(
            taken,
            requested = frames,
            "recording ran out of frames early"
        );
    }
    info!(
        frames = taken,
        output, "trimmed recording head into fixture"
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    /// Self-cleaning temp path (no tempfile dep in this crate).
    struct Scratch(PathBuf);
    impl Scratch {
        fn new(tag: &str) -> Self {
            let path = std::env::temp_dir()
                .join(format!("muretto-trim-{tag}-{}.jsonl", std::process::id()));
            let _ = std::fs::remove_file(&path);
            Self(path)
        }
        fn as_str(&self) -> &str {
            self.0.to_str().unwrap()
        }
    }
    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.0);
        }
    }

    fn recording(frames: usize) -> String {
        let mut s = String::from("{\"R\":{\"TrackStatus\":{\"Status\":\"1\"}}}\n");
        for i in 0..frames {
            s.push_str(&format!(
                "{{\"M\":[{{\"H\":\"Streaming\",\"M\":\"feed\",\"A\":[\"LapCount\",{{\"CurrentLap\":{i}}},\"t\"]}}]}}\n"
            ));
        }
        s
    }

    #[test]
    fn takes_snapshot_plus_n_frames() {
        let input = Scratch::new("in");
        let output = Scratch::new("out");
        std::fs::write(&input.0, recording(5)).unwrap();

        trim(input.as_str(), output.as_str(), 2).unwrap();

        let written = std::fs::read_to_string(&output.0).unwrap();
        let lines: Vec<&str> = written.lines().collect();
        assert_eq!(lines.len(), 3);
        assert!(lines[0].contains("\"R\""));
        assert!(lines[2].contains("\"CurrentLap\":1"));
    }

    #[test]
    fn short_recordings_trim_to_what_exists() {
        let input = Scratch::new("short-in");
        let output = Scratch::new("short-out");
        std::fs::write(&input.0, recording(1)).unwrap();

        trim(input.as_str(), output.as_str(), 50).unwrap();

        assert_eq!(
            std::fs::read_to_string(&output.0).unwrap().lines().count(),
            2
        );
    }

    #[test]
    fn refuses_overwrite_and_non_recordings() {
        let input = Scratch::new("bad-in");
        let output = Scratch::new("bad-out");

        std::fs::write(&input.0, "{\"M\":[]}\n").unwrap();
        let err = trim(input.as_str(), output.as_str(), 1).unwrap_err();
        assert!(err.to_string().contains("not a recording"), "{err}");

        std::fs::write(&input.0, recording(1)).unwrap();
        std::fs::write(&output.0, "existing").unwrap();
        let err = trim(input.as_str(), output.as_str(), 1).unwrap_err();
        assert!(err.to_string().contains("refusing to overwrite"), "{err}");
    }
}
