"use client";

import { useLiveness } from "@/hooks/useLiveness";
import { showsLiveData } from "@/lib/liveness";
import { NoLiveSession, SessionEndedBanner } from "@/components/NoLiveSession";
import { TrackMap } from "@/components/TrackMap";
import { SessionStrip } from "./SessionStrip";
import { TimingTower } from "./TimingTower";
import { TrackStatusPill } from "./TrackStatusPill";
import { WeatherStrip } from "./WeatherStrip";

export function TimingsTab() {
  const liveness = useLiveness();

  if (!showsLiveData(liveness)) return <NoLiveSession />;

  return (
    <>
      {liveness === "ended" && <SessionEndedBanner />}
      <div className="flex w-full flex-col gap-2 p-2">
        <div className="flex w-full flex-row items-center justify-between gap-4 overflow-hidden rounded-lg border border-zinc-800 p-2">
          <SessionStrip />
          <div className="hidden lg:block">
            <WeatherStrip />
          </div>
          <TrackStatusPill />
        </div>

        <div className="flex w-full flex-col gap-2 2xl:flex-row">
          <div className="overflow-x-auto">
            <TimingTower />
          </div>
          <div className="min-h-72 flex-1 rounded-lg border border-zinc-800">
            <TrackMap />
          </div>
        </div>
      </div>
    </>
  );
}
