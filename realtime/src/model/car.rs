//! Telemetry topics: `CarData` and `Position`. These arrive zlib-compressed
//! (handled at the ingest boundary) and are replace-only — each tick carries a
//! fresh `Entries` array, so merge just replaces. Channel keys are kept numeric
//! on the wire (the dashboard names them via a small typed helper).

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use muretto_merge::Merge;

#[derive(Debug, Default, Clone, Serialize, Deserialize, TS, Merge)]
#[serde(default, rename_all = "PascalCase")]
pub struct CarData {
    pub entries: Vec<CarEntry>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, TS)]
#[serde(default, rename_all = "PascalCase")]
pub struct CarEntry {
    pub utc: String,
    pub cars: IndexMap<String, CarItem>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, TS)]
#[serde(default, rename_all = "PascalCase")]
pub struct CarItem {
    pub channels: CarChannels,
}

/// Telemetry channels, keyed by F1's numeric channel IDs:
/// 0=RPM, 2=Speed(km/h), 3=Gear, 4=Throttle(0-100), 5=Brake, 45=DRS.
#[derive(Debug, Default, Clone, Serialize, Deserialize, TS)]
#[serde(default)]
pub struct CarChannels {
    #[serde(rename = "0")]
    pub rpm: i32,
    #[serde(rename = "2")]
    pub speed: i32,
    #[serde(rename = "3")]
    pub gear: i32,
    #[serde(rename = "4")]
    pub throttle: i32,
    #[serde(rename = "5")]
    pub brake: i32,
    #[serde(rename = "45")]
    pub drs: i32,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, TS, Merge)]
#[serde(default, rename_all = "PascalCase")]
pub struct Position {
    pub position: Vec<PositionEntry>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, TS)]
#[serde(default, rename_all = "PascalCase")]
pub struct PositionEntry {
    pub timestamp: String,
    pub entries: IndexMap<String, PositionCar>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, TS)]
#[serde(default, rename_all = "PascalCase")]
pub struct PositionCar {
    pub status: String,
    pub x: f64,
    pub y: f64,
    pub z: f64,
}
