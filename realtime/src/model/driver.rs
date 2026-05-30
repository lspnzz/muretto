//! Driver list. `DriverList` is keyed by racing number (arrays-as-objects).

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use muretto_merge::Merge;

/// `DriverList` topic: map of racing number -> [`Driver`].
pub type DriverList = IndexMap<String, Driver>;

#[derive(Debug, Default, Clone, Serialize, Deserialize, TS, Merge)]
#[serde(default, rename_all = "PascalCase")]
pub struct Driver {
    pub racing_number: String,
    pub broadcast_name: String,
    pub full_name: String,
    pub tla: String,
    pub line: i32,
    pub team_name: String,
    pub team_colour: String,
    pub first_name: String,
    pub last_name: String,
    pub reference: String,
    pub headshot_url: String,
    pub country_code: String,
}
