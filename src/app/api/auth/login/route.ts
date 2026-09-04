import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { readAuthEnvironment } from "@/lib/auth/environment";
import { AuthError, errorResponse } from "@/lib/auth/errors";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { requestIp } from "@/lib/auth/request";
import { login } from "@/lib/auth/service";
import { sessionCookieOptions } from "@/lib/auth/session";
import { getRepositorySet } from "@/lib/database";

export async function POST(request: Request): Promise<Response> {
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

    const repositories = await getRepositorySet();
    const token = await login(password, requestIp(request), {
      passwordHash: environment.passwordHash,
      sessionSecret: environment.sessionSecret,
      rateLimits: repositories.rateLimits,
    });
    const response = NextResponse.json({ authenticated: true });
    response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
