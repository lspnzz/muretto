//! Driver-list archive fallback.
//!
//! The live SignalR snapshot can be sparse around session boundaries, while
//! F1's static archive exposes the same `DriverList` as timestamp-prefixed
//! JSON stream lines under `SessionInfo.Path`. Import only identity fields so
//! live line/position data keeps winning.

use std::time::Duration;

use anyhow::Context;
use serde_json::{Map, Value};

use crate::model::State;

const STATIC_BASE_URL: &str = "https://livetiming.formula1.com/static";
const FETCH_TIMEOUT: Duration = Duration::from_secs(3);
const IDENTITY_FIELDS: &[&str] = &[
    "BroadcastName",
    "FullName",
    "Tla",
    "TeamName",
    "TeamColour",
    "FirstName",
    "LastName",
    "Reference",
    "HeadshotUrl",
    "CountryCode",
];
const DISPLAY_FIELDS: &[&str] = &["LastName", "FullName", "BroadcastName", "Tla"];

pub async fn fetch_archive(path: &str) -> anyhow::Result<Option<Value>> {
    let Some(url) = archive_url(path) else {
        return Ok(None);
    };
    let text = reqwest::Client::new()
        .get(url)
        .timeout(FETCH_TIMEOUT)
        .send()
        .await
        .context("fetch DriverList archive")?
        .error_for_status()
        .context("DriverList archive status")?
        .text()
        .await
        .context("read DriverList archive")?;

    Ok(parse_stream(&text))
}

pub fn backfill_path(state: &State) -> Option<String> {
    let path = state.session_info.as_ref()?.path.trim();
    if path.is_empty() || !needs_backfill(state) {
        return None;
    }
    Some(path.to_string())
}

fn needs_backfill(state: &State) -> bool {
    let Some(timing) = &state.timing_data else {
        return !driver_list_has_any_display_name(state);
    };
    if timing.lines.is_empty() {
        return !driver_list_has_any_display_name(state);
    }

    timing
        .lines
        .keys()
        .any(|racing_number| !driver_has_display_name(state, racing_number))
}

fn driver_list_has_any_display_name(state: &State) -> bool {
    state.driver_list.as_ref().is_some_and(|drivers| {
        drivers.values().any(|driver| {
            [
                driver.last_name.as_str(),
                driver.full_name.as_str(),
                driver.broadcast_name.as_str(),
                driver.tla.as_str(),
            ]
            .iter()
            .any(|value| !value.trim().is_empty())
        })
    })
}

fn driver_has_display_name(state: &State, racing_number: &str) -> bool {
    let Some(driver) = state
        .driver_list
        .as_ref()
        .and_then(|drivers| drivers.get(racing_number))
    else {
        return false;
    };

    [
        driver.last_name.as_str(),
        driver.full_name.as_str(),
        driver.broadcast_name.as_str(),
        driver.tla.as_str(),
    ]
    .iter()
    .any(|value| !value.trim().is_empty())
}

fn archive_url(path: &str) -> Option<String> {
    let trimmed = path.trim().trim_start_matches('/');
    if trimmed.is_empty()
        || trimmed.contains("..")
        || trimmed.starts_with("http://")
        || trimmed.starts_with("https://")
    {
        return None;
    }

    let separator = if trimmed.ends_with('/') { "" } else { "/" };
    Some(format!(
        "{STATIC_BASE_URL}/{trimmed}{separator}DriverList.jsonStream"
    ))
}

fn parse_stream(text: &str) -> Option<Value> {
    let mut drivers = Map::new();

    for line in text.lines() {
        let Some(record) = stream_record(line) else {
            continue;
        };
        merge_identity_record(&mut drivers, record);
    }

    (!drivers.is_empty()).then_some(Value::Object(drivers))
}

fn stream_record(line: &str) -> Option<Value> {
    let line = line.trim_start_matches('\u{feff}');
    let json_start = line.find('{')?;
    serde_json::from_str(&line[json_start..]).ok()
}

fn merge_identity_record(drivers: &mut Map<String, Value>, record: Value) {
    let Value::Object(record) = record else {
        return;
    };

    for (racing_number, value) in record {
        let Value::Object(driver) = value else {
            continue;
        };

        let mut identity = Map::new();
        for field in IDENTITY_FIELDS {
            if let Some(value) = driver.get(*field) {
                identity.insert((*field).to_string(), value.clone());
            }
        }

        if !has_display_field(&identity) {
            continue;
        }

        identity.insert(
            "RacingNumber".to_string(),
            driver
                .get("RacingNumber")
                .cloned()
                .unwrap_or_else(|| Value::String(racing_number.clone())),
        );

        drivers.insert(racing_number, Value::Object(identity));
    }
}

