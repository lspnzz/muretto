import { Header } from "@/components/Header";
import { LiveDataProvider } from "@/components/LiveDataProvider";
import { StrategyWheel } from "@/components/StrategyWheel";

export default function StrategyPage() {
  return (
    <main className="flex h-screen flex-col">
      <LiveDataProvider />
      <Header />
      <div className="min-h-0 flex-1 overflow-auto">
        <StrategyWheel />
      </div>
    </main>
  );
}
