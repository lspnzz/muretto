export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_REALTIME_URL = "http://localhost:4000";
const RAILWAY_REALTIME_HOSTS = [
  "muretto",
  "realtime",
  "muretto-realtime",
  "muretto---realtime",
  "muretto--realtime",
  "46bdae13-7398-441b-98c0-327f9a87c3bd",
];
const RAILWAY_REALTIME_PORTS = ["80", "8080", "3000", "4000", "5000", "8000"];
const HEALTH_TIMEOUT_MS = 1_500;

type ProbeResult = {
  base: string;
  ok: boolean;
};

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeRailwayHost(host: string, collapseDashes: boolean) {
  const normalized = host
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-");

  return (collapseDashes ? normalized.replace(/-+/g, "-") : normalized).replace(
    /^-|-$/g,
    "",
  );
}

function railwayHostCandidates() {
  const serviceName = process.env.RAILWAY_SERVICE_NAME;
  const derivedName = serviceName?.replace(/dashboard/i, "realtime");

  return unique(
    [derivedName, ...RAILWAY_REALTIME_HOSTS]
      .filter((host): host is string => Boolean(host))
      .flatMap((host) => [
        normalizeRailwayHost(host, true),
        normalizeRailwayHost(host, false),
      ]),
  );
}

function railwayPortCandidates() {
  return unique(
    [process.env.REALTIME_PORT, ...RAILWAY_REALTIME_PORTS]
      .filter((port): port is string => Boolean(port))
      .map((port) => port.trim()),
  );
}

function railwayBaseUrls() {
  return railwayHostCandidates().flatMap((host) =>
    railwayPortCandidates().map(
      (port) => `http://${host}.railway.internal:${port}`,
    ),
  );
}

function expandConfiguredUrl(url: string) {
  const trimmed = url.replace(/\/+$/, "");

  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.endsWith(".railway.internal")) {
      return unique([
        trimmed,
        ...railwayPortCandidates().map(
          (port) => `http://${parsed.hostname}:${port}`,
        ),
      ]);
    }
  } catch {
    // Keep the original value below.
  }

  return [trimmed];
}

function candidateBaseUrls() {
  const configured = [
    process.env.REALTIME_URL,
    process.env.NEXT_PUBLIC_LIVE_URL,
  ]
    .filter((url): url is string => Boolean(url))
    .flatMap(expandConfiguredUrl);
  const railway = process.env.RAILWAY_ENVIRONMENT_ID ? railwayBaseUrls() : [];

  return unique(
    [...configured, ...railway, DEFAULT_REALTIME_URL].map((url) =>
      url.replace(/\/+$/, ""),
    ),
  );
}

function signalWithTimeout(requestSignal: AbortSignal) {
  const timeout = AbortSignal.timeout(HEALTH_TIMEOUT_MS);

  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([requestSignal, timeout]);
  }

  return timeout;
}

async function probeBase(
  base: string,
  requestSignal: AbortSignal,
): Promise<ProbeResult> {
  try {
    const response = await fetch(`${base}/api/health`, {
      cache: "no-store",
      signal: signalWithTimeout(requestSignal),
    });

    return { base, ok: response.ok };
  } catch {
    return { base, ok: false };
  }
}

async function probeCandidates(requestSignal: AbortSignal) {
  return Promise.all(
    candidateBaseUrls().map((base) => probeBase(base, requestSignal)),
  );
}

async function firstReachableBase(requestSignal: AbortSignal) {
  const probes = await probeCandidates(requestSignal);
  return probes.find((probe) => probe.ok)?.base ?? null;
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
