> **Status:** approved 2026-06-13, implemented 2026-06-13.

# 0006 - No OpenF1 dependency; track-position recovery is future work

## Context

muretto's live path is intended to be direct: F1 SignalR into `realtime`, typed
state over SSE, and a Next.js dashboard rendering that state. During live
checks on 2026-06-13, F1 streamed timing/session/weather/race-control data while
omitting the compressed `Position.z` and `CarData.z` telemetry topics from the
unauthenticated feed.

OpenF1 can expose live location data, but depending on it would add a second
live telemetry provider, a separate key, and different availability semantics
to the track map. That undermines the current operating model: one primary live
feed, no paid data dependency, and offline verification through the simulator.

## Decision

- Remove OpenF1 from runtime dependencies.
- Keep Jolpica as the schedule source without enriching races with OpenF1
  circuit keys.
- Keep MultiViewer for circuit geometry, keyed only from live
  `SessionInfo.Meeting.Circuit.Key`.
- Use native F1 `Position` as the only source for live car dots.
- Do not fake car positions when F1 omits `Position.z`.

## Future Work

To bring driver positions back, add optional authenticated telemetry support in
`realtime` so the primary F1 feed can receive `Position.z` again. That work
should answer:

- where the operator supplies F1/F1TV credentials or tokens;
- how token refresh and failure states behave in the always-on service;
- whether authenticated sessions can still be recorded and replayed without
  committing private material;
- what the dashboard shows when timing is live but telemetry is unauthorized or
  absent.

## Consequences

The live map can still render circuit geometry and race-control flag overlays
when `SessionInfo` and MultiViewer geometry are available. Driver dots only
appear when the F1 feed provides `Position`. That is an intentional missing
state, not an integration bug.
