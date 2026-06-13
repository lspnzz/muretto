//! Integration tests for the typed state merge: an INITIAL snapshot followed by
//! a sequence of partial updates, exercising the quirks that broke the original
//! project's untyped merge (deep partials leaving siblings intact, arrays-as-
//! objects, keyed add/update/remove, array-or-object initial shapes).

use realtime::model::State;
use realtime::{ingest::decompress, signalr};
use serde_json::{Value, json};

/// Load an INITIAL snapshot as the feed delivers it: `{ "<Topic>": <data> }`.
fn initial(state: &mut State, topic: &str, data: serde_json::Value) {
    state.apply(topic, data);
}

#[test]
fn driver_list_initial_then_partial_keeps_siblings() {
    let mut s = State::default();
    initial(
        &mut s,
        "DriverList",
        json!({
            "44": { "RacingNumber": "44", "Tla": "HAM", "TeamColour": "00D2BE", "Line": 3 },
            "16": { "RacingNumber": "16", "Tla": "LEC", "TeamColour": "DC0000", "Line": 1 },
        }),
    );

    // Partial: only Line changes for 44.
    s.apply("DriverList", json!({ "44": { "Line": 1 } }));

    let drivers = s.driver_list.as_ref().unwrap();
    assert_eq!(drivers["44"].line, 1);
    assert_eq!(drivers["44"].tla, "HAM"); // untouched
    assert_eq!(drivers["44"].team_colour, "00D2BE"); // untouched
    assert_eq!(drivers["16"].tla, "LEC"); // other driver untouched
}

#[test]
fn driver_list_initial_ignores_live_metadata_keys() {
    let mut s = State::default();
    initial(
        &mut s,
        "DriverList",
        json!({
            "44": { "RacingNumber": "44", "Tla": "HAM", "TeamColour": "00D2BE", "Line": 3 },
            "_kf": true,
        }),
    );

    let drivers = s.driver_list.as_ref().unwrap();
    assert_eq!(drivers.len(), 1);
    assert_eq!(drivers["44"].tla, "HAM");
    assert!(!drivers.contains_key("_kf"));
}

#[test]
fn timing_data_nested_sector_segment_partial() {
    let mut s = State::default();
    initial(
        &mut s,
        "TimingData",
        json!({
            "Lines": {
                "44": {
                    "RacingNumber": "44",
                    "Position": "1",
                    "GapToLeader": "",
                    "Sectors": [
                        { "Value": "28.1", "Status": 0, "Segments": [ { "Status": 2048 }, { "Status": 0 } ] }
                    ]
                }
            },
            "Withheld": false
        }),
    );

    // Partial: update only segment index 1's status (arrays-as-objects).
    s.apply(
        "TimingData",
        json!({ "Lines": { "44": { "Sectors": { "0": { "Segments": { "1": { "Status": 2049 } } } } } } }),
    );

    let line = &s.timing_data.as_ref().unwrap().lines["44"];
    assert_eq!(line.sectors["0"].segments["1"].status, 2049);
    assert_eq!(line.sectors["0"].segments["0"].status, 2048); // sibling segment untouched
    assert_eq!(line.sectors["0"].value, "28.1"); // sibling field untouched
    assert_eq!(line.position, "1");
}

#[test]
fn timing_data_stats_accepts_qualifying_time_diff_typo() {
    let mut s = State::default();
    initial(
        &mut s,
        "TimingData",
        json!({
            "SessionPart": 2,
            "Lines": {
                "44": {
                    "RacingNumber": "44",
                    "Position": "1",
                    "Stats": [
                        {
                            "TimeDiffToFastest": "",
                            "TimeDifftoPositionAhead": ""
                        },
                        {
                            "TimeDiffToFastest": "+0.231",
                            "TimeDifftoPositionAhead": "+0.120"
                        }
                    ]
                }
            }
        }),
    );

    let timing = s.timing_data.as_ref().unwrap();
    let line = &timing.lines["44"];
    assert_eq!(timing.session_part, Some(2));
    assert_eq!(
        line.stats["1"].time_diff_to_fastest.as_deref(),
        Some("+0.231")
    );
    assert_eq!(
        line.stats["1"].time_diff_to_position_ahead.as_deref(),
        Some("+0.120")
    );
}

#[test]
fn race_control_messages_append_via_index() {
    let mut s = State::default();
    initial(
        &mut s,
        "RaceControlMessages",
        json!({ "Messages": [ { "Utc": "t0", "Message": "GREEN", "Category": "Flag" } ] }),
    );
    // New message arrives keyed by next index.
    s.apply(
        "RaceControlMessages",
        json!({ "Messages": { "1": { "Utc": "t1", "Message": "YELLOW", "Category": "Flag" } } }),
    );

    let msgs = &s.race_control_messages.as_ref().unwrap().messages;
    assert_eq!(msgs.len(), 2);
    assert_eq!(msgs["0"].message, "GREEN");
    assert_eq!(msgs["1"].message, "YELLOW");
}

