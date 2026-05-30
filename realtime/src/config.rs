//! Runtime configuration, read from the environment.

/// Base host+path of the F1 SignalR endpoint.
pub const F1_SIGNALR_URL: &str = "livetiming.formula1.com/signalr";

/// SignalR hub name.
pub const F1_HUB: &str = "Streaming";

/// Topics subscribed to on the F1 feed. `.z` topics are zlib-compressed.
pub const TOPICS: &[&str] = &[
    "Heartbeat",
    "CarData.z",
    "Position.z",
    "ExtrapolatedClock",
    "TimingStats",
    "TimingAppData",
    "WeatherData",
    "TrackStatus",
    "SessionStatus",
    "DriverList",
    "RaceControlMessages",
    "SessionInfo",
    "SessionData",
    "LapCount",
    "TimingData",
    "TeamRadio",
    "ChampionshipPrediction",
];

/// Address the HTTP/SSE server binds to (`ADDRESS`, default `0.0.0.0:80`).
pub fn address() -> String {
    std::env::var("ADDRESS").unwrap_or_else(|_| "0.0.0.0:80".to_string())
}

/// Allowed CORS origins, `;`-separated (`ORIGIN`). Empty when unset.
pub fn origins() -> Vec<String> {
    std::env::var("ORIGIN")
        .map(|s| s.split(';').map(|o| o.trim().to_string()).collect())
        .unwrap_or_default()
}

/// Optional local replay endpoint (`F1_DEV_URL`); when set, the SignalR client
/// connects here instead of the live F1 feed.
pub fn dev_url() -> Option<String> {
    std::env::var("F1_DEV_URL").ok()
}
