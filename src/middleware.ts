/**
 * Next.js middleware — runs on every matching request.
 *
 * Applies: trace IDs, auth, rate limiting, CORS.
 * Only runs on /api/* routes.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { handlePreflight, applyCors } from "@/lib/middleware/cors";

export function middleware(request: NextRequest) {
  // Handle CORS preflight
  const preflightResponse = handlePreflight(request);
  if (preflightResponse) return preflightResponse;

  // Auth check
  const authError = checkAuth(request);
  if (authError) return authError;

  // Rate limiting
  const rateLimitError = checkRateLimit(request);
  if (rateLimitError) return rateLimitError;

  // Add trace ID header for downstream use (Edge runtime uses Web Crypto API)
  const traceId = crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-trace-id", traceId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Set trace ID on response too
  response.headers.set("x-trace-id", traceId);

  // Apply CORS headers
  return applyCors(request, response);
}

export const config = {
  matcher: "/api/:path*",
};
