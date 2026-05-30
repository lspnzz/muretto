//! Session-level topics: clock, status, weather, lap count, session info.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use muretto_merge::Merge;

#[derive(Debug, Default, Clone, Serialize, Deserialize, TS, Merge)]
#[serde(default, rename_all = "PascalCase")]
pub struct Heartbeat {
    pub utc: String,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, TS, Merge)]
#[serde(default, rename_all = "PascalCase")]
pub struct ExtrapolatedClock {
    pub utc: String,
    pub remaining: String,
    pub extrapolating: bool,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, TS, Merge)]
#[serde(default, rename_all = "PascalCase")]
pub struct TrackStatus {
    pub status: String,
    pub message: String,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, TS, Merge)]
#[serde(default, rename_all = "PascalCase")]
pub struct SessionStatus {
    /// e.g. "Started" | "Finished" | "Finalised" | "Ends" (kept loose on purpose).
    pub status: String,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, TS, Merge)]
#[serde(default, rename_all = "PascalCase")]
pub struct LapCount {
    pub current_lap: i32,
    pub total_laps: i32,
}

/// All fields are strings in the feed (e.g. AirTemp "27.3").
#[derive(Debug, Default, Clone, Serialize, Deserialize, TS, Merge)]
#[serde(default, rename_all = "PascalCase")]
pub struct WeatherData {
    pub air_temp: String,
    pub humidity: String,
    pub pressure: String,
    pub rainfall: String,
    pub track_temp: String,
    pub wind_direction: String,
    pub wind_speed: String,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, TS, Merge)]
#[serde(default, rename_all = "PascalCase")]
pub struct SessionInfo {
    pub meeting: Meeting,
    pub archive_status: ArchiveStatus,
    pub key: i32,
    #[serde(rename = "Type")]
    pub kind: String,
    pub name: String,
    pub start_date: String,
    pub end_date: String,
    pub gmt_offset: String,
    pub path: String,
    pub number: Option<i32>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, TS, Merge)]
#[serde(default, rename_all = "PascalCase")]
pub struct Meeting {
    pub key: i32,
    pub name: String,
    pub official_name: String,
    pub location: String,
    pub country: Country,
    pub circuit: Circuit,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, TS, Merge)]
#[serde(default, rename_all = "PascalCase")]
pub struct Country {
    pub key: i32,
    pub code: String,
    pub name: String,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, TS, Merge)]
#[serde(default, rename_all = "PascalCase")]
pub struct Circuit {
    pub key: i32,
    pub short_name: String,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, TS, Merge)]
#[serde(default, rename_all = "PascalCase")]
pub struct ArchiveStatus {
    pub status: String,
}
