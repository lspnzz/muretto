//! Generates the TypeScript bindings from the Rust model and is also the
//! anti-drift gate: CI runs this, then `git diff --exit-code dashboard/src/types`
//! fails the build if the committed bindings are stale.

use realtime::model::State;
use ts_rs::TS;

#[test]
fn export_typescript_bindings() {
    State::export_all().expect("failed to export TypeScript bindings");
}
