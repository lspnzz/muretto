//! Timing topics — the leaderboard's core. Positional sub-collections
//! (sectors, segments, stints) are keyed maps so partial index updates merge
//! correctly, and accept either an array or an index-keyed object on load.

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use muretto_merge::Merge;

#[derive(Debug, Default, Clone, Serialize, Deserialize, TS, Merge)]
#[serde(default, rename_all = "PascalCase")]
pub struct TimingData {
    pub lines: IndexMap<String, TimingDataDriver>,
    pub withheld: bool,
    pub no_entries: Option<Vec<i32>>,
    pub session_part: Option<i32>,
    pub cut_off_time: Option<String>,
    pub cut_off_percentage: Option<String>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, TS, Merge)]
#[serde(default, rename_all = "PascalCase")]
pub struct TimingDataDriver {
    pub racing_number: String,
    pub line: i32,
    pub position: String,
    pub show_position: bool,
    pub gap_to_leader: String,
    pub interval_to_position_ahead: Option<Interval>,
    pub time_diff_to_fastest: Option<String>,
    #[serde(alias = "TimeDifftoPositionAhead")]
    pub time_diff_to_position_ahead: Option<String>,
    #[serde(deserialize_with = "crate::model::de::index_map_or_array")]
    pub stats: IndexMap<String, TimingDataStats>,
    pub retired: bool,
    pub in_pit: bool,
    pub pit_out: bool,
    pub stopped: bool,
    pub status: i32,
    pub number_of_laps: Option<i32>,
    pub knocked_out: Option<bool>,
    pub cutoff: Option<bool>,
    #[serde(deserialize_with = "crate::model::de::index_map_or_array")]
    pub sectors: IndexMap<String, Sector>,
    pub speeds: Speeds,
    pub best_lap_time: LapVal,
    pub last_lap_time: LapVal,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, TS, Merge)]
#[serde(default, rename_all = "PascalCase")]
pub struct Interval {
    pub value: String,
    pub catching: bool,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, TS, Merge)]
#[serde(default, rename_all = "PascalCase")]
pub struct TimingDataStats {
    pub time_diff_to_fastest: Option<String>,
    #[serde(alias = "TimeDifftoPositionAhead")]
    pub time_diff_to_position_ahead: Option<String>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, TS, Merge)]
#[serde(default, rename_all = "PascalCase")]
pub struct Sector {
    pub stopped: bool,
    pub value: String,
    pub previous_value: Option<String>,
    pub status: i32,
    pub overall_fastest: bool,
    pub personal_fastest: bool,
    #[serde(deserialize_with = "crate::model::de::index_map_or_array")]
    pub segments: IndexMap<String, Segment>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, TS, Merge)]
#[serde(default, rename_all = "PascalCase")]
pub struct Segment {
    pub status: i32,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, TS, Merge)]
#[serde(default, rename_all = "PascalCase")]
pub struct Speeds {
    pub i1: LapVal,
    pub i2: LapVal,
    // The wire upper-cases these trap names; PascalCase would emit "Fl"/"St"
    // and the values would silently never deserialize.
    #[serde(rename = "FL")]
    pub fl: LapVal,
    #[serde(rename = "ST")]
    pub st: LapVal,
}

/// A timed value with its status flags. Covers sectors, speed traps, and
/// best/last lap times (whose `position` field is only set for ranked times).
#[derive(Debug, Default, Clone, Serialize, Deserialize, TS, Merge)]
#[serde(default, rename_all = "PascalCase")]
pub struct LapVal {
    pub value: String,
    pub status: i32,
    pub overall_fastest: bool,
    pub personal_fastest: bool,
    pub position: Option<i32>,
}

// ----- TimingAppData (tyres / stints) -----

#[derive(Debug, Default, Clone, Serialize, Deserialize, TS, Merge)]
#[serde(default, rename_all = "PascalCase")]
pub struct TimingAppData {
    pub lines: IndexMap<String, TimingAppDataDriver>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, TS, Merge)]
#[serde(default, rename_all = "PascalCase")]
pub struct TimingAppDataDriver {
    pub racing_number: String,
    pub line: i32,
    pub grid_pos: String,
    #[serde(deserialize_with = "crate::model::de::index_map_or_array")]
    pub stints: IndexMap<String, Stint>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, TS, Merge)]
#[serde(default, rename_all = "PascalCase")]
pub struct Stint {
    pub total_laps: Option<i32>,
    /// SOFT | MEDIUM | HARD | INTERMEDIATE | WET (loose).
    pub compound: Option<String>,
    /// "TRUE" | "FALSE" in the feed.
    pub new: Option<String>,
}
