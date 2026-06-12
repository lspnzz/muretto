//! Integration tests for the typed state merge: an INITIAL snapshot followed by
//! a sequence of partial updates, exercising the quirks that broke the original
//! project's untyped merge (deep partials leaving siblings intact, arrays-as-
//! objects, keyed add/update/remove, array-or-object initial shapes).

use realtime::ingest::decompress;
use realtime::model::State;
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
        let frame: Value = serde_json::from_str(line).unwrap();
        let messages = frame["M"].as_array().unwrap();
        for message in messages {
            let args = message["A"].as_array().unwrap();
            let topic = args[0].as_str().unwrap();
            apply_decoded(&mut s, topic, args[1].clone());
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
    assert_eq!(position.entries["44"].x, 1400.0);
    assert_eq!(position.entries["16"].y, 730.0);

    let car_data = s.car_data.as_ref().unwrap();
    assert_eq!(car_data.entries[0].cars["44"].channels.speed, 295);

    let messages = &s.race_control_messages.as_ref().unwrap().messages;
    assert_eq!(messages["0"].message, "GREEN LIGHT - PIT EXIT OPEN");
    assert_eq!(messages["2"].lap, Some(12)); // keyed append from the delta
}

/// Every fixture in `simulator/fixtures/` must replay cleanly end to end: the
/// snapshot decodes and folds, and every later line either parses as feed
/// frames (both wire shapes) that fold without panicking, or is a skippable
/// non-feed frame (Core keep-alives). Dropping a trimmed real-session
/// recording into the fixtures directory pins it with no per-file assertions.
#[test]
fn every_checked_in_fixture_replays_cleanly() {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../simulator/fixtures");
    let mut checked = 0;
    for entry in std::fs::read_dir(&dir).expect("fixtures directory exists") {
        let path = entry.expect("readable directory entry").path();
        if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }
        let contents = std::fs::read_to_string(&path).expect("fixture reads");
        let mut lines = contents.lines().filter(|line| !line.trim().is_empty());
        let mut state = State::default();

        let first = lines.next().expect("fixture has a snapshot line");
        let initial: Value = serde_json::from_str(first).expect("snapshot line parses");
        for (topic, data) in initial["R"].as_object().expect("first line carries R") {
            apply_decoded(&mut state, topic, data.clone());
        }

        let mut updates = 0;
        for line in lines {
            for update in realtime::signalr::parse_feed(line).into_iter().flatten() {
                apply_decoded(&mut state, &update.topic, update.data);
                updates += 1;
            }
        }
        assert!(updates > 0, "{} carried no feed updates", path.display());
        checked += 1;
    }
    assert!(
        checked >= 1,
        "no .jsonl fixtures found in {}",
        dir.display()
    );
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
