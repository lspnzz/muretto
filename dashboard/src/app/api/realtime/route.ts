export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_REALTIME_URL = "http://localhost:4000";
const RAILWAY_REALTIME_URLS = [
  "http://realtime.railway.internal:80",
  "http://realtime.railway.internal:8080",
  "http://realtime.railway.internal:4000",
];
const HEALTH_TIMEOUT_MS = 1_500;

function candidateBaseUrls() {
  const configured = [
    process.env.REALTIME_URL,
    process.env.NEXT_PUBLIC_LIVE_URL,
  ].filter((url): url is string => Boolean(url));
  const railway = process.env.RAILWAY_ENVIRONMENT_ID ? RAILWAY_REALTIME_URLS : [];

  return [...configured, ...railway, DEFAULT_REALTIME_URL].map((url) =>
    url.replace(/\/+$/, ""),
  );
}

async function firstReachableBase(requestSignal: AbortSignal) {
  for (const base of candidateBaseUrls()) {
    try {
      const timeout = AbortSignal.timeout(HEALTH_TIMEOUT_MS);
      const response = await fetch(`${base}/api/health`, {
        cache: "no-store",
        signal: AbortSignal.any([requestSignal, timeout]),
      });
      if (response.ok) return base;
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

export async function GET(request: Request) {
  const base = await firstReachableBase(request.signal);
  if (!base) {
    return new Response("Realtime unavailable", { status: 502 });
  }

  let upstream: Response;

  try {
    upstream = await fetch(`${base}/api/realtime`, {
      cache: "no-store",
      headers: { Accept: "text/event-stream" },
      signal: request.signal,
    });
  } catch {
    return new Response("Realtime unavailable", { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return new Response("Realtime unavailable", { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no",
    },
  });
}
