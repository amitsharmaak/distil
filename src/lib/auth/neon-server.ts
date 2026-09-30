import { createNeonAuth, type NeonAuth } from "@neondatabase/auth/next/server";
import { readNeonAuthFoundation } from "@/lib/auth/neon-auth-foundation";
import { decodeBase64Url, decodeJsonBase64Url, hmacSha256, signaturesEqual } from "@/lib/auth/hmac";
import type { NeonProxyProvider, VerifiedProviderSession } from "@/lib/auth/neon-proxy";
import type { ProviderSessionResult } from "@/lib/auth/request-context";

let cached: { baseUrl: string; secret: string; auth: NeonAuth } | undefined;

/** The provider's session-token cookie; without it no request can be authenticated. */
const NEON_SESSION_TOKEN_COOKIE = "__Secure-neon-auth.session_token";
const NEON_SESSION_DATA_COOKIE = "__Secure-neon-auth.local.session_data";
const BODY_HEADERS = ["content-type", "content-length", "transfer-encoding"] as const;
export const NEON_SESSION_DATA_TTL_SECONDS = 60;
const encoder = new TextEncoder();

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
    cookies: { secret, sessionDataTtl: NEON_SESSION_DATA_TTL_SECONDS, sameSite: "lax" },
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

function cookieValue(cookieHeader: string, name: string): string | undefined {
  for (const cookie of cookieHeader.split(";")) {
    const separator = cookie.indexOf("=");
    if (separator < 0 || cookie.slice(0, separator).trim() !== name) continue;
    return cookie.slice(separator + 1).trim();
  }
  return undefined;
}

/**
 * Validate the same HS256 signature and expiry the SDK will enforce before
 * selecting its cache path. Known misses go straight to one uncached provider
 * check instead of the SDK's two-fetch reactive-mint path.
 */
async function hasValidSessionData(
  cookieHeader: string,
  cookieSecret: string,
  now: Date
): Promise<boolean> {
  const token = cookieValue(cookieHeader, NEON_SESSION_DATA_COOKIE);
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    const [protectedHeader, encodedPayload, encodedSignature] = parts;
    const header = decodeJsonBase64Url(protectedHeader) as { alg?: unknown; typ?: unknown };
    const payload = decodeJsonBase64Url(encodedPayload) as {
      exp?: unknown;
      session?: unknown;
      user?: unknown;
    };
    if (
      header.alg !== "HS256" ||
      header.typ !== "JWT" ||
      typeof payload !== "object" ||
      payload === null ||
      typeof payload.exp !== "number" ||
      payload.exp <= Math.floor(now.getTime() / 1000) ||
      typeof payload.session !== "object" ||
      payload.session === null ||
      typeof payload.user !== "object" ||
      payload.user === null
    ) {
      return false;
    }
    const expected = await hmacSha256(
      `${protectedHeader}.${encodedPayload}`,
      encoder.encode(cookieSecret)
    );
    return signaturesEqual(decodeBase64Url(encodedSignature), expected);
  } catch {
    return false;
  }
}

/** Only ordinary read-only page/RSC requests may use Neon's signed cookie cache. */
export async function shouldUseNeonSessionCookieCache(
  request: Request,
  cookieSecret: string,
  now = new Date()
): Promise<boolean> {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const pathname = new URL(request.url).pathname;
  if (pathname === "/api" || pathname.startsWith("/api/")) return false;
  if (pathname === "/account" || pathname.startsWith("/account/")) return false;
  return hasValidSessionData(request.headers.get("cookie") ?? "", cookieSecret, now);
}

/**
 * Verify the inbound session through the SDK's signed cookie cache for an
 * eligible page/RSC read, or with exactly one uncached provider round trip.
 *
 * Runs the SDK's own `GET /api/auth/get-session` handler (the same code path
 * `src/app/api/auth/[...path]/route.ts` exposes) against a synthetic request
 * that carries the inbound cookies. Uncached requests add
 * `disableCookieCache=true`. The JSON body is the provider session; the
 * `Set-Cookie` headers are the refreshed `session_data` cookie, which the
 * caller forwards to the browser.
 * Mutations, API/account paths, and known cache misses set
 * `disableCookieCache`, so provider-side revocation is observed immediately.
 * An ordinary cached page read may observe revocation up to 60 seconds later.
 */
export async function verifyNeonSession(
  auth: NeonSessionHandlerSource,
  request: Request,
  cookieSecret: string
): Promise<VerifiedProviderSession> {
  const cookieHeader = request.headers.get("cookie") ?? "";
  if (!cookieHeader.includes(NEON_SESSION_TOKEN_COOKIE)) {
    return { session: { data: null, error: null }, headers: new Headers() };
  }

  const headers = new Headers(request.headers);
  for (const name of BODY_HEADERS) headers.delete(name);
  const verificationUrl = new URL("/api/auth/get-session", request.url);
  if (!(await shouldUseNeonSessionCookieCache(request, cookieSecret))) {
    verificationUrl.searchParams.set("disableCookieCache", "true");
  }
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
export function getNeonProxyProvider(): NeonProxyProvider;
export function getNeonProxyProvider(
  auth: NeonSessionHandlerSource,
  cookieSecret: string
): NeonProxyProvider;
export function getNeonProxyProvider(
  auth?: NeonSessionHandlerSource,
  cookieSecret?: string
): NeonProxyProvider {
  if (!auth && !cookieSecret) {
    const environment = process.env;
    const runtimeAuth = getNeonAuthServer(environment);
    const runtimeCookieSecret = environment.NEON_AUTH_COOKIE_SECRET!;
    return {
      verifySession: (request) => verifyNeonSession(runtimeAuth, request, runtimeCookieSecret),
    };
  }
  if (!auth || !cookieSecret) {
    throw new NeonAuthConfigurationError(["NEON_AUTH_COOKIE_SECRET"]);
  }
  return { verifySession: (request) => verifyNeonSession(auth, request, cookieSecret) };
}
