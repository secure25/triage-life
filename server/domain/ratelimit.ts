/**
 * Minimal in-memory sliding-window rate limiter for expensive routes
 * (processing, uploads). Bounded behavior per spec §12 — not a replacement
 * for infrastructure-level limits, but enough to keep a single user from
 * hammering OCR/agent endpoints in a loop.
 */

const buckets = new Map<string, number[]>();

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const windowStart = now - windowMs;
  const hits = (buckets.get(key) ?? []).filter(time => time > windowStart);

  if (hits.length >= limit) {
    const oldest = hits[0]!;
    return { allowed: false, retryAfterMs: oldest + windowMs - now };
  }

  hits.push(now);
  buckets.set(key, hits);

  // Opportunistic cleanup so the map cannot grow without bound.
  if (buckets.size > 10_000) {
    for (const [bucketKey, times] of Array.from(buckets.entries())) {
      if (times.every((time: number) => time <= windowStart)) {
        buckets.delete(bucketKey);
      }
    }
  }

  return { allowed: true, retryAfterMs: 0 };
}
