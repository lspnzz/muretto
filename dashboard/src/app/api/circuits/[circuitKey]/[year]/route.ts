import { NextResponse } from "next/server";

const MULTIVIEWER_API = "https://api.multiviewer.app/api/v1/circuits";
const REVALIDATE_SECONDS = 60 * 60 * 24;

type CircuitIndexEntry = {
  years?: number[];
};

type RouteContext = {
  params: Promise<{
    circuitKey: string;
    year: string;
  }>;
};

export const revalidate = 86400;

export async function GET(_request: Request, context: RouteContext) {
  const { circuitKey, year } = await context.params;
  const key = Number(circuitKey);
  const requestedYear = Number(year);

  if (!Number.isInteger(key) || !Number.isInteger(requestedYear)) {
    return NextResponse.json({ error: "Invalid circuit key or year" }, { status: 400 });
  }

  const response = await fetchCircuit(key, requestedYear);
  if (response.ok) {
    return withCacheHeaders(await response.json(), requestedYear);
  }

  const fallbackYear = await findFallbackYear(key, requestedYear);
  if (!fallbackYear || fallbackYear === requestedYear) {
    return NextResponse.json({ error: "Circuit map not found" }, { status: 404 });
  }

  const fallback = await fetchCircuit(key, fallbackYear);
  if (!fallback.ok) {
    return NextResponse.json({ error: "Circuit map not found" }, { status: 404 });
  }

  return withCacheHeaders(await fallback.json(), fallbackYear);
}

function fetchCircuit(circuitKey: number, year: number) {
  return fetch(`${MULTIVIEWER_API}/${circuitKey}/${year}`, {
    next: { revalidate: REVALIDATE_SECONDS },
  });
}

async function findFallbackYear(circuitKey: number, requestedYear: number) {
  const response = await fetch(MULTIVIEWER_API, {
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (!response.ok) return null;

  const index = (await response.json()) as Record<string, CircuitIndexEntry>;
  const years = index[String(circuitKey)]?.years?.filter(Number.isInteger).sort((a, b) => b - a);
  if (!years || years.length === 0) return null;

  return years.find((year) => year <= requestedYear) ?? years[0];
}

function withCacheHeaders(body: unknown, year: number) {
  const response = NextResponse.json(body);
  response.headers.set("Cache-Control", `public, s-maxage=${REVALIDATE_SECONDS}`);
  response.headers.set("X-Muretto-Circuit-Year", String(year));
  return response;
}
