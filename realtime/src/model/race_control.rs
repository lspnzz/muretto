//! Race control messages. `Messages` is index-keyed and appended to over time,
//! so it's a keyed map that loads from either an array or an index object.

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use muretto_merge::Merge;

#[derive(Debug, Default, Clone, Serialize, Deserialize, TS, Merge)]
#[serde(default, rename_all = "PascalCase")]
pub struct RaceControlMessages {
    #[serde(deserialize_with = "crate::model::de::index_map_or_array")]
    pub messages: IndexMap<String, Message>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, TS, Merge)]
#[serde(default, rename_all = "PascalCase")]
pub struct Message {
    pub utc: String,
    pub lap: Option<i32>,
    pub message: String,
    /// Other | Sector | Flag | Drs | SafetyCar | ... (loose).
    pub category: String,
    pub flag: Option<String>,
    pub scope: Option<String>,
    pub sector: Option<i32>,
    pub status: Option<String>,
}
