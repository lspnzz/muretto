import type { Sector, Segment } from "@/types";

// Mini-sector segment status codes (docs/references/strategy-screens.md).
// Exported: the driver tab renders the same semantics at detail size.
export function segmentClass(status: number): string {
  switch (status) {
    case 2049:
      return "bg-emerald-500"; // personal best
    case 2051:
      return "bg-violet-500"; // overall best
    case 2064:
      return "bg-blue-500"; // pit lane
    case 2048:
    case 2052:
      return "bg-amber-400"; // set
    default:
      return "bg-zinc-700"; // not yet set
  }
}

export function SectorsCell({
  sectors,
}: {
  sectors: { [key: string]: Sector | undefined };
}) {
  const ordered = Object.keys(sectors)
    .sort((a, b) => Number(a) - Number(b))
    .flatMap((key) => (sectors[key] ? [{ key, sector: sectors[key] }] : []));

  return (
    <div className="flex gap-2.5">
      {ordered.map(({ key, sector }) => {
        const valueCls = sectorValueClass(sector);

        return (
          <div key={key} className="flex flex-col gap-1">
            <div className="flex flex-row gap-0.5">
              {segmentList(sector.Segments).map((segment, i) => (
                <div
                  key={i}
                  className={segmentClass(segment.Status)}
                  style={{ width: 9, height: 4, borderRadius: 2 }}
                />
              ))}
            </div>
            <div className="flex items-baseline gap-1 font-mono">
              <p className={`text-base leading-none font-medium tabular-nums ${valueCls}`}>
                {sector.Value || sector.PreviousValue || "-- ---"}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Sector-value colour per the personal/overall-fastest convention. */
export function sectorValueClass(sector: Sector): string {
  return sector.OverallFastest
    ? "text-violet-500"
    : sector.PersonalFastest
      ? "text-emerald-500"
      : sector.Value
        ? ""
        : "text-zinc-500";
}

export function segmentList(segments: { [key: string]: Segment | undefined }): Segment[] {
  return Object.keys(segments)
    .sort((a, b) => Number(a) - Number(b))
    .flatMap((key) => (segments[key] ? [segments[key]] : []));
}
