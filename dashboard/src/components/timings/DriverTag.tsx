"use client";

/**
 * Broadcast-tower driver cell: white position number (the leader's sits on
 * the F1-red box) and the TLA in team colour.
 */
export function DriverTag({
  position,
  tla,
  teamColour,
}: {
  position: string;
  tla: string;
  teamColour?: string;
}) {
  const colour = teamColour ? `#${teamColour}` : "#a1a1aa";
  const leader = position === "1";
  return (
    <div className="flex items-center gap-2">
      <span
        className={`flex h-5 w-6 shrink-0 items-center justify-center rounded text-sm leading-none font-black tabular-nums ${
          leader ? "bg-[#e10600]" : ""
        }`}
      >
        {position}
      </span>
      <p className="text-lg leading-none font-bold tracking-wide" style={{ color: colour }}>
        {tla}
      </p>
    </div>
  );
}
