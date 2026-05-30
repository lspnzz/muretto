//! Decompression for the `*.z` telemetry topics (`CarData.z`, `Position.z`).
//!
//! The feed base64-encodes a **raw DEFLATE** stream (no zlib header), so we use
//! [`flate2::read::DeflateDecoder`], not `ZlibDecoder` — the classic gotcha that
//! makes telemetry silently fail to decode if you reach for the wrong one.

use std::io::Read;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use flate2::read::DeflateDecoder;
use serde_json::Value;

/// True if a topic name carries a compressed payload (ends in `.z`).
pub fn is_compressed(topic: &str) -> bool {
    topic.ends_with(".z")
}

/// Strip the `.z` suffix to get the canonical topic key (`CarData.z` -> `CarData`).
pub fn canonical_topic(topic: &str) -> &str {
    topic.strip_suffix(".z").unwrap_or(topic)
}

/// Decode a base64'd raw-DEFLATE string into a JSON [`Value`].
pub fn decompress(data: &str) -> anyhow::Result<Value> {
    let compressed = STANDARD.decode(data.trim())?;
    let mut decoder = DeflateDecoder::new(&compressed[..]);
    let mut out = String::new();
    decoder.read_to_string(&mut out)?;
    Ok(serde_json::from_str(&out)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;
    use flate2::Compression;
    use flate2::write::DeflateEncoder;
    use serde_json::json;
    use std::io::Write;

    /// Encode a JSON value the same way the feed does (raw DEFLATE + base64),
    /// so the round-trip proves we picked the matching decoder.
    fn encode(value: &Value) -> String {
        let text = serde_json::to_vec(value).unwrap();
        let mut encoder = DeflateEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(&text).unwrap();
        let compressed = encoder.finish().unwrap();
        base64::engine::general_purpose::STANDARD.encode(compressed)
    }

    #[test]
    fn round_trip() {
        let value = json!({ "Entries": [ { "Cars": { "44": { "Channels": { "0": 11000 } } } } ] });
        let encoded = encode(&value);
        assert_eq!(decompress(&encoded).unwrap(), value);
    }

    #[test]
    fn topic_helpers() {
        assert!(is_compressed("CarData.z"));
        assert!(!is_compressed("CarData"));
        assert_eq!(canonical_topic("Position.z"), "Position");
        assert_eq!(canonical_topic("DriverList"), "DriverList");
    }

    #[test]
    fn malformed_input_errors_without_panicking() {
        assert!(decompress("not base64!!!").is_err());
        // valid base64, but not a deflate stream
        let garbage = base64::engine::general_purpose::STANDARD.encode([0xff, 0x00, 0x12]);
        assert!(decompress(&garbage).is_err());
    }
}
