import { NextRequest, NextResponse } from "next/server";
import { AccessDeniedError } from "@/lib/auth/account";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import type { AuthRepositoryPort } from "@/lib/auth/ports";
import {
  resolveNeonAuthRequest,
  resolveNeonLifecycleRecoveryRequest,
  type ProviderIdentityPort,
} from "@/lib/auth/request-context";

const PUBLIC_PATHS = new Set([
  "/invite",
  "/access-denied",
  "/api/health",
  "/api/queue/capture-requests",
]);
const PUBLIC_AUTH_PATHS = new Set([
  "/api/auth/invitations/request-link",
  "/api/auth/invitations/complete",
  "/api/auth/get-session",
  "/api/auth/magic-link/verify",
  "/api/auth/sign-out",
]);
const PROTECTED_AUTH_PREFIXES = [
  "/api/auth/account",
  "/api/auth/devices",
  "/api/auth/gmail",
  "/api/auth/slack",
] as const;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export interface NeonProxyProvider extends ProviderIdentityPort {
  middleware(config: { loginUrl: string }): (request: NextRequest) => Promise<NextResponse>;
}

export function isPublicNeonPath(pathname: string): boolean {
  if (pathname.startsWith("/api/auth/")) {
    if (
      PROTECTED_AUTH_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
      )
    ) {
      return false;
    }
    // Known public auth routes are handled explicitly. Everything else falls
    // through to the catch-all's pre-SDK 404 gate.
    return true;
  }
  return (
    PUBLIC_PATHS.has(pathname) ||
    PUBLIC_AUTH_PATHS.has(pathname) ||
    pathname === "/api/v1/captures" ||
    pathname.startsWith("/api/v1/captures/")
  );
}

/** Method-specific routes whose handler authenticates a session or bearer principal itself. */
export function hasSpecializedNeonAuth(pathname: string, method: string): boolean {
  return pathname === "/api/items" && (method === "POST" || method === "OPTIONS");
}

/** Central cookie-session CSRF classification after public/specialized routes have exited. */
export function requiresNeonSessionOrigin(method: string): boolean {
  return !SAFE_METHODS.has(method);
}

/** The only proxy capability that accepts a deletion-pending internal account. */
export function isLifecycleRecoveryRequest(pathname: string, method: string): boolean {
  if (pathname === "/account") return method === "GET" || method === "HEAD";
  return pathname === "/api/v1/account/deletion" && (method === "GET" || method === "DELETE");
}

export async function authorizeNeonProxy(
  request: NextRequest,
  requestId: string,
  dependencies: {
    provider: NeonProxyProvider;
    repositories: AuthRepositoryPort;
    allowedOrigins: ReadonlySet<string>;
  }
): Promise<{ response?: NextResponse; requestHeaders?: Headers; providerHeaders?: Headers }> {
  if (
    isPublicNeonPath(request.nextUrl.pathname) ||
    hasSpecializedNeonAuth(request.nextUrl.pathname, request.method)
  ) {
    return { requestHeaders: new Headers(request.headers) };
  }

  // Force the SDK middleware past its signed session-data cookie so a
  // provider-side revocation takes effect on this request. Use a verification
  // request rather than mutating the URL that continues to the application.
  const verificationUrl = request.nextUrl.clone();
  verificationUrl.searchParams.set("disableCookieCache", "true");
  const verificationRequest = new NextRequest(verificationUrl, {
    method: "GET",
    headers: request.headers,
  });
  const providerResponse = await dependencies.provider.middleware({ loginUrl: "/invite" })(
    verificationRequest
  );
  if (providerResponse.headers.get("x-middleware-next") !== "1") {
    return { response: providerResponse };
  }

  try {
    if (requiresNeonSessionOrigin(request.method)) {
      requireAllowedOrigin(request, dependencies.allowedOrigins);
    }
    const resolveRequest = isLifecycleRecoveryRequest(request.nextUrl.pathname, request.method)
      ? resolveNeonLifecycleRecoveryRequest
      : resolveNeonAuthRequest;
    const resolved = await resolveRequest(
      dependencies.provider,
      dependencies.repositories,
      requestId
    );
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-distil-user-id", resolved.context.userId);
    requestHeaders.set("x-distil-actor-id", resolved.context.actorId);
    requestHeaders.set("x-distil-actor-kind", resolved.context.actorKind);
    requestHeaders.set("x-distil-fresh-auth", resolved.freshAuth.isFresh ? "1" : "0");
    return { requestHeaders, providerHeaders: providerResponse.headers };
  } catch (error) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      const status =
        error instanceof AccessDeniedError && error.reason === "unauthenticated" ? 401 : 403;
      return {
        response: NextResponse.json(
          {
            error: {
              code: status === 401 ? "UNAUTHORIZED" : "ACCESS_DENIED",
              message: "Unable to continue",
            },
          },
          { status }
        ),
      };
    }
    return { response: NextResponse.redirect(new URL("/access-denied", request.url)) };
  }
}
