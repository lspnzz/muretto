//! The canonical typed state tree — the single in-memory source of truth and
//! the root of the TypeScript bindings exported by ts-rs.
//!
//! Each field is a topic from the F1 feed. Central, well-shaped topics are fully
//! typed; a few ragged ones (`TimingStats`, `TopThree`, `SessionData`,
//! `TeamRadio`, `ChampionshipPrediction`) are kept as loose JSON on purpose
//! (the pragmatism guard — `docs/design/core-beliefs.md`) so new feed fields
//! never break ingest.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use ts_rs::TS;

use muretto_merge::Merge;

use super::car::{CarData, Position};
use super::driver::DriverList;
use super::race_control::RaceControlMessages;
use super::session::{
    ExtrapolatedClock, Heartbeat, LapCount, SessionInfo, SessionStatus, TrackStatus, WeatherData,
};
use super::timing::{TimingAppData, TimingData};

#[derive(Debug, Default, Clone, Serialize, Deserialize, TS, Merge)]
#[serde(default, rename_all = "PascalCase")]
pub struct State {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub heartbeat: Option<Heartbeat>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extrapolated_clock: Option<ExtrapolatedClock>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub track_status: Option<TrackStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_status: Option<SessionStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_info: Option<SessionInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lap_count: Option<LapCount>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weather_data: Option<WeatherData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub driver_list: Option<DriverList>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timing_data: Option<TimingData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timing_app_data: Option<TimingAppData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub race_control_messages: Option<RaceControlMessages>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub car_data: Option<CarData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub position: Option<Position>,

    // --- Loose / ragged topics, kept as raw JSON on purpose. ---
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timing_stats: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_three: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_data: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_radio: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub championship_prediction: Option<Value>,

    // --- Synthetic liveness stamp, not a feed topic (plan 0003). ---
    /// Epoch ms when the last *streamed* frame (excluding `Heartbeat`) was
    /// applied. `None` until the feed proves a session is producing data —
    /// the subscribe snapshot alone never sets it, so clients can tell a
    /// held-over snapshot from a live stream. Rides full snapshots only;
    /// per-topic deltas never carry it (egress stays delta-sized).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(type = "number | null")]
    pub last_feed_event_ms: Option<i64>,
}

impl State {
    /// Fold a single topic's data into the state, as the feed delivers it
    /// (`{ "<Topic>": <data> }`). Reuses the derived [`Merge`] dispatch.
    pub fn apply(&mut self, topic: &str, data: Value) {
        let mut obj = Map::with_capacity(1);
        obj.insert(topic.to_string(), data);
        self.merge(Value::Object(obj));
    }
}
