/**
 * Next.js proxy — runs on every matching request.
 *
 * Applies: header sanitizing, trace IDs, rate limiting, auth, CORS.
 * Runs on pages and API routes alike (see the matcher below).
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { handlePreflight, applyCors } from "@/lib/middleware/cors";
import { readNeonAuthFoundation } from "@/lib/auth/neon-auth-foundation";
import { getNeonProxyProvider } from "@/lib/auth/neon-server";
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

/** Headers only this proxy may set; anything inbound under them is dropped. */
const INTERNAL_HEADER_PREFIX = "x-distil-";
const TRACE_HEADER = "x-trace-id";

function connectorsDisabled(pathname: string): boolean {
  return (
    process.env.FEATURE_CONNECTORS === "false" &&
    CONNECTOR_API_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    )
  );
}

/**
 * Drop every inbound `x-distil-*` and `x-trace-id` header before any branch
 * runs, so the identity token, the trace id and the timing handoff can only
 * originate here. Returns a request whose headers are the sanitized set.
 */
function sanitizeInboundRequest(inbound: NextRequest): NextRequest {
  const headers = new Headers(inbound.headers);
  for (const name of [...headers.keys()]) {
    if (name.startsWith(INTERNAL_HEADER_PREFIX) || name === TRACE_HEADER) headers.delete(name);
  }
  return new NextRequest(inbound.url, { method: inbound.method, headers });
}

export function proxy(request: NextRequest): Promise<NextResponse> {
  return runWithRequestMetrics((metrics) => handleProxy(request, metrics));
}

async function handleProxy(inbound: NextRequest, metrics: RequestMetrics) {
  const request = sanitizeInboundRequest(inbound);
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

  // Rate limiting runs before the expensive authentication work.
  const rateLimitError = isApi && !isInfrastructure ? checkRateLimit(request) : null;
  if (rateLimitError) return finish(rateLimitError);

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
        provider: getNeonProxyProvider(),
        // Lazy: public and specialized paths never open the database.
        repositories: getAuthRepositoryPort,
      });
      const authorization = await authorizeNeonProxy(request, traceId, {
        provider: dependencies.provider,
        repositories: dependencies.repositories,
        allowedOrigins: readAuthEnvironment().allowedOrigins,
        identityTokenSecret: readAuthEnvironment().identityTokenSecret,
      });
      if (authorization.response) {
        authorization.response.headers.set(TRACE_HEADER, traceId);
        return finish(authorization.response);
      }
      requestHeaders = authorization.requestHeaders ?? requestHeaders;
      providerHeaders = authorization.providerHeaders;
    } catch {
      const unavailable = NextResponse.json(
        { error: { code: "AUTH_UNAVAILABLE", message: "Authentication is unavailable" } },
        { status: 503 }
      );
      unavailable.headers.set(TRACE_HEADER, traceId);
      return finish(unavailable);
    }
  }

  // Add trace ID header for downstream use (Edge runtime uses Web Crypto API)
  requestHeaders.set(TRACE_HEADER, traceId);
  // Never trust a client-supplied value; set or clear it here on every request.
  if (isApi) requestHeaders.set(PROXY_TIMING_HEADER, serverTimingHeader(metrics, "proxy"));
  else requestHeaders.delete(PROXY_TIMING_HEADER);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Set trace ID on response too
  response.headers.set(TRACE_HEADER, traceId);
  providerHeaders?.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") response.headers.append(key, value);
  });

  // Apply CORS headers
  return finish(response, true);
}

export const config = {
  // Static assets are excluded; RSC prefetches stay covered because they carry
  // tenant data.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|robots.txt|sitemap.xml|logo.png|sw.js|.*\\.svg).*)",
  ],
};
