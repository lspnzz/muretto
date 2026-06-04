"use client";

import { useState } from "react";

import { LeaderBoard } from "@/components/LeaderBoard";
import { StrategyWheel } from "@/components/StrategyWheel";

type MobileRaceTab = "race" | "timings";

const TABS: { id: MobileRaceTab; label: string }[] = [
  { id: "race", label: "Race" },
  { id: "timings", label: "Timings" },
];

export function MobileRaceTabs() {
  const [activeTab, setActiveTab] = useState<MobileRaceTab>("race");

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="border-b border-zinc-800 px-3 py-2">
        <div
          className="grid grid-cols-2 rounded-md border border-zinc-800 bg-zinc-950 p-1"
          role="tablist"
          aria-label="Race view"
        >
          {TABS.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`${tab.id}-panel`}
                id={`${tab.id}-tab`}
                className={[
                  "h-9 rounded-sm text-sm font-medium transition-colors",
                  active
                    ? "bg-zinc-100 text-zinc-950"
                    : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200",
                ].join(" ")}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div
          role="tabpanel"
          id="race-panel"
          aria-labelledby="race-tab"
          hidden={activeTab !== "race"}
          className="h-full"
        >
          <StrategyWheel variant="compact" />
        </div>
        <div
          role="tabpanel"
          id="timings-panel"
          aria-labelledby="timings-tab"
          hidden={activeTab !== "timings"}
          className="h-full overflow-auto"
        >
          <LeaderBoard />
        </div>
      </div>
    </section>
  );
}
