import { NextRequest, NextResponse } from "next/server";
import { AccessDeniedError } from "@/lib/auth/account";
import { AuthError } from "@/lib/auth/errors";
import { createIdentityToken, IDENTITY_HEADER } from "@/lib/auth/identity-token";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import type { AuthRepositoryPort } from "@/lib/auth/ports";
import {
  resolveNeonAuthRequest,
  resolveNeonLifecycleRecoveryRequest,
  type ProviderSessionResult,
} from "@/lib/auth/request-context";

const PUBLIC_PATHS = new Set([
  "/invite",
  "/sign-in",
  "/access-denied",
  "/reset-password",
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
const LOGIN_PATH = "/sign-in";

/** One uncached provider verification: the session and the provider's refreshed cookies. */
export interface VerifiedProviderSession {
  session: ProviderSessionResult;
  /** `Set-Cookie` headers the provider wants forwarded to the browser. */
  headers: Headers;
}

export interface NeonProxyProvider {
  verifySession(request: NextRequest): Promise<VerifiedProviderSession>;
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

function deniedResponse(request: NextRequest, error: unknown): NextResponse {
  const unauthenticated = error instanceof AccessDeniedError && error.reason === "unauthenticated";
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const status = unauthenticated ? 401 : 403;
    return NextResponse.json(
      {
        error: {
          code: status === 401 ? "UNAUTHORIZED" : "ACCESS_DENIED",
          message: "Unable to continue",
        },
      },
      { status }
    );
  }
  // Pages: no session goes to sign-in; a session without an active internal
  // account goes to the explanation page.
  return NextResponse.redirect(
    new URL(unauthenticated ? LOGIN_PATH : "/access-denied", request.url)
  );
}

/**
 * Authorize one request with exactly one uncached provider check and one
 * account lookup, then hand the identity to the application as a signed,
 * trace-bound `x-distil-identity` token. The caller strips every inbound
 * `x-distil-*` header before calling, so the returned headers are the only
 * source of that token. The repositories are loaded lazily so public paths
 * never open the database.
 */
export async function authorizeNeonProxy(
  request: NextRequest,
  requestId: string,
  dependencies: {
    provider: NeonProxyProvider;
    repositories: () => Promise<AuthRepositoryPort>;
    allowedOrigins: ReadonlySet<string>;
    identityTokenSecret: string;
  }
): Promise<{ response?: NextResponse; requestHeaders?: Headers; providerHeaders?: Headers }> {
  if (
    isPublicNeonPath(request.nextUrl.pathname) ||
    hasSpecializedNeonAuth(request.nextUrl.pathname, request.method)
  ) {
    return { requestHeaders: new Headers(request.headers) };
  }

  let providerHeaders: Headers | undefined;
  try {
    if (requiresNeonSessionOrigin(request.method)) {
      requireAllowedOrigin(request, dependencies.allowedOrigins);
    }
    // The single provider round trip for this request. Its session feeds the
    // unchanged resolver through a one-shot adapter; nothing may call the
    // provider again.
    const verified = await dependencies.provider.verifySession(request);
    providerHeaders = verified.headers;
    if (!verified.session.data?.user || !verified.session.data.session) {
      // No session: deny before the repositories are ever loaded. The resolver
      // below re-applies this and the remaining identity checks.
      throw new AccessDeniedError("unauthenticated");
    }
    const oneShotProvider = { getSession: async () => verified.session };
    const resolveRequest = isLifecycleRecoveryRequest(request.nextUrl.pathname, request.method)
      ? resolveNeonLifecycleRecoveryRequest
      : resolveNeonAuthRequest;
    const resolved = await resolveRequest(
      oneShotProvider,
      await dependencies.repositories(),
      requestId
    );
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(
      IDENTITY_HEADER,
      await createIdentityToken(
        {
          userId: resolved.context.userId,
          actorKind: resolved.context.actorKind,
          sessionId: resolved.context.sessionId,
          fresh: resolved.freshAuth.isFresh,
          traceId: requestId,
        },
        dependencies.identityTokenSecret
      )
    );
    return { requestHeaders, providerHeaders };
  } catch (error) {
    // Only authorization outcomes become denials; a provider or database
    // failure propagates so the proxy answers 503 instead of a false 403.
    if (!(error instanceof AccessDeniedError || error instanceof AuthError)) throw error;
    const response = deniedResponse(request, error);
    providerHeaders?.forEach((value, key) => {
      if (key.toLowerCase() === "set-cookie") response.headers.append(key, value);
    });
    return { response };
  }
}
