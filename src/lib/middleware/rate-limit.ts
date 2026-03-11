/**
 * In-memory token-bucket rate limiter for API routes.
 *
 * Tracks requests by IP + endpoint. Configurable per-endpoint limits.
 * Resets on server restart (acceptable for single-user app).
 *
 * SERVER-SIDE ONLY.
 */

import { NextRequest, NextResponse } from "next/server";

interface BucketConfig {
  maxTokens: number;
  refillRate: number; // tokens per second
}

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const DEFAULT_CONFIG: BucketConfig = { maxTokens: 60, refillRate: 1 };

const ENDPOINT_CONFIGS: Record<string, BucketConfig> = {
  "/api/ai/summarize": { maxTokens: 30, refillRate: 0.5 },
  "/api/ai/research": { maxTokens: 20, refillRate: 0.33 },
  "/api/ai/prioritize": { maxTokens: 20, refillRate: 0.33 },
  "/api/ai/feedback": { maxTokens: 30, refillRate: 0.5 },
  "/api/ai/preferences": { maxTokens: 10, refillRate: 0.17 },
  "/api/gmail/sync": { maxTokens: 2, refillRate: 0.00056 }, // ~2/hour
  "/api/slack/sync": { maxTokens: 2, refillRate: 0.00056 },
  "/api/items": { maxTokens: 60, refillRate: 1 },
  "/api/agent/chat": { maxTokens: 20, refillRate: 0.33 },
};

const buckets = new Map<string, Bucket>();

// Clean up stale buckets inline during rate-limit checks (Edge-compatible).
function pruneStale() {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [key, bucket] of buckets) {
    if (bucket.lastRefill < cutoff) {
      buckets.delete(key);
    }
  }
}

function getConfig(pathname: string): BucketConfig {
  // Match exact or prefix
  for (const [pattern, config] of Object.entries(ENDPOINT_CONFIGS)) {
    if (pathname === pattern || pathname.startsWith(pattern + "/")) {
      return config;
    }
  }
  return DEFAULT_CONFIG;
}

function getBucketKey(ip: string, pathname: string): string {
  // Normalize pathname to base endpoint
  for (const pattern of Object.keys(ENDPOINT_CONFIGS)) {
    if (pathname === pattern || pathname.startsWith(pattern + "/")) {
      return `${ip}:${pattern}`;
    }
  }
  return `${ip}:${pathname}`;
}

/**
 * Checks rate limit for a request. Returns null if allowed,
 * or a 429 response if rate limited.
 */
export function checkRateLimit(request: NextRequest): NextResponse | null {
  pruneStale();
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "127.0.0.1";
  const pathname = new URL(request.url).pathname;
  const config = getConfig(pathname);
  const key = getBucketKey(ip, pathname);

  let bucket = buckets.get(key);
  const now = Date.now();

  if (!bucket) {
    bucket = { tokens: config.maxTokens, lastRefill: now };
    buckets.set(key, bucket);
  }

  // Refill tokens based on elapsed time
  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(
    config.maxTokens,
    bucket.tokens + elapsed * config.refillRate,
  );
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    const retryAfter = Math.ceil((1 - bucket.tokens) / config.refillRate);
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      },
    );
  }

  bucket.tokens -= 1;
  return null;
}
