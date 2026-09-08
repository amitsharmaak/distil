import { LOGIN_RATE_LIMIT, LOGIN_RATE_LIMIT_WINDOW_SECONDS } from "@/lib/auth/constants";
import { AuthError } from "@/lib/auth/errors";
import { verifyPassword } from "@/lib/auth/password";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { createSessionToken, verifySessionToken } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/contracts";
import type { RateLimitRepository } from "@/lib/repositories/ports";

export interface LoginDependencies {
  passwordHash: string;
  sessionSecret: string;
  context: AuthContext;
  rateLimits: RateLimitRepository;
}

export async function login(
  password: string,
  ip: string,
  dependencies: LoginDependencies,
  now = new Date()
): Promise<string> {
  await enforceRateLimit(dependencies.rateLimits, {
    key: `login:${ip}`,
    context: dependencies.context,
    operation: "login",
    limit: LOGIN_RATE_LIMIT,
    windowSeconds: LOGIN_RATE_LIMIT_WINDOW_SECONDS,
    now,
  });
  if (!dependencies.passwordHash || !(await verifyPassword(password, dependencies.passwordHash))) {
    throw new AuthError("UNAUTHORIZED", 401, "Invalid password");
  }
  return createSessionToken(dependencies.sessionSecret, now);
}

export async function requireSession(
  token: string | undefined,
  sessionSecret: string,
  now = new Date()
): Promise<void> {
  if (!(await verifySessionToken(token, sessionSecret, now))) {
    throw new AuthError("UNAUTHORIZED", 401, "Authentication required");
  }
}
