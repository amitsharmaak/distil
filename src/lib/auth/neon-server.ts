import { createNeonAuth, type NeonAuth } from "@neondatabase/auth/next/server";
import { readNeonAuthFoundation } from "@/lib/auth/neon-auth-foundation";
import type { NeonProxyProvider, VerifiedProviderSession } from "@/lib/auth/neon-proxy";
import type { ProviderSessionResult } from "@/lib/auth/request-context";

let cached: { baseUrl: string; secret: string; auth: NeonAuth } | undefined;

/** The provider's session-token cookie; without it no request can be authenticated. */
const NEON_SESSION_TOKEN_COOKIE = "__Secure-neon-auth.session_token";
const BODY_HEADERS = ["content-type", "content-length", "transfer-encoding"] as const;

export class NeonAuthConfigurationError extends Error {
  constructor(readonly missing: readonly string[]) {
    super("Neon Auth is unavailable");
    this.name = "NeonAuthConfigurationError";
  }
}

export function getNeonAuthServer(
  environment: Readonly<Record<string, string | undefined>> = process.env
): NeonAuth {
  const foundation = readNeonAuthFoundation(environment);
  if (foundation.status !== "ready") throw new NeonAuthConfigurationError(foundation.missing);

  const baseUrl = environment.NEON_AUTH_BASE_URL!;
  const secret = environment.NEON_AUTH_COOKIE_SECRET!;
  if (cached?.baseUrl === baseUrl && cached.secret === secret) return cached.auth;

  const auth = createNeonAuth({
    baseUrl,
    cookies: { secret, sessionDataTtl: 300, sameSite: "lax" },
    logLevel: "warn",
  });
  cached = { baseUrl, secret, auth };
  return auth;
}

/** The subset of the SDK the proxy verification needs: its public route handler. */
export interface NeonSessionHandlerSource {
  handler(): {
    GET(request: Request, context: { params: Promise<{ path: string[] }> }): Promise<Response>;
  };
}

function providerSession(body: unknown): ProviderSessionResult {
  if (typeof body !== "object" || body === null) return { data: null, error: null };
  const { user, session } = body as { user?: unknown; session?: unknown };
  if (
    typeof user !== "object" ||
    user === null ||
    typeof session !== "object" ||
    session === null
  ) {
    return { data: null, error: null };
  }
  return {
    data: {
      user: user as NonNullable<ProviderSessionResult["data"]>["user"],
      session: session as NonNullable<ProviderSessionResult["data"]>["session"],
    },
    error: null,
  };
}

/**
 * Verify the inbound session with exactly one uncached provider round trip.
 *
 * Runs the SDK's own `GET /api/auth/get-session?disableCookieCache=true`
 * handler (the same code path `src/app/api/auth/[...path]/route.ts` exposes)
 * against a synthetic request that carries the inbound cookies. The JSON body
 * is the provider session; the `Set-Cookie` headers are the refreshed
 * `session_data` cookie, which the caller forwards to the browser.
 * `disableCookieCache` makes the SDK skip its signed cookie cache, so a
 * provider-side revocation is observed on this request.
 */
export async function verifyNeonSession(
  auth: NeonSessionHandlerSource,
  request: Request
): Promise<VerifiedProviderSession> {
  const cookieHeader = request.headers.get("cookie") ?? "";
  if (!cookieHeader.includes(NEON_SESSION_TOKEN_COOKIE)) {
    return { session: { data: null, error: null }, headers: new Headers() };
  }

  const headers = new Headers(request.headers);
  for (const name of BODY_HEADERS) headers.delete(name);
  const verificationUrl = new URL("/api/auth/get-session", request.url);
  verificationUrl.searchParams.set("disableCookieCache", "true");
  const response = await auth
    .handler()
    .GET(new Request(verificationUrl, { method: "GET", headers }), {
      params: Promise.resolve({ path: ["get-session"] }),
    });

  const providerHeaders = new Headers();
  for (const cookie of response.headers.getSetCookie()) {
    providerHeaders.append("set-cookie", cookie);
  }
  if (!response.ok) {
    return {
      session: { data: null, error: { status: response.status } },
      headers: providerHeaders,
    };
  }
  const body: unknown = await response.json().catch(() => null);
  return { session: providerSession(body), headers: providerHeaders };
}

/** The proxy's view of the provider: one verification per request, nothing else. */
export function getNeonProxyProvider(
  auth: NeonSessionHandlerSource = getNeonAuthServer()
): NeonProxyProvider {
  return { verifySession: (request) => verifyNeonSession(auth, request) };
}
