# MultiViewer circuit geometry API

Where the track map's outline comes from. Public, unauthenticated, not ours —
be a polite consumer.

## Endpoint

```
GET https://api.multiviewer.app/api/v1/circuits/{circuitKey}/{year}
GET https://api.multiviewer.app/api/v1/circuits            # index: { "<key>": { "years": [...] } }
```

`circuitKey` is the integer from the feed's `SessionInfo.Meeting.Circuit.Key`;
the geometry includes the track outline (`x`/`y` polylines) in the same
coordinate space as the live `Position` topic, which is what lets car dots be
overlaid directly.

## How muretto consumes it

- **Proxy route:** `dashboard/src/app/api/circuits/[circuitKey]/[year]/route.ts`.
  Validates both params as integers; fetches with Next revalidation of **24h**
  and mirrors that in `Cache-Control: s-maxage`. If the requested year 404s, it
  consults the index and falls back to the **nearest year ≤ requested** (else
  the newest available), reporting the served year in the
  `X-Muretto-Circuit-Year` response header. Misses are a clean JSON 404.
- **Consumer:** `dashboard/src/components/TrackMap.tsx` fetches
  `/api/circuits/{key}/{year}` using key/year from live `SessionInfo`. Any
  non-OK response or missing outline sets the geometry to `null` and the **map
  simply doesn't render** — API trouble must never break the leaderboard.
- **Car dots:** native F1 `Position.z` is the only coordinate source. Current
  live sessions can omit that topic even while timing data streams; in that
  case the outline and flag overlays can render, but cars do not. Restoring car
  dots requires future authenticated-F1-feed work
  ([0006](../plans/0006-no-openf1-dependency.md)).
- Besides the outline and `corners`, the map reads `marshalSectors`
  (`number` + `trackPosition` in outline space). These are the "TRACK SECTOR
  n" numbers race control uses, so the outline can be split at marshal-post
  boundaries and the affected stretch painted yellow
  (`dashboard/src/lib/flags.ts`). Missing `marshalSectors` degrades cleanly:
  whole-track states still render, sector yellows just don't localize.
- The three **timing sectors** are not in the geometry (only `marshalSectors`,
  which are flag posts). The fastest-sector colour overlay therefore splits the
  outline into equal-length thirds (`splitPathEvenly`) as an approximation;
  exact FIA sector lines would need per-lap position×sector-time correlation,
  which neither the geometry API nor the timing feed exposes.

## Courtesy rules

The 24h server-side cache means each circuit/year is fetched at most once a
day per deployment, no matter how many viewers connect. Keep it that way:
don't call MultiViewer from client code, and don't shorten the revalidation
without a reason written down in a plan.
