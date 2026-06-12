"use client";

import { useLiveness } from "@/hooks/useLiveness";
import { showsLiveData } from "@/lib/liveness";
import { NoLiveSession, SessionEndedBanner } from "@/components/NoLiveSession";
import { TrackMap } from "@/components/TrackMap";
import { TimingTower } from "./TimingTower";

export function TimingsTab() {
  const liveness = useLiveness();

  if (!showsLiveData(liveness)) return <NoLiveSession />;

  return (
    <>
      {liveness === "ended" && <SessionEndedBanner />}
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1">
          <TimingTower />
        </div>
        {/* DOM-last so the leaderboard leads on small screens; visually left on xl. */}
        <div className="w-full xl:sticky xl:top-4 xl:order-first xl:w-96 xl:shrink-0">
          <TrackMap />
        </div>
      </div>
    </>
  );
}
