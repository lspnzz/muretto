"use client";

import { useLiveness } from "@/hooks/useLiveness";
import { showsLiveData } from "@/lib/liveness";
import { NextRace } from "./NextRace";
import { SessionBanner } from "./SessionBanner";
import { TrackConditions } from "./TrackConditions";

export function OverviewTab() {
  const liveness = useLiveness();
  const live = showsLiveData(liveness);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 lg:p-6">
      {live && <SessionBanner ended={liveness === "ended"} />}
      <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
        <NextRace />
        <TrackConditions live={live} />
      </div>
    </div>
  );
}
