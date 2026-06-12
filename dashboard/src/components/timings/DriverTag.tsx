"use client";

/** Team-coloured position + TLA pill, the leaderboard's anchor cell. */
export function DriverTag({
  position,
  tla,
  teamColour,
}: {
  position: string;
  tla: string;
  teamColour?: string;
}) {
  const colour = teamColour ? `#${teamColour}` : "#52525b";
  return (
    <div
      className="flex w-fit min-w-full items-center justify-between gap-0.5 rounded-lg px-1 py-1 font-black"
      style={{ backgroundColor: colour }}
    >
      <p className="px-1 text-xl leading-none text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.4)]">
        {position}
      </p>
      <div className="flex items-center justify-center rounded-md bg-white px-1 py-0.5">
        <p className="font-mono text-sm leading-none" style={{ color: colour }}>
          {tla}
        </p>
      </div>
    </div>
  );
}
