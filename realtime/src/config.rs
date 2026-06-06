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

/// Address the HTTP/SSE server binds to.
///
/// `ADDRESS` is the full override. Otherwise use Railway-style `PORT`, then
/// fall back to port 80 for Docker/compose defaults. On Railway, bind to IPv6
/// too so private networking can reach the service in IPv6-only environments.
pub fn address() -> String {
    address_from_env(
        std::env::var("ADDRESS").ok(),
        std::env::var("PORT").ok(),
        std::env::var("RAILWAY_ENVIRONMENT_ID").is_ok(),
    )
}

fn address_from_env(address: Option<String>, port: Option<String>, railway: bool) -> String {
    if let Some(address) = address {
        return address;
    }

    let port = port.unwrap_or_else(|| "80".to_string());
    if railway {
        format!("[::]:{port}")
    } else {
        format!("0.0.0.0:{port}")
    }
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

#[cfg(test)]
mod tests {
    use super::address_from_env;

    #[test]
    fn explicit_address_wins() {
        let address = address_from_env(
            Some("127.0.0.1:4000".to_string()),
            Some("80".to_string()),
            true,
        );

        assert_eq!(address, "127.0.0.1:4000");
    }

    #[test]
    fn local_port_uses_ipv4_wildcard() {
        let address = address_from_env(None, Some("4000".to_string()), false);

        assert_eq!(address, "0.0.0.0:4000");
    }

    #[test]
    fn railway_port_uses_ipv6_wildcard() {
        let address = address_from_env(None, Some("80".to_string()), true);

        assert_eq!(address, "[::]:80");
    }
}
