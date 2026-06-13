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
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4">
        <TrackMap />
        <TimingTower />
      </div>
    </>
  );
}
