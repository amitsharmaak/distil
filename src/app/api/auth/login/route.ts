import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { readAuthEnvironment } from "@/lib/auth/environment";
import { AuthError, errorResponse } from "@/lib/auth/errors";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { requestIp } from "@/lib/auth/request";
import { login } from "@/lib/auth/service";
import { sessionCookieOptions } from "@/lib/auth/session";
import { createAuthContext, requestIdSchema, userIdSchema } from "@/lib/contracts";
import { getTenantRepositories } from "@/lib/database";
import { legacyAuthBridgeAvailable, legacyAuthDisabledResponse } from "@/lib/auth/legacy-bridge";

export async function POST(request: Request): Promise<Response> {
  if (!legacyAuthBridgeAvailable()) return legacyAuthDisabledResponse();
  try {
    const environment = readAuthEnvironment();
    requireAllowedOrigin(request, environment.allowedOrigins);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AuthError("INVALID_REQUEST", 400, "A JSON password is required");
    }
    const password = (body as { password?: unknown })?.password;
    if (typeof password !== "string" || password.length === 0 || password.length > 1024) {
      throw new AuthError("INVALID_REQUEST", 400, "A password is required");
    }

    const userId = userIdSchema.parse(process.env.DISTIL_LEGACY_USER_ID ?? "");
    const parsedRequestId = requestIdSchema.safeParse(request.headers.get("x-trace-id"));
    // The legacy user id is trusted deployment configuration. Bind the
    // pre-authentication rate-limit write to that tenant without granting the
    // runtime role direct access to the base table.
    const loginContext = createAuthContext({
      userId,
      actorKind: "system",
      actorId: userId,
      requestId: parsedRequestId.success
        ? parsedRequestId.data
        : requestIdSchema.parse(crypto.randomUUID()),
    });
    const repositories = await getTenantRepositories(loginContext);
    const token = await login(password, requestIp(request), {
      passwordHash: environment.passwordHash,
      sessionSecret: environment.sessionSecret,
      context: loginContext,
      rateLimits: repositories.rateLimits,
    });
    const response = NextResponse.json({ authenticated: true });
    response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
