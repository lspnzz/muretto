"use client";

import { useLiveness } from "@/hooks/useLiveness";
import { showsLiveData } from "@/lib/liveness";
import { NoLiveSession, SessionEndedBanner } from "@/components/NoLiveSession";
import { TrackMap } from "@/components/TrackMap";
import { CircleOfDoom } from "@/components/strategy/CircleOfDoom";
import { RaceControlFeed } from "@/components/strategy/RaceControlFeed";
import { TeamRadios } from "@/components/strategy/TeamRadios";
import { TyreStints } from "@/components/strategy/TyreStints";
import { TimingTower } from "@/components/timings/TimingTower";

/**
 * The pit wall: one at-a-glance view merging the old Strategy and Timings tabs.
 * On wide screens it fills the viewport as a 2x2 grid — track map + circle of
 * doom and tyre stints share the top row's height; the timing tower and the
 * race-control / team-radio stack share the bottom row, each panel scrolling
 * its own overflow. Narrow screens stack the whole thing into one column.
 */
export function PitWallTab() {
  const liveness = useLiveness();

  if (!showsLiveData(liveness)) return <NoLiveSession />;

  return (
    <>
      {liveness === "ended" && <SessionEndedBanner />}
      <div className="mx-auto flex w-full max-w-[110rem] flex-col gap-4 p-4 xl:h-full xl:min-h-0">
        {/* Desktop: a 2x2 wall. The top row (map + ring | tyre stints) shares
            one grid-row height, so the map/ring block is exactly as tall as the
            tyre-stints block; the bottom row (timing | race control + team
            radio) shares the rest. Narrow screens stack into one column. */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_26rem] xl:grid-rows-[minmax(0,1.5fr)_minmax(0,2fr)]">
          {/* Top-left: track map + circle of doom. */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start xl:col-start-1 xl:row-start-1 xl:min-h-0 xl:items-stretch">
            <TrackMap showFastestSectors fit />
            <CircleOfDoom fit />
          </div>
          {/* Top-right: tyre stints — same height as the map + ring row. */}
          <div className="xl:col-start-2 xl:row-start-1 xl:flex xl:min-h-0 xl:flex-col">
            <TyreStints fill />
          </div>
          {/* Bottom-left: timing tower, scrolls its rows. */}
          <div className="min-h-0 xl:col-start-1 xl:row-start-2">
            <TimingTower />
          </div>
          {/* Bottom-right: race control + team radio split the remaining height. */}
          <aside className="flex flex-col gap-4 xl:col-start-2 xl:row-start-2 xl:min-h-0">
            <div className="xl:flex xl:min-h-0 xl:flex-1 xl:flex-col">
              <RaceControlFeed fill />
            </div>
            <div className="xl:flex xl:min-h-0 xl:flex-1 xl:flex-col">
              <TeamRadios fill />
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