#[test]
fn car_data_replaces_each_tick() {
    let mut s = State::default();
    s.apply(
        "CarData",
        json!({ "Entries": [ { "Utc": "t0", "Cars": { "44": { "Channels": { "0": 11000, "2": 280 } } } } ] }),
    );
    s.apply(
        "CarData",
        json!({ "Entries": [ { "Utc": "t1", "Cars": { "44": { "Channels": { "0": 11500, "2": 290 } } } } ] }),
    );

    let cd = s.car_data.as_ref().unwrap();
    assert_eq!(cd.entries.len(), 1); // replaced, not appended
    assert_eq!(cd.entries[0].utc, "t1");
    assert_eq!(cd.entries[0].cars["44"].channels.rpm, 11500);
    assert_eq!(cd.entries[0].cars["44"].channels.speed, 290);
}

#[test]
fn loose_topic_deep_merges() {
    let mut s = State::default();
    s.apply(
        "TimingStats",
        json!({ "Lines": { "44": { "Best": 1 } }, "SessionType": "Race" }),
    );
    s.apply("TimingStats", json!({ "Lines": { "44": { "Best": 2 } } }));

    let ts = s.timing_stats.as_ref().unwrap();
    assert_eq!(ts["Lines"]["44"]["Best"], json!(2));
    assert_eq!(ts["SessionType"], json!("Race")); // sibling preserved
}

#[test]
fn replay_fixture_initial_then_partial_sequence() {
    let fixture = include_str!("../../simulator/fixtures/sample.jsonl");
    let mut lines = fixture.lines().filter(|line| !line.trim().is_empty());
    let mut s = State::default();

    let initial_frame: Value = serde_json::from_str(lines.next().unwrap()).unwrap();
    for (topic, data) in initial_frame["R"].as_object().unwrap() {
        apply_decoded(&mut s, topic, data.clone());
    }

    for line in lines {
        if let Some(updates) = signalr::parse_feed(line) {
            for update in updates {
                apply_decoded(&mut s, &update.topic, update.data);
            }
        }
    }

    let drivers = s.driver_list.as_ref().unwrap();
    assert_eq!(drivers["44"].tla, "HAM");
    assert_eq!(drivers["16"].team_name, "Ferrari");

    let timing = s.timing_data.as_ref().unwrap();
    assert_eq!(timing.lines["44"].position, "1");
    assert_eq!(timing.lines["16"].gap_to_leader, "+1.102"); // updated by frame 1
    // Deep segment patch landed without disturbing sector siblings.
    assert_eq!(timing.lines["44"].sectors["0"].segments["3"].status, 2049);
    assert_eq!(timing.lines["44"].sectors["0"].value, "28.143");
    // NOR's pit sequence: in, new stint, out.
    assert!(timing.lines["4"].pit_out);
    assert!(!timing.lines["4"].in_pit);
    let stints = &s.timing_app_data.as_ref().unwrap().lines["4"].stints;
    assert_eq!(stints["1"].compound.as_deref(), Some("HARD"));

    assert_eq!(s.session_status.as_ref().unwrap().status, "Started");
    assert_eq!(s.lap_count.as_ref().unwrap().current_lap, 13);
    let radio = s.team_radio.as_ref().unwrap();
    assert_eq!(radio["Captures"].as_array().unwrap().len(), 3);

    let weather = s.weather_data.as_ref().unwrap();
    assert_eq!(weather.track_temp, "32.1"); // updated by the weather frame
    assert_eq!(weather.rainfall, "0"); // sibling untouched by the partial

    let position = s.position.as_ref().unwrap().position.last().unwrap();
    assert_eq!(position.entries["44"].x, 6955.0);
    assert_eq!(position.entries["16"].y, 11018.0);

    // CarData is replace-only: the state holds the *last* frame's batch,
    // which carries telemetry for all five drivers (plan 0005).
    let car_data = s.car_data.as_ref().unwrap();
    assert_eq!(car_data.entries[0].cars.len(), 5);
    assert_eq!(car_data.entries[0].cars["44"].channels.speed, 221);
    let speeds = &timing.lines["44"].speeds;
    assert_eq!(speeds.st.value, "322"); // wire key "ST", not PascalCase "St"

    let messages = &s.race_control_messages.as_ref().unwrap().messages;
    assert_eq!(messages["0"].message, "GREEN LIGHT - PIT EXIT OPEN");
    assert_eq!(messages["2"].lap, Some(12)); // keyed append from the delta

    // The flag sequence (sector yellows → SC → VSC → red → restart) folds to a
    // clear track, with every keyed message append preserved in the log.
    assert_eq!(s.track_status.as_ref().unwrap().status, "1");
    assert_eq!(messages["3"].flag.as_deref(), Some("YELLOW"));
    assert_eq!(messages["3"].sector, Some(2));
    assert_eq!(messages["4"].flag.as_deref(), Some("DOUBLE YELLOW"));
    assert_eq!(messages["7"].category, "SafetyCar");
    assert_eq!(messages["11"].flag.as_deref(), Some("RED"));
    assert_eq!(messages["12"].message, "GREEN LIGHT - PIT EXIT OPEN");
    // 2026 overtake-mode badge: appended after the restart (plan 0005).
    assert_eq!(messages["13"].message, "OVERTAKE ENABLED");
}

fn apply_decoded(state: &mut State, topic: &str, data: Value) {
    let canonical = decompress::canonical_topic(topic);
    let decoded = if decompress::is_compressed(topic) {
        let encoded = data
            .as_str()
            .expect("compressed fixture payload is a string");
        decompress::decompress(encoded).expect("fixture payload decodes")
    } else {
        data
    };
    state.apply(canonical, decoded);
}
