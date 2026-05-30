import { Header } from "@/components/Header";
import { LeaderBoard } from "@/components/LeaderBoard";
import { LiveDataProvider } from "@/components/LiveDataProvider";
import { RaceControl } from "@/components/RaceControl";

export default function Page() {
  return (
    <main className="flex h-screen flex-col">
      <LiveDataProvider />
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <LeaderBoard />
        </div>
        <RaceControl />
      </div>
    </main>
  );
}
