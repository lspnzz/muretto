"use client";

import { useLiveness } from "@/hooks/useLiveness";
import { showsLiveData } from "@/lib/liveness";
import { NoLiveSession, SessionEndedBanner } from "@/components/NoLiveSession";
import { CircleOfDoom } from "./CircleOfDoom";
import { RaceControlFeed } from "./RaceControlFeed";
import { TeamRadios } from "./TeamRadios";
import { TyreStints } from "./TyreStints";

export function StrategyTab() {
  const liveness = useLiveness();

  if (!showsLiveData(liveness)) return <NoLiveSession />;

  return (
    <>
      {liveness === "ended" && <SessionEndedBanner />}
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1">
          <CircleOfDoom />
        </div>
        <aside className="flex w-full flex-col gap-4 xl:w-[28rem]">
          <TyreStints />
          <RaceControlFeed />
          <TeamRadios />
        </aside>
      </div>
    </>
  );
}
