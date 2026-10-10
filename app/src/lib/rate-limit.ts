// In-memory per-IP token bucket. Fine for a single-instance demo deployment —
// not shared across serverless instances, but that's an acceptable tradeoff
// here (per CLAUDE.md: "in-memory token bucket is fine for the demo").
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** `key` should be scoped per route ("route:ip"), so a polling agent can't use
 * up a browser's budget on an unrelated route from the same IP. */
export function checkRateLimit(key: string, maxPerMinute = MAX_REQUESTS_PER_WINDOW): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (bucket.count >= maxPerMinute) {
    return false;
  }

  bucket.count += 1;
  return true;
}

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}
