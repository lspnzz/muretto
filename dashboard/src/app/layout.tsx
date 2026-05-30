import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "muretto — F1 live timing",
  description: "Real-time Formula 1 timing and telemetry.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-black text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