fn has_display_field(driver: &Map<String, Value>) -> bool {
    DISPLAY_FIELDS.iter().any(|field| {
        driver
            .get(*field)
            .and_then(Value::as_str)
            .is_some_and(|value| !value.trim().is_empty())
    })
}

#[cfg(test)]
mod tests {
    use indexmap::IndexMap;
    use serde_json::json;

    use super::*;
    use crate::model::driver::Driver;
    use crate::model::timing::{TimingData, TimingDataDriver};

    #[test]
    fn parses_timestamped_driver_identity_without_line_patches() {
        let stream = concat!(
            "\u{feff}00:00:05.309",
            r#"{"44":{"RacingNumber":"44","BroadcastName":"L HAMILTON","FullName":"Lewis HAMILTON","Tla":"HAM","Line":1,"TeamName":"Mercedes","TeamColour":"27f4d2","FirstName":"Lewis","LastName":"Hamilton","Reference":"LEWHAM01","HeadshotUrl":"https://example.test/ham.png","CountryCode":"GBR"}}"#,
            "\n01:00:33.808",
            r#"{"44":{"Line":2}}"#,
            "\n"
        );

        let parsed = parse_stream(stream).unwrap();

        assert_eq!(
            parsed,
            json!({
                "44": {
                    "RacingNumber": "44",
                    "BroadcastName": "L HAMILTON",
                    "FullName": "Lewis HAMILTON",
                    "Tla": "HAM",
                    "TeamName": "Mercedes",
                    "TeamColour": "27f4d2",
                    "FirstName": "Lewis",
                    "LastName": "Hamilton",
                    "Reference": "LEWHAM01",
                    "HeadshotUrl": "https://example.test/ham.png",
                    "CountryCode": "GBR"
                }
            })
        );
    }

    #[test]
    fn normalizes_archive_url() {
        assert_eq!(
            archive_url("2024/2024-03-02_Bahrain_Grand_Prix/2024-03-02_Race/").unwrap(),
            "https://livetiming.formula1.com/static/2024/2024-03-02_Bahrain_Grand_Prix/2024-03-02_Race/DriverList.jsonStream"
        );
        assert!(archive_url("https://example.test/nope").is_none());
        assert!(archive_url("../nope").is_none());
    }

    #[test]
    fn identity_patch_preserves_existing_live_line() {
        let mut drivers = IndexMap::new();
        drivers.insert(
            "44".to_string(),
            Driver {
                racing_number: "44".to_string(),
                line: 7,
                ..Driver::default()
            },
        );
        let mut state = State {
            driver_list: Some(drivers),
            ..State::default()
        };
        let fallback = parse_stream(concat!(
            "00:00:05.309",
            r#"{"44":{"RacingNumber":"44","BroadcastName":"L HAMILTON","FullName":"Lewis HAMILTON","Tla":"HAM","Line":1,"LastName":"Hamilton"}}"#
        ))
        .unwrap();

        state.apply("DriverList", fallback);

        let driver = &state.driver_list.as_ref().unwrap()["44"];
        assert_eq!(driver.line, 7);
        assert_eq!(driver.last_name, "Hamilton");
        assert_eq!(driver.tla, "HAM");
    }

    #[test]
    fn asks_for_backfill_when_timing_line_has_no_named_driver() {
        let mut timing_lines = IndexMap::new();
        timing_lines.insert(
            "44".to_string(),
            TimingDataDriver {
                racing_number: "44".to_string(),
                ..TimingDataDriver::default()
            },
        );

        let state = State {
            session_info: Some(crate::model::session::SessionInfo {
                path: "2024/test/race/".to_string(),
                ..Default::default()
            }),
            timing_data: Some(TimingData {
                lines: timing_lines,
                ..TimingData::default()
            }),
            ..State::default()
        };

        assert_eq!(backfill_path(&state), Some("2024/test/race/".to_string()));
    }

    #[test]
    fn skips_backfill_when_timing_line_has_named_driver() {
        let mut timing_lines = IndexMap::new();
        timing_lines.insert(
            "44".to_string(),
            TimingDataDriver {
                racing_number: "44".to_string(),
                ..TimingDataDriver::default()
            },
        );
        let mut drivers = IndexMap::new();
        drivers.insert(
            "44".to_string(),
            Driver {
                racing_number: "44".to_string(),
                tla: "HAM".to_string(),
                ..Driver::default()
            },
        );

        let state = State {
            session_info: Some(crate::model::session::SessionInfo {
                path: "2024/test/race/".to_string(),
                ..Default::default()
            }),
            driver_list: Some(drivers),
            timing_data: Some(TimingData {
                lines: timing_lines,
                ..TimingData::default()
            }),
            ..State::default()
        };

        assert_eq!(backfill_path(&state), None);
    }
}
