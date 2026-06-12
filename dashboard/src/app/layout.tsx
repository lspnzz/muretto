import type { Metadata } from "next";

import "./globals.css";

import { Header } from "@/components/Header";
import { LiveDataProvider } from "@/components/LiveDataProvider";

export const metadata: Metadata = {
  title: "muretto — F1 live timing",
  description: "Real-time Formula 1 timing and telemetry.",
};

// The SSE engine and header live in the layout so the connection and the
// merged state survive tab switches.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-black text-zinc-100 antialiased">
        <LiveDataProvider />
        <div className="flex h-screen flex-col">
          <Header />
          <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
