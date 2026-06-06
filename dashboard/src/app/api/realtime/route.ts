export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_REALTIME_URL = "http://localhost:4000";
const RAILWAY_REALTIME_HOSTS = ["realtime", "muretto-realtime"];
const RAILWAY_REALTIME_PORTS = ["80", "8080", "4000"];
const HEALTH_TIMEOUT_MS = 1_500;

function railwayHostCandidates() {
  const serviceName = process.env.RAILWAY_SERVICE_NAME;
  const derivedName = serviceName?.replace(/dashboard/i, "realtime");

  return [derivedName, ...RAILWAY_REALTIME_HOSTS]
    .filter((host): host is string => Boolean(host))
    .map((host) =>
      host
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, ""),
    )
    .filter(Boolean);
}

function railwayBaseUrls() {
  return railwayHostCandidates().flatMap((host) =>
    RAILWAY_REALTIME_PORTS.map(
      (port) => `http://${host}.railway.internal:${port}`,
    ),
  );
}

function candidateBaseUrls() {
  const configured = [
    process.env.REALTIME_URL,
    process.env.NEXT_PUBLIC_LIVE_URL,
  ].filter((url): url is string => Boolean(url));
  const railway = process.env.RAILWAY_ENVIRONMENT_ID ? railwayBaseUrls() : [];

  return Array.from(
    new Set(
      [...configured, ...railway, DEFAULT_REALTIME_URL].map((url) =>
        url.replace(/\/+$/, ""),
      ),
    ),
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
