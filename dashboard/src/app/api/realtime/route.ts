export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_REALTIME_URL = "http://localhost:4000";

function realtimeUrl() {
  const base =
    process.env.REALTIME_URL ??
    process.env.NEXT_PUBLIC_LIVE_URL ??
    DEFAULT_REALTIME_URL;
  return `${base.replace(/\/+$/, "")}/api/realtime`;
}

export async function GET(request: Request) {
  let upstream: Response;

  try {
    upstream = await fetch(realtimeUrl(), {
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
