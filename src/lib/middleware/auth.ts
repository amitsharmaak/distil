/**
 * Authentication middleware for API routes.
 *
 * Single-user authentication for private pages and legacy APIs. Routes with
 * specialized authentication (login, capture tokens, queue callbacks) enforce
 * their own policies and are explicitly passed through here.
 *
 * SERVER-SIDE ONLY.
 */

import { NextRequest, NextResponse } from "next/server";
import { readAuthEnvironment } from "@/lib/auth/environment";
import { readSessionCookie } from "@/lib/auth/request";
import { verifySessionToken } from "@/lib/auth/session";
import { measureP8ProxyIdentityLookup } from "@/lib/auth/auth-metrics";
import { getAuthRepositoryPort } from "@/lib/auth/repository-runtime";

const SELF_AUTHENTICATING_PATHS = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/session",
  "/api/health",
  "/api/queue/capture-requests",
  "/api/queue/research-runs",
  "/api/v1/captures",
  "/api/v1/capture-tokens",
] as const;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
export const P8_PROXY_PROBE_HEADER = "x-perf-probe-p8";
const P8_PROXY_PROBE_SUBJECT = "urn:distil:perf-probe:p8:missing";

/**
 * Preview normally uses legacy auth, so its signed-in browser cannot reach the
 * Neon proxy lookup. This temporary, explicit probe exercises the identical
 * SECURITY DEFINER lookup only after legacy authentication succeeds. Both
 * results are intentionally ignored; diagnostic failures cannot change the
 * legacy authorization decision.
 */
async function runP8LegacyProxyProbe(request: NextRequest): Promise<void> {
  if (request.headers.get(P8_PROXY_PROBE_HEADER) !== "1") return;
  try {
    const repositories = await getAuthRepositoryPort();
    await measureP8ProxyIdentityLookup(repositories, {
      provider: "neon",
      providerSubject: P8_PROXY_PROBE_SUBJECT,
    });
  } catch {
    // Temporary observability must never make an authenticated request fail.
  }
}

export function isAuthEnabled(): boolean {
  const environment = readAuthEnvironment();
  return Boolean(environment.passwordHash && environment.sessionSecret);
}

function hasSpecializedAuth(pathname: string): boolean {
  return SELF_AUTHENTICATING_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

async function legacyTokenMatches(request: NextRequest, expected?: string): Promise<boolean> {
  if (!expected) return false;
  const authorization = request.headers.get("authorization");
  const provided = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : request.headers.get("x-api-key");
  if (!provided) return false;

  const encoder = new TextEncoder();
  const [providedDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const left = new Uint8Array(providedDigest);
  const right = new Uint8Array(expectedDigest);
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export async function checkAuth(request: NextRequest): Promise<NextResponse | null> {
  const pathname = request.nextUrl.pathname;
  if (pathname === "/login" || hasSpecializedAuth(pathname)) return null;

  // Production-mode E2E exercises the built application without provisioning
  // user credentials. This flag is set only by the isolated test workflow.
  if (process.env.DISTIL_TEST_MODE === "1") return null;

  const environment = readAuthEnvironment();
  if (!isAuthEnabled()) {
    if (process.env.NODE_ENV !== "production") return null;
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication is not configured" } },
      { status: 503 }
    );
  }

  if (
    request.method === "POST" &&
    pathname === "/api/items" &&
    (await legacyTokenMatches(request, environment.legacyCaptureToken))
  ) {
    return null;
  }

  if (await verifySessionToken(readSessionCookie(request), environment.sessionSecret)) {
    if (
      !SAFE_METHODS.has(request.method) &&
      !environment.allowedOrigins.has(request.headers.get("origin") ?? "")
    ) {
      return NextResponse.json(
        { error: { code: "ORIGIN_NOT_ALLOWED", message: "The request origin is not allowed" } },
        { status: 403 }
      );
    }
    await runP8LegacyProxyProbe(request);
    return null;
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication is required" } },
      { status: 401 }
    );
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}
