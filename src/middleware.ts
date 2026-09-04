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

const CONNECTOR_API_PREFIXES = [
  "/api/auth/gmail",
  "/api/auth/slack",
  "/api/gmail",
  "/api/slack",
  "/api/publishers",
] as const;

function connectorsDisabled(pathname: string): boolean {
  return (
    process.env.FEATURE_CONNECTORS === "false" &&
    CONNECTOR_API_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    )
  );
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isApi = pathname.startsWith("/api/");
  const isInfrastructure = pathname === "/api/health" || pathname === "/api/queue/capture-requests";

  if (connectorsDisabled(pathname)) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Connector routes are disabled" } },
      { status: 404 }
    );
  }

  // Handle CORS preflight
  const preflightResponse = isApi ? handlePreflight(request) : null;
  if (preflightResponse) return preflightResponse;

  // Auth check
  const authError = await checkAuth(request);
  if (authError) return authError;

  // Rate limiting
  const rateLimitError = isApi && !isInfrastructure ? checkRateLimit(request) : null;
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
  return isApi ? applyCors(request, response) : response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/).*)"],
};
