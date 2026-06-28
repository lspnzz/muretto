import type { Sector, Segment } from "@/types";

// Mini-sector segment status codes (docs/references/strategy-screens.md).
function segmentClass(status: number): string {
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
    <div className="flex items-center gap-2.5">
      {ordered.map(({ key, sector }) => {
        const valueCls = sectorValueClass(sector);
        const segments = segmentList(sector.Segments);

        return (
          <div key={key} className="relative h-7 w-[4.75rem] shrink-0 font-mono">
            <p
              className={`flex h-full items-center justify-center text-center text-base leading-none font-medium tabular-nums ${valueCls}`}
            >
              {sector.Value || sector.PreviousValue || "-- ---"}
            </p>
            <div className="absolute inset-x-0 bottom-0 flex justify-center gap-px">
              {segments.map((segment, i) => (
                <div
                  key={i}
                  className={segmentClass(segment.Status)}
                  style={{ width: 8, height: 2, borderRadius: 1 }}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Sector-value colour per the timing-page fastest/better/slower convention. */
function sectorValueClass(sector: Sector): string {
  const hasValue = Boolean(sector.Value || sector.PreviousValue);

  return sector.OverallFastest
    ? "text-violet-500"
    : sector.PersonalFastest
      ? "text-emerald-500"
      : hasValue
        ? "text-amber-400"
        : "text-zinc-500";
}

function segmentList(segments: { [key: string]: Segment | undefined }): Segment[] {
  return Object.keys(segments)
    .sort((a, b) => Number(a) - Number(b))
    .flatMap((key) => (segments[key] ? [segments[key]] : []));
}
