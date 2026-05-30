//! Integration tests for the typed state merge: an INITIAL snapshot followed by
//! a sequence of partial updates, exercising the quirks that broke the original
//! project's untyped merge (deep partials leaving siblings intact, arrays-as-
//! objects, keyed add/update/remove, array-or-object initial shapes).

use realtime::model::State;
use serde_json::json;

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
