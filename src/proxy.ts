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
import { readAuthEnvironment } from "@/lib/auth/environment";
import { getAuthRepositoryPort } from "@/lib/auth/repository-runtime";
import { applyPrivateApiCacheControl } from "@/lib/middleware/private-cache";
import { instrumentNeonProxyDependencies } from "@/lib/auth/auth-metrics";
import {
  PROXY_TIMING_HEADER,
  runWithRequestMetrics,
  serverTimingHeader,
  type RequestMetrics,
} from "@/lib/observability/request-metrics";

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

export function proxy(request: NextRequest): Promise<NextResponse> {
  return runWithRequestMetrics((metrics) => handleProxy(request, metrics));
}

async function handleProxy(request: NextRequest, metrics: RequestMetrics) {
  const pathname = request.nextUrl.pathname;
  const isApi = pathname.startsWith("/api/");
  const isInfrastructure = pathname === "/api/health" || pathname === "/api/queue/capture-requests";
  const finish = (response: NextResponse, passThrough = false) => {
    // Durations and counters only (see request-metrics.ts); visible in DevTools.
    // A header on an API pass-through would replace the route's own
    // Server-Timing, so those receive it as a request header instead.
    if (!(isApi && passThrough)) {
      response.headers.set("server-timing", serverTimingHeader(metrics, "proxy"));
    }
    return applyPrivateApiCacheControl(pathname, isApi ? applyCors(request, response) : response);
  };

  if (connectorsDisabled(pathname)) {
    return finish(
      NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Connector routes are disabled" } },
        { status: 404 }
      )
    );
  }

  // Handle CORS preflight
  const preflightResponse = isApi ? handlePreflight(request) : null;
  if (preflightResponse) return finish(preflightResponse);

  const traceId = crypto.randomUUID();
  let requestHeaders = new Headers(request.headers);
  let providerHeaders: Headers | undefined;

  // FEATURE_NEON_AUTH is an exact opt-in. The legacy session path remains the
  // feature-off migration bridge and is not accepted by the Neon path.
  const neonFoundation = readNeonAuthFoundation();
  if (!neonFoundation.enabled) {
    const authError = await checkAuth(request);
    if (authError) return finish(authError);
  } else {
    try {
      const dependencies = instrumentNeonProxyDependencies({
        provider: getNeonAuthServer(),
        repositories: await getAuthRepositoryPort(),
      });
      const authorization = await authorizeNeonProxy(request, traceId, {
        provider: dependencies.provider,
        repositories: dependencies.repositories,
        allowedOrigins: readAuthEnvironment().allowedOrigins,
      });
      if (authorization.response) {
        authorization.response.headers.set("x-trace-id", traceId);
        return finish(authorization.response);
      }
      requestHeaders = authorization.requestHeaders ?? requestHeaders;
      providerHeaders = authorization.providerHeaders;
    } catch {
      const unavailable = NextResponse.json(
        { error: { code: "AUTH_UNAVAILABLE", message: "Authentication is unavailable" } },
        { status: 503 }
      );
      unavailable.headers.set("x-trace-id", traceId);
      return finish(unavailable);
    }
  }

  // Rate limiting
  const rateLimitError = isApi && !isInfrastructure ? checkRateLimit(request) : null;
  if (rateLimitError) return finish(rateLimitError);

  // Add trace ID header for downstream use (Edge runtime uses Web Crypto API)
  requestHeaders.set("x-trace-id", traceId);
  // Never trust a client-supplied value; set or clear it here on every request.
  if (isApi) requestHeaders.set(PROXY_TIMING_HEADER, serverTimingHeader(metrics, "proxy"));
  else requestHeaders.delete(PROXY_TIMING_HEADER);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Set trace ID on response too
  response.headers.set("x-trace-id", traceId);
  providerHeaders?.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") response.headers.append(key, value);
  });

  // Apply CORS headers
  return finish(response, true);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/).*)"],
};
