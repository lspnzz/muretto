import { redirect } from "next/navigation";

// Strategy and Timings merged into the Pit wall tab — keep the old URL working.
export default function StrategyPage() {
  redirect("/pitwall");
}
