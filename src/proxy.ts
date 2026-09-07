/**
 * Next.js proxy — runs on every matching request.
 *
 * Applies: trace IDs, auth, rate limiting, CORS.
 * Only runs on /api/* routes.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { handlePreflight, applyCors } from "@/lib/middleware/cors";
import { readNeonAuthFoundation } from "@/lib/auth/neon-auth-foundation";
import { getNeonAuthServer } from "@/lib/auth/neon-server";
import { authorizeNeonProxy } from "@/lib/auth/neon-proxy";
import { getAuthRepositoryPort } from "@/lib/auth/repository-runtime";

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

export async function proxy(request: NextRequest) {
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

  const traceId = crypto.randomUUID();
  let requestHeaders = new Headers(request.headers);
  let providerHeaders: Headers | undefined;

  // FEATURE_NEON_AUTH is an exact opt-in. The legacy session path remains the
  // feature-off migration bridge and is not accepted by the Neon path.
  const neonFoundation = readNeonAuthFoundation();
  if (!neonFoundation.enabled) {
    const authError = await checkAuth(request);
    if (authError) return authError;
  } else {
    try {
      const auth = getNeonAuthServer();
      const authorization = await authorizeNeonProxy(request, traceId, {
        provider: auth,
        repositories: await getAuthRepositoryPort(),
      });
      if (authorization.response) {
        authorization.response.headers.set("x-trace-id", traceId);
        return isApi ? applyCors(request, authorization.response) : authorization.response;
      }
      requestHeaders = authorization.requestHeaders ?? requestHeaders;
      providerHeaders = authorization.providerHeaders;
    } catch {
      const unavailable = NextResponse.json(
        { error: { code: "AUTH_UNAVAILABLE", message: "Authentication is unavailable" } },
        { status: 503 }
      );
      unavailable.headers.set("x-trace-id", traceId);
      return isApi ? applyCors(request, unavailable) : unavailable;
    }
  }

  // Rate limiting
  const rateLimitError = isApi && !isInfrastructure ? checkRateLimit(request) : null;
  if (rateLimitError) return rateLimitError;

  // Add trace ID header for downstream use (Edge runtime uses Web Crypto API)
  requestHeaders.set("x-trace-id", traceId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Set trace ID on response too
  response.headers.set("x-trace-id", traceId);
  providerHeaders?.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") response.headers.append(key, value);
  });

  // Apply CORS headers
  return isApi ? applyCors(request, response) : response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/).*)"],
};
