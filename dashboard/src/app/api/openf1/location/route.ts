import { NextRequest, NextResponse } from "next/server";

import { positionEntryFromOpenF1 } from "@/lib/trackPosition";

const OPENF1_LOCATION = "https://api.openf1.org/v1/location";
const DEFAULT_LOOKBACK_MS = 10_000;
const MAX_LOOKBACK_MS = 30_000;
const MAX_DRIVERS = 30;
const UPSTREAM_TIMEOUT_MS = 4_000;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const apiKey = process.env.OPENF1_API_KEY?.trim();
  if (!apiKey) return unavailable("missing-key");

  const sessionKey = Number(request.nextUrl.searchParams.get("sessionKey"));
  if (!Number.isInteger(sessionKey) || sessionKey <= 0) {
    return NextResponse.json({ error: "Invalid sessionKey" }, { status: 400 });
  }

  const drivers = parseDrivers(request.nextUrl.searchParams.get("drivers"));
  if (!drivers) {
    return NextResponse.json({ error: "Invalid drivers" }, { status: 400 });
  }

  const lookbackMs = parseLookback(request.nextUrl.searchParams.get("lookbackMs"));
  const upstream = new URL(OPENF1_LOCATION);
  upstream.searchParams.set("session_key", String(sessionKey));
  upstream.searchParams.set("date>", new Date(Date.now() - lookbackMs).toISOString());
  for (const driver of drivers) {
    upstream.searchParams.append("driver_number", driver);
  }

  let response: Response;
  try {
    response = await fetch(upstream, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return NextResponse.json({ error: "OpenF1 location unavailable" }, { status: 502 });
  }

  if (response.status === 401 || response.status === 402 || response.status === 403) {
    return unavailable("unauthorized");
  }
  if (!response.ok) {
    return NextResponse.json({ error: "OpenF1 location unavailable" }, { status: 502 });
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return NextResponse.json({ error: "OpenF1 location unavailable" }, { status: 502 });
  }
  if (!Array.isArray(body)) return NextResponse.json(null);

  return NextResponse.json(positionEntryFromOpenF1(body));
}

function parseDrivers(value: string | null) {
  if (!value) return [];

  const drivers = value
    .split(",")
    .map((driver) => driver.trim())
    .filter(Boolean);

  if (
    drivers.length > MAX_DRIVERS ||
    !drivers.every((driver) => /^\d{1,3}$/.test(driver))
  ) {
    return null;
  }

  return Array.from(new Set(drivers));
}

function parseLookback(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LOOKBACK_MS;
  return Math.min(Math.max(Math.trunc(parsed), 1_000), MAX_LOOKBACK_MS);
}

function unavailable(reason: string) {
  return new Response(null, {
    status: 204,
    headers: { "X-Muretto-Position-Fallback": reason },
  });
}
