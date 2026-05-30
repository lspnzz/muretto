import { Header } from "@/components/Header";
import { LeaderBoard } from "@/components/LeaderBoard";
import { LiveDataProvider } from "@/components/LiveDataProvider";
import { RaceControl } from "@/components/RaceControl";
import { TrackMap } from "@/components/TrackMap";
import { WeatherPanel } from "@/components/WeatherPanel";

export default function Page() {
  return (
    <main className="flex h-screen flex-col">
      <LiveDataProvider />
      <Header />
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <LeaderBoard />
        </div>
        <aside className="flex max-h-[48vh] shrink-0 flex-col border-t border-zinc-800 lg:max-h-none lg:w-96 lg:border-l lg:border-t-0">
          <TrackMap />
          <WeatherPanel />
          <RaceControl />
        </aside>
      </div>
    </main>
  );
}
