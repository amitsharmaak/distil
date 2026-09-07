import { NextRequest, NextResponse } from "next/server";
import { AccessDeniedError } from "@/lib/auth/account";
import type { AuthRepositoryPort } from "@/lib/auth/ports";
import { resolveNeonAuthRequest, type ProviderIdentityPort } from "@/lib/auth/request-context";

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

export async function authorizeNeonProxy(
  request: NextRequest,
  requestId: string,
  dependencies: { provider: NeonProxyProvider; repositories: AuthRepositoryPort }
): Promise<{ response?: NextResponse; requestHeaders?: Headers; providerHeaders?: Headers }> {
  if (isPublicNeonPath(request.nextUrl.pathname)) {
    return { requestHeaders: new Headers(request.headers) };
  }

  const providerResponse = await dependencies.provider.middleware({ loginUrl: "/invite" })(request);
  if (providerResponse.headers.get("x-middleware-next") !== "1") {
    return { response: providerResponse };
  }

  try {
    const resolved = await resolveNeonAuthRequest(
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
